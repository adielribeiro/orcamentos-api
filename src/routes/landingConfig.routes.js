import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { sanitizePixKey, sanitizePixKeyType } from '../utils/pix.js';

const router = Router();

const DEFAULT_LANDING_CONFIG = {
  brandName: 'Orça Feito',
  appLink: 'https://app.orcafeito.com.br',
  whatsappNumber: '5517981686253',
  whatsappMessage: 'Olá, quero conhecer o sistema de orçamentos.',
  pricingChip: 'Plano único',
  planName: 'Plano Profissional',
  planPrice: 'R$ 119,90',
  planDescription:
    'Tudo o que você precisa para criar, salvar e enviar orçamentos com mais rapidez e profissionalismo.',
  checkoutEnabled: true,
  checkoutHeadline: 'Assine agora e envie seus orçamentos com mais profissionalismo',
  checkoutDescription:
    'Preencha seu e-mail, gere o PIX copia e cola ou QR Code e envie o comprovante para liberar o acesso.',
  checkoutButtonLabel: 'Assinar agora via PIX',
  planAmount: '119,90',
  pixKeyType: 'email',
  pixKey: '',
  pixBeneficiaryName: 'Orça Feito',
  pixCity: 'SAO JOSE DO RIO PRETO',
  pixDescription: 'Assinatura Orça Feito',
  supportEmail: ''
};

