import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import {
  buildPixPayload,
  buildPixQrCodeUrl,
  formatAmountFromCents,
  generatePixTxId,
  sanitizePixKey,
  sanitizePixKeyType
} from '../utils/pix.js';
import { sendWelcomeAccessEmail } from '../services/smtp.js';

const router = Router();

const DEFAULT_CHECKOUT_CONFIG = {
  checkoutEnabled: true,
  checkoutHeadline: 'Assine agora e envie seus orçamentos com mais profissionalismo',
  checkoutDescription:
    'Preencha seu e-mail, pague via PIX e envie o comprovante. Após a conferência, seu acesso será liberado.',
  checkoutButtonLabel: 'Assinar agora via PIX',
  planName: 'Plano Profissional',
  planPrice: 'R$ 119,90',
  planAmountCents: 11990,
  pixKeyType: 'email',
  pixKey: '',
  pixBeneficiaryName: 'Orça Feito',
  pixCity: 'SAO JOSE DO RIO PRETO',
  pixDescription: 'Assinatura Orça Feito',
  appLink: 'https://app.orcafeito.com.br',
  supportEmail: ''
};

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function sanitizeWhatsapp(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 20);
}

function normalizeBoolean(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function sanitizeText(value = '', maxLength = 255) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function parseAmountCents(value) {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return DEFAULT_CHECKOUT_CONFIG.planAmountCents;
  }

  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_CHECKOUT_CONFIG.planAmountCents;
  }

  return Math.round(amount * 100);
}

function formatCurrency(amountCents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(amountCents || 0) / 100);
}

function normalizeCheckoutConfig(row) {
  const amountCents = parseAmountCents(row?.plan_amount || DEFAULT_CHECKOUT_CONFIG.planAmountCents / 100);
  const pixKeyType = sanitizePixKeyType(row?.pix_key_type || DEFAULT_CHECKOUT_CONFIG.pixKeyType);
  const pixKey = sanitizePixKey(row?.pix_key || DEFAULT_CHECKOUT_CONFIG.pixKey, pixKeyType);

  return {
    checkoutEnabled: normalizeBoolean(row?.checkout_enabled, DEFAULT_CHECKOUT_CONFIG.checkoutEnabled),
    checkoutHeadline: sanitizeText(
      row?.checkout_headline || DEFAULT_CHECKOUT_CONFIG.checkoutHeadline,
      160
    ),
    checkoutDescription: sanitizeText(
      row?.checkout_description || DEFAULT_CHECKOUT_CONFIG.checkoutDescription,
      500
    ),
    checkoutButtonLabel: sanitizeText(
      row?.checkout_button_label || DEFAULT_CHECKOUT_CONFIG.checkoutButtonLabel,
      80
    ),
    planName: sanitizeText(row?.plan_name || DEFAULT_CHECKOUT_CONFIG.planName, 100),
    planPrice: formatCurrency(amountCents),
    planAmountCents: amountCents,
    pixKeyType,
    pixKey,
    pixBeneficiaryName: sanitizeText(
      row?.pix_beneficiary_name || DEFAULT_CHECKOUT_CONFIG.pixBeneficiaryName,
      100
    ),
    pixCity: sanitizeText(row?.pix_city || DEFAULT_CHECKOUT_CONFIG.pixCity, 100),
    pixDescription: sanitizeText(
      row?.pix_description || DEFAULT_CHECKOUT_CONFIG.pixDescription,
      120
    ),
    appLink: sanitizeText(row?.app_link || DEFAULT_CHECKOUT_CONFIG.appLink, 255),
    supportEmail: sanitizeText(row?.support_email || DEFAULT_CHECKOUT_CONFIG.supportEmail, 150)
  };
}

async function getLandingCheckoutRow(connection = pool) {
  const [rows] = await connection.execute(
    `
    SELECT
      app_link,
      plan_name,
      plan_price,
      checkout_enabled,
      checkout_headline,
      checkout_description,
      checkout_button_label,
      plan_amount,
      pix_key_type,
      pix_key,
      pix_beneficiary_name,
      pix_city,
      pix_description,
      support_email
    FROM landing_settings
    WHERE id = 1
    LIMIT 1
    `
  );

  return rows[0] || null;
}

function buildPurchaseResponse(item, config) {
  return {
    id: item.id,
    email: item.email,
    fullName: item.full_name,
    whatsapp: item.whatsapp,
    status: item.status,
    planName: item.plan_name,
    planPrice: formatCurrency(item.amount_cents),
    amountCents: item.amount_cents,
    pixCopyPaste: item.pix_payload,
    pixQrCodeUrl: buildPixQrCodeUrl(item.pix_payload),
    instructions: config.checkoutDescription,
    createdAt: item.created_at,
    receiptSentAt: item.receipt_sent_at,
    receiptName: item.receipt_name,
    receiptMimeType: item.receipt_mime_type,
    protocol: `OF-${String(item.id).padStart(6, '0')}`
  };
}

function generateTemporaryPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += chars[bytes[index] % chars.length];
  }

  return output;
}

