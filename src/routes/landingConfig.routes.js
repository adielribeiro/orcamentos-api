import { Router } from "express";
import { pool } from "../db.js";
import { authRequired, adminRequired } from "../middleware/auth.js";

const router = Router();

const DEFAULT_LANDING_CONFIG = {
  brandName: "Orça Feito",
  appLink: "https://app.orcafeito.com.br",
  whatsappNumber: "5517981686253",
  whatsappMessage: "Olá, quero conhecer o sistema de orçamentos.",
  pricingChip: "Plano único",
  planName: "Plano Profissional",
  planPrice: "R$ 119,90",
  planDescription:
    "Tudo o que você precisa para criar, salvar e enviar orçamentos com mais rapidez e profissionalismo."
};

function sanitizeWhatsappNumber(value = "") {
  return String(value).replace(/\D/g, "");
}

function normalizeLandingConfig(row) {
  if (!row) {
    return { ...DEFAULT_LANDING_CONFIG };
  }

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
    planDescription: row.plan_description || DEFAULT_LANDING_CONFIG.planDescription
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
      updated_at
    FROM landing_settings
    WHERE id = 1
    LIMIT 1
    `
  );

  return rows[0] || null;
}

router.get("/", async (req, res) => {
  try {
    const row = await getLandingConfigRow();
    return res.json(normalizeLandingConfig(row));
  } catch (error) {
    console.error("Erro ao carregar configurações da landing:", error);
    return res.status(500).json({ message: "Erro ao carregar configurações da landing." });
  }
});

router.put("/", authRequired, adminRequired, async (req, res) => {
  try {
    const body = req.body || {};

    const payload = {
      brandName: String(body.brandName || DEFAULT_LANDING_CONFIG.brandName).trim().slice(0, 100),
      appLink: String(body.appLink || DEFAULT_LANDING_CONFIG.appLink).trim().slice(0, 255),
      whatsappNumber: sanitizeWhatsappNumber(
        body.whatsappNumber || DEFAULT_LANDING_CONFIG.whatsappNumber
      ).slice(0, 20),
      whatsappMessage: String(
        body.whatsappMessage || DEFAULT_LANDING_CONFIG.whatsappMessage
      ).trim().slice(0, 500),
      pricingChip: String(body.pricingChip || DEFAULT_LANDING_CONFIG.pricingChip)
        .trim()
        .slice(0, 80),
      planName: String(body.planName || DEFAULT_LANDING_CONFIG.planName).trim().slice(0, 100),
      planPrice: String(body.planPrice || DEFAULT_LANDING_CONFIG.planPrice).trim().slice(0, 80),
      planDescription: String(
        body.planDescription || DEFAULT_LANDING_CONFIG.planDescription
      ).trim().slice(0, 1000)
    };

    if (!payload.brandName) {
      return res.status(400).json({ message: "Nome da marca é obrigatório." });
    }

    if (!payload.appLink) {
      return res.status(400).json({ message: "Link do app é obrigatório." });
    }

    if (!payload.whatsappNumber) {
      return res.status(400).json({ message: "Número do WhatsApp é obrigatório." });
    }

    if (!payload.planPrice) {
      return res.status(400).json({ message: "Preço do plano é obrigatório." });
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
        updated_at
      )
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        brand_name = VALUES(brand_name),
        app_link = VALUES(app_link),
        whatsapp_number = VALUES(whatsapp_number),
        whatsapp_message = VALUES(whatsapp_message),
        pricing_chip = VALUES(pricing_chip),
        plan_name = VALUES(plan_name),
        plan_price = VALUES(plan_price),
        plan_description = VALUES(plan_description),
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
        payload.planDescription
      ]
    );

    const row = await getLandingConfigRow();
    return res.json(normalizeLandingConfig(row));
  } catch (error) {
    console.error("Erro ao salvar configurações da landing:", error);
    return res.status(500).json({ message: "Erro ao salvar configurações da landing." });
  }
});

export default router;