import { Router } from "express";
import { pool } from "../db.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

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
      const data = typeof row.data_json === "string"
        ? JSON.parse(row.data_json)
        : row.data_json;

      return {
        ...data,
        id: row.id,
        cliente: data.cliente || row.client_name,
        dataCriacao: row.created_at
      };
    });

    return res.json(quotes);
  } catch {
    return res.status(500).json({ message: "Erro ao carregar orçamentos." });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const quote = req.body;

    const clientName = quote?.cliente?.trim() || "Sem nome";
    const totalFinal = Number(quote?.totais?.totalFinal || 0);

    await pool.execute(
      `
      INSERT INTO quotes (user_id, client_name, total_final, data_json)
      VALUES (?, ?, ?, ?)
      `,
      [
        req.user.id,
        clientName,
        totalFinal,
        JSON.stringify(quote)
      ]
    );

    const [rows] = await pool.execute(
      `
      SELECT id, client_name, total_final, data_json, created_at
      FROM quotes
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [req.user.id]
    );

    const row = rows[0];
    const data = typeof row.data_json === "string"
      ? JSON.parse(row.data_json)
      : row.data_json;

    return res.status(201).json({
      ...data,
      id: row.id,
      cliente: data.cliente || row.client_name,
      dataCriacao: row.created_at
    });
  } catch {
    return res.status(500).json({ message: "Erro ao salvar orçamento." });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);

    await pool.execute(
      "DELETE FROM quotes WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );

    return res.json({ message: "Orçamento removido com sucesso." });
  } catch {
    return res.status(500).json({ message: "Erro ao excluir orçamento." });
  }
});

export default router;