function mapPurchaseItem(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    whatsapp: row.whatsapp,
    status: row.status,
    plan_name: row.plan_name,
    amount_cents: row.amount_cents,
    pix_payload: row.pix_payload,
    pix_txid: row.pix_txid,
    receipt_name: row.receipt_name,
    receipt_mime_type: row.receipt_mime_type,
    receipt_base64: row.receipt_base64,
    created_at: row.created_at,
    receipt_sent_at: row.receipt_sent_at,
    approved_at: row.approved_at,
    rejected_at: row.rejected_at,
    approved_by: row.approved_by,
    user_id: row.user_id,
    review_notes: row.review_notes
  };
}

router.get('/config', async (req, res) => {
  try {
    const config = normalizeCheckoutConfig(await getLandingCheckoutRow());

    return res.json({
      checkoutEnabled: config.checkoutEnabled,
      checkoutHeadline: config.checkoutHeadline,
      checkoutDescription: config.checkoutDescription,
      checkoutButtonLabel: config.checkoutButtonLabel,
      planName: config.planName,
      planPrice: config.planPrice,
      supportEmail: config.supportEmail
    });
  } catch (error) {
    console.error('Erro ao carregar configuração do checkout:', error);
    return res.status(500).json({ message: 'Erro ao carregar checkout.' });
  }
});

router.post('/intents', async (req, res) => {
  try {
    const { email, fullName = '', whatsapp = '' } = req.body || {};
    const cleanEmail = sanitizeText(email, 190).toLowerCase();
    const cleanFullName = sanitizeText(fullName, 150);
    const cleanWhatsapp = sanitizeWhatsapp(whatsapp);

    if (!emailValido(cleanEmail)) {
      return res.status(400).json({ message: 'Informe um e-mail válido para liberar o acesso.' });
    }

    const [existingUsers] = await pool.execute(
      'SELECT id, is_active FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: existingUsers[0].is_active
          ? 'Este e-mail já possui acesso ao app.'
          : 'Este e-mail já está cadastrado, mas o usuário está inativo.'
      });
    }

    const config = normalizeCheckoutConfig(await getLandingCheckoutRow());

    if (!config.checkoutEnabled) {
      return res.status(403).json({ message: 'O checkout está desativado no momento.' });
    }

    if (!config.pixKey) {
      return res.status(503).json({
        message: 'A chave PIX ainda não foi configurada no painel administrativo.'
      });
    }

    const txid = generatePixTxId('ORCAFEITO');
    const pixPayload = buildPixPayload({
      key: config.pixKey,
      beneficiaryName: config.pixBeneficiaryName,
      city: config.pixCity,
      amountCents: config.planAmountCents,
      description: config.pixDescription,
      txid
    });

    const [result] = await pool.execute(
      `
      INSERT INTO purchase_intents (
        email,
        full_name,
        whatsapp,
        plan_name,
        amount_cents,
        pix_payload,
        pix_txid,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting_payment', NOW(), NOW())
      `,
      [
        cleanEmail,
        cleanFullName || null,
        cleanWhatsapp || null,
        config.planName,
        config.planAmountCents,
        pixPayload,
        txid
      ]
    );

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM purchase_intents
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json(buildPurchaseResponse(mapPurchaseItem(rows[0]), config));
  } catch (error) {
    console.error('Erro ao criar intenção de compra:', error);
    return res.status(500).json({ message: 'Erro ao iniciar o checkout.' });
  }
});

router.post('/intents/:id/receipt', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { receiptBase64 = '', receiptName = '', receiptMimeType = '' } = req.body || {};

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID do checkout inválido.' });
    }

    const cleanBase64 = String(receiptBase64 || '').trim();
    const cleanName = sanitizeText(receiptName, 255);
    const cleanMimeType = sanitizeText(receiptMimeType, 100);

    if (!cleanBase64 || !cleanName) {
      return res.status(400).json({ message: 'Envie o comprovante para concluir a solicitação.' });
    }

    if (cleanBase64.length > 4_500_000) {
      return res.status(400).json({
        message: 'O comprovante está muito grande. Envie um arquivo de até 3 MB.'
      });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM purchase_intents WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Solicitação de compra não encontrada.' });
    }

    const current = mapPurchaseItem(rows[0]);

    if (current.status === 'approved') {
      return res.status(400).json({ message: 'Esta solicitação já foi aprovada.' });
    }

    await pool.execute(
      `
      UPDATE purchase_intents
      SET
        receipt_name = ?,
        receipt_mime_type = ?,
        receipt_base64 = ?,
        receipt_sent_at = NOW(),
        status = 'receipt_sent',
        updated_at = NOW()
      WHERE id = ?
      `,
      [cleanName, cleanMimeType || null, cleanBase64, id]
    );

    return res.json({
      message: 'Comprovante enviado com sucesso. Agora é só aguardar a conferência.',
      protocol: `OF-${String(id).padStart(6, '0')}`
    });
  } catch (error) {
    console.error('Erro ao enviar comprovante:', error);
    return res.status(500).json({ message: 'Erro ao enviar comprovante.' });
  }
});

router.get('/admin/intents', authRequired, adminRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        pi.*,
        u.email AS user_email,
        approver.email AS approved_by_email
      FROM purchase_intents pi
      LEFT JOIN users u ON u.id = pi.user_id
      LEFT JOIN users approver ON approver.id = pi.approved_by
      ORDER BY
        CASE pi.status
          WHEN 'receipt_sent' THEN 0
          WHEN 'waiting_payment' THEN 1
          WHEN 'rejected' THEN 2
          WHEN 'approved' THEN 3
          ELSE 4
        END,
        pi.created_at DESC
      `
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        whatsapp: row.whatsapp,
        planName: row.plan_name,
        planPrice: formatCurrency(row.amount_cents),
        amountCents: row.amount_cents,
        status: row.status,
        protocol: `OF-${String(row.id).padStart(6, '0')}`,
        createdAt: row.created_at,
        receiptSentAt: row.receipt_sent_at,
        receiptName: row.receipt_name,
        receiptMimeType: row.receipt_mime_type,
        receiptBase64: row.receipt_base64,
        reviewNotes: row.review_notes,
        approvedAt: row.approved_at,
        rejectedAt: row.rejected_at,
        approvedByEmail: row.approved_by_email,
        userEmail: row.user_email
      }))
    );
  } catch (error) {
    console.error('Erro ao listar intenções de compra:', error);
    return res.status(500).json({ message: 'Erro ao listar as compras pendentes.' });
  }
});

router.post('/admin/intents/:id/approve', authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const connection = await pool.getConnection();

  let approvedEmail = '';
  let approvedPassword = '';
  let approvedAppLink = '';
  let purchaseId = 0;
  let approvalNotes = '';

  try {
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    approvalNotes = sanitizeText(
      req.body?.notes || 'Pagamento conferido e acesso liberado.',
      500
    );

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM purchase_intents WHERE id = ? LIMIT 1 FOR UPDATE',
      [id]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Solicitação não encontrada.' });
    }

    const item = mapPurchaseItem(rows[0]);

    if (item.status === 'approved') {
      await connection.rollback();
      return res.status(400).json({ message: 'Esta solicitação já foi aprovada.' });
    }

    if (!item.receipt_base64) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Ainda não há comprovante enviado para esta compra.'
      });
    }

    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [item.email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const password = generateTemporaryPassword(10);
    const passwordHash = await bcrypt.hash(password, 12);
    const config = normalizeCheckoutConfig(await getLandingCheckoutRow(connection));

    const [insertResult] = await connection.execute(
      `
      INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, 'user', 1, NOW(), NOW())
      `,
      [item.email, passwordHash]
    );

    await connection.execute(
      `
      UPDATE purchase_intents
      SET
        status = 'approved',
        approved_at = NOW(),
        approved_by = ?,
        user_id = ?,
        review_notes = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [req.user.id, insertResult.insertId, approvalNotes, id]
    );

    await connection.commit();

    approvedEmail = item.email;
    approvedPassword = password;
    approvedAppLink = config.appLink;
    purchaseId = id;
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao aprovar compra:', error);
    return res.status(500).json({
      message: error.message || 'Erro ao aprovar a compra.'
    });
  } finally {
    connection.release();
  }

  try {
    await sendWelcomeAccessEmail({
      to: approvedEmail,
      password: approvedPassword,
      appLink: approvedAppLink
    });

    return res.json({
      message: 'Compra aprovada, usuário criado e acessos enviados por e-mail.',
      email: approvedEmail,
      emailSent: true
    });
  } catch (error) {
    console.error('Erro ao enviar e-mail de acesso após aprovação:', error);

    try {
      await pool.execute(
        `
        UPDATE purchase_intents
        SET
          review_notes = ?,
          updated_at = NOW()
        WHERE id = ?
        `,
        [
          sanitizeText(
            `${approvalNotes} | Usuário criado e compra aprovada, mas o envio do e-mail falhou. Verifique o SMTP.`,
            500
          ),
          purchaseId
        ]
      );
    } catch (updateError) {
      console.error('Erro ao atualizar observação após falha no e-mail:', updateError);
    }

    return res.status(200).json({
      message:
        'Compra aprovada e usuário criado, mas o envio do e-mail falhou. Verifique o SMTP para reenviar o acesso.',
      email: approvedEmail,
      emailSent: false
    });
  }
});

router.post('/admin/intents/:id/reject', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reason = sanitizeText(
      req.body?.reason || 'Comprovante rejeitado. Solicite um novo envio.',
      500
    );

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, status FROM purchase_intents WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Solicitação não encontrada.' });
    }

    if (rows[0].status === 'approved') {
      return res.status(400).json({ message: 'Não é possível rejeitar uma compra já aprovada.' });
    }

    await pool.execute(
      `
      UPDATE purchase_intents
      SET
        status = 'rejected',
        rejected_at = NOW(),
        review_notes = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [reason, id]
    );

    return res.json({ message: 'Compra marcada como rejeitada.' });
  } catch (error) {
    console.error('Erro ao rejeitar compra:', error);
    return res.status(500).json({ message: 'Erro ao rejeitar a compra.' });
  }
});

export default router;