import { Router } from "express";
import { pool } from "../db.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

const DEFAULT_SETTINGS = {
  nomeEmpresa: "Minha Empresa",
  percentualMaoDeObra: 20,
  percentualPecas: 15,
  validadeOrcamentoDias: 7,
  observacoesPadrao: "Orçamento sujeito à aprovação e disponibilidade de estoque."
};

function normalizarSettings(row) {
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    nomeEmpresa: row.nome_empresa || DEFAULT_SETTINGS.nomeEmpresa,
    percentualMaoDeObra: Number(row.percentual_mao_de_obra ?? DEFAULT_SETTINGS.percentualMaoDeObra),
    percentualPecas: Number(row.percentual_pecas ?? DEFAULT_SETTINGS.percentualPecas),
    validadeOrcamentoDias: Number(row.validade_orcamento_dias ?? DEFAULT_SETTINGS.validadeOrcamentoDias),
    observacoesPadrao:
      row.observacoes_padrao || DEFAULT_SETTINGS.observacoesPadrao
  };
}

router.get("/", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        nome_empresa,
        percentual_mao_de_obra,
        percentual_pecas,
        validade_orcamento_dias,
        observacoes_padrao
      FROM user_settings
      WHERE user_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    return res.json(normalizarSettings(rows[0]));
  } catch (error) {
    console.error("Erro ao carregar configurações:", error);
    return res.status(500).json({ message: "Erro ao carregar configurações." });
  }
});

router.put("/", authRequired, async (req, res) => {
  try {
    const body = req.body || {};

    const nomeEmpresa = String(body.nomeEmpresa || DEFAULT_SETTINGS.nomeEmpresa)
      .trim()
      .slice(0, 150);

    const percentualMaoDeObra = Number(body.percentualMaoDeObra ?? DEFAULT_SETTINGS.percentualMaoDeObra);
    const percentualPecas = Number(body.percentualPecas ?? DEFAULT_SETTINGS.percentualPecas);
    const validadeOrcamentoDias = Number(body.validadeOrcamentoDias ?? DEFAULT_SETTINGS.validadeOrcamentoDias);
    const observacoesPadrao = String(
      body.observacoesPadrao || DEFAULT_SETTINGS.observacoesPadrao
    );

    if (Number.isNaN(percentualMaoDeObra) || percentualMaoDeObra < 0) {
      return res.status(400).json({ message: "Percentual da mão de obra inválido." });
    }

    if (Number.isNaN(percentualPecas) || percentualPecas < 0) {
      return res.status(400).json({ message: "Percentual das peças inválido." });
    }

    if (Number.isNaN(validadeOrcamentoDias) || validadeOrcamentoDias < 1) {
      return res.status(400).json({ message: "Validade do orçamento inválida." });
    }

    await pool.execute(
      `
      INSERT INTO user_settings (
        user_id,
        nome_empresa,
        percentual_mao_de_obra,
        percentual_pecas,
        validade_orcamento_dias,
        observacoes_padrao,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        nome_empresa = VALUES(nome_empresa),
        percentual_mao_de_obra = VALUES(percentual_mao_de_obra),
        percentual_pecas = VALUES(percentual_pecas),
        validade_orcamento_dias = VALUES(validade_orcamento_dias),
        observacoes_padrao = VALUES(observacoes_padrao),
        updated_at = NOW()
      `,
      [
        req.user.id,
        nomeEmpresa,
        percentualMaoDeObra,
        percentualPecas,
        validadeOrcamentoDias,
        observacoesPadrao
      ]
    );

    const [rows] = await pool.execute(
      `
      SELECT
        nome_empresa,
        percentual_mao_de_obra,
        percentual_pecas,
        validade_orcamento_dias,
        observacoes_padrao
      FROM user_settings
      WHERE user_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    return res.json(normalizarSettings(rows[0]));
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    return res.status(500).json({ message: "Erro ao salvar configurações." });
  }
});

export default router;