import { Router } from "express";
import { pool } from "../db.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

function parseJsonSeguro(valor) {
  try {
    if (!valor) return {};
    return typeof valor === "string" ? JSON.parse(valor) : valor;
  } catch {
    return {};
  }
}

router.get("/", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, client_name, total_final, data_json, created_at
      FROM quotes
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    const quotes = rows.map((row) => {
      const data = parseJsonSeguro(row.data_json);

      return {
        ...data,
        id: row.id,
        cliente: data.cliente || row.client_name,
        dataCriacao: row.created_at
      };
    });

    return res.json(quotes);
  } catch (error) {
    console.error("Erro ao carregar orçamentos:", error);
    return res.status(500).json({
      message: "Erro ao carregar orçamentos.",
      error: error.message
    });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const quote = req.body || {};

    if (!quote) {
      return res.status(400).json({ message: "Dados do orçamento não enviados." });
    }

    const clientName = String(quote?.cliente || "Sem nome").trim().slice(0, 150);
    const totalFinal = Number(quote?.totais?.totalFinal || 0);

    if (Number.isNaN(totalFinal)) {
      return res.status(400).json({ message: "Total do orçamento inválido." });
    }

    const payloadJson = JSON.stringify(quote);

    const [result] = await pool.execute(
      `
      INSERT INTO quotes (user_id, client_name, total_final, data_json)
      VALUES (?, ?, ?, ?)
      `,
      [req.user.id, clientName, totalFinal, payloadJson]
    );

    const insertId = result.insertId;

    const [rows] = await pool.execute(
      `
      SELECT id, client_name, total_final, data_json, created_at
      FROM quotes
      WHERE id = ? AND user_id = ?
      LIMIT 1
      `,
      [insertId, req.user.id]
    );

    if (!rows.length) {
      return res.status(500).json({
        message: "Orçamento salvo, mas não foi possível retornar os dados."
      });
    }

    const row = rows[0];
    const data = parseJsonSeguro(row.data_json);

    return res.status(201).json({
      ...data,
      id: row.id,
      cliente: data.cliente || row.client_name,
      dataCriacao: row.created_at
    });
  } catch (error) {
    console.error("Erro ao salvar orçamento:", error);
    return res.status(500).json({
      message: "Erro ao salvar orçamento.",
      error: error.message
    });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    await pool.execute(
      "DELETE FROM quotes WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );

    return res.json({ message: "Orçamento removido com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir orçamento:", error);
    return res.status(500).json({
      message: "Erro ao excluir orçamento.",
      error: error.message
    });
  }
});

export default router;