function sanitizeWhatsappNumber(value = '') {
  return String(value).replace(/\D/g, '');
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

function normalizeLandingConfig(row) {
  if (!row) {
    return { ...DEFAULT_LANDING_CONFIG };
  }

  const pixKeyType = sanitizePixKeyType(row.pix_key_type || DEFAULT_LANDING_CONFIG.pixKeyType);

  return {
    brandName: row.brand_name || DEFAULT_LANDING_CONFIG.brandName,
    appLink: row.app_link || DEFAULT_LANDING_CONFIG.appLink,
    whatsappNumber: sanitizeWhatsappNumber(
      row.whatsapp_number || DEFAULT_LANDING_CONFIG.whatsappNumber
    ),
    whatsappMessage: row.whatsapp_message || DEFAULT_LANDING_CONFIG.whatsappMessage,
    pricingChip: row.pricing_chip || DEFAULT_LANDING_CONFIG.pricingChip,
    planName: row.plan_name || DEFAULT_LANDING_CONFIG.planName,
    planPrice: row.plan_price || DEFAULT_LANDING_CONFIG.planPrice,
    planDescription: row.plan_description || DEFAULT_LANDING_CONFIG.planDescription,
    checkoutEnabled: normalizeBoolean(row.checkout_enabled, DEFAULT_LANDING_CONFIG.checkoutEnabled),
    checkoutHeadline: row.checkout_headline || DEFAULT_LANDING_CONFIG.checkoutHeadline,
    checkoutDescription: row.checkout_description || DEFAULT_LANDING_CONFIG.checkoutDescription,
    checkoutButtonLabel: row.checkout_button_label || DEFAULT_LANDING_CONFIG.checkoutButtonLabel,
    planAmount: row.plan_amount || DEFAULT_LANDING_CONFIG.planAmount,
    pixKeyType,
    pixKey: sanitizePixKey(row.pix_key || DEFAULT_LANDING_CONFIG.pixKey, pixKeyType),
    pixBeneficiaryName: row.pix_beneficiary_name || DEFAULT_LANDING_CONFIG.pixBeneficiaryName,
    pixCity: row.pix_city || DEFAULT_LANDING_CONFIG.pixCity,
    pixDescription: row.pix_description || DEFAULT_LANDING_CONFIG.pixDescription,
    supportEmail: row.support_email || DEFAULT_LANDING_CONFIG.supportEmail
  };
}

async function getLandingConfigRow() {
  const [rows] = await pool.execute(
    `
    SELECT
      brand_name,
      app_link,
      whatsapp_number,
      whatsapp_message,
      pricing_chip,
      plan_name,
      plan_price,
      plan_description,
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
      support_email,
      updated_at
    FROM landing_settings
    WHERE id = 1
    LIMIT 1
    `
  );

  return rows[0] || null;
}

router.get('/', async (req, res) => {
  try {
    const row = await getLandingConfigRow();
    return res.json(normalizeLandingConfig(row));
  } catch (error) {
    console.error('Erro ao carregar configurações da landing:', error);
    return res.status(500).json({ message: 'Erro ao carregar configurações da landing.' });
  }
});

router.put('/', authRequired, adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const pixKeyType = sanitizePixKeyType(body.pixKeyType || DEFAULT_LANDING_CONFIG.pixKeyType);

    const payload = {
      brandName: sanitizeText(body.brandName || DEFAULT_LANDING_CONFIG.brandName, 100),
      appLink: sanitizeText(body.appLink || DEFAULT_LANDING_CONFIG.appLink, 255),
      whatsappNumber: sanitizeWhatsappNumber(
        body.whatsappNumber || DEFAULT_LANDING_CONFIG.whatsappNumber
      ).slice(0, 20),
      whatsappMessage: sanitizeText(
        body.whatsappMessage || DEFAULT_LANDING_CONFIG.whatsappMessage,
        500
      ),
      pricingChip: sanitizeText(body.pricingChip || DEFAULT_LANDING_CONFIG.pricingChip, 80),
      planName: sanitizeText(body.planName || DEFAULT_LANDING_CONFIG.planName, 100),
      planPrice: sanitizeText(body.planPrice || DEFAULT_LANDING_CONFIG.planPrice, 80),
      planDescription: sanitizeText(
        body.planDescription || DEFAULT_LANDING_CONFIG.planDescription,
        1000
      ),
      checkoutEnabled: normalizeBoolean(body.checkoutEnabled, DEFAULT_LANDING_CONFIG.checkoutEnabled),
      checkoutHeadline: sanitizeText(
        body.checkoutHeadline || DEFAULT_LANDING_CONFIG.checkoutHeadline,
        160
      ),
      checkoutDescription: sanitizeText(
        body.checkoutDescription || DEFAULT_LANDING_CONFIG.checkoutDescription,
        500
      ),
      checkoutButtonLabel: sanitizeText(
        body.checkoutButtonLabel || DEFAULT_LANDING_CONFIG.checkoutButtonLabel,
        80
      ),
      planAmount: sanitizeText(body.planAmount || DEFAULT_LANDING_CONFIG.planAmount, 20),
      pixKeyType,
      pixKey: sanitizePixKey(body.pixKey || DEFAULT_LANDING_CONFIG.pixKey, pixKeyType).slice(0, 150),
      pixBeneficiaryName: sanitizeText(
        body.pixBeneficiaryName || DEFAULT_LANDING_CONFIG.pixBeneficiaryName,
        100
      ),
      pixCity: sanitizeText(body.pixCity || DEFAULT_LANDING_CONFIG.pixCity, 100),
      pixDescription: sanitizeText(
        body.pixDescription || DEFAULT_LANDING_CONFIG.pixDescription,
        120
      ),
      supportEmail: sanitizeText(body.supportEmail || DEFAULT_LANDING_CONFIG.supportEmail, 150)
    };

    if (!payload.brandName) {
      return res.status(400).json({ message: 'Nome da marca é obrigatório.' });
    }

    if (!payload.appLink) {
      return res.status(400).json({ message: 'Link do app é obrigatório.' });
    }

    if (!payload.whatsappNumber) {
      return res.status(400).json({ message: 'Número do WhatsApp é obrigatório.' });
    }

    if (!payload.planPrice) {
      return res.status(400).json({ message: 'Preço do plano é obrigatório.' });
    }

    await pool.execute(
      `
      INSERT INTO landing_settings (
        id,
        brand_name,
        app_link,
        whatsapp_number,
        whatsapp_message,
        pricing_chip,
        plan_name,
        plan_price,
        plan_description,
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
        support_email,
        updated_at
      )
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        brand_name = VALUES(brand_name),
        app_link = VALUES(app_link),
        whatsapp_number = VALUES(whatsapp_number),
        whatsapp_message = VALUES(whatsapp_message),
        pricing_chip = VALUES(pricing_chip),
        plan_name = VALUES(plan_name),
        plan_price = VALUES(plan_price),
        plan_description = VALUES(plan_description),
        checkout_enabled = VALUES(checkout_enabled),
        checkout_headline = VALUES(checkout_headline),
        checkout_description = VALUES(checkout_description),
        checkout_button_label = VALUES(checkout_button_label),
        plan_amount = VALUES(plan_amount),
        pix_key_type = VALUES(pix_key_type),
        pix_key = VALUES(pix_key),
        pix_beneficiary_name = VALUES(pix_beneficiary_name),
        pix_city = VALUES(pix_city),
        pix_description = VALUES(pix_description),
        support_email = VALUES(support_email),
        updated_at = NOW()
      `,
      [
        payload.brandName,
        payload.appLink,
        payload.whatsappNumber,
        payload.whatsappMessage,
        payload.pricingChip,
        payload.planName,
        payload.planPrice,
        payload.planDescription,
        payload.checkoutEnabled ? 1 : 0,
        payload.checkoutHeadline,
        payload.checkoutDescription,
        payload.checkoutButtonLabel,
        payload.planAmount,
        payload.pixKeyType,
        payload.pixKey,
        payload.pixBeneficiaryName,
        payload.pixCity,
        payload.pixDescription,
        payload.supportEmail
      ]
    );

    const row = await getLandingConfigRow();
    return res.json(normalizeLandingConfig(row));
  } catch (error) {
    console.error('Erro ao salvar configurações da landing:', error);
    return res.status(500).json({ message: 'Erro ao salvar configurações da landing.' });
  }
});

export default router;