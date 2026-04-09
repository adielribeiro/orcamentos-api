import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { authRequired, adminRequired } from "../middleware/auth.js";

const router = Router();

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function roleValido(role) {
  return ["admin", "user"].includes(role);
}

router.get("/users", authRequired, adminRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, email, role, is_active, created_at, updated_at
      FROM users
      ORDER BY email ASC
      `
    );

    const users = rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.json(users);
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return res.status(500).json({ message: "Erro ao listar usuários." });
  }
});

router.post("/users", authRequired, adminRequired, async (req, res) => {
  try {
    const { email, password, role = "user" } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }

    if (!emailValido(email)) {
      return res.status(400).json({ message: "E-mail inválido." });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "A senha deve ter pelo menos 6 caracteres." });
    }

    if (!roleValido(role)) {
      return res.status(400).json({ message: "Perfil inválido." });
    }

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Este e-mail já está cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES (?, ?, ?, 1)
      `,
      [email, passwordHash, role]
    );

    const [rows] = await pool.execute(
      `
      SELECT id, email, role, is_active, created_at, updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    const user = rows[0];

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: !!user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    return res.status(500).json({ message: "Erro ao criar usuário." });
  }
});

router.patch("/users/:id/password", authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { password } = req.body || {};

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "A senha deve ter pelo menos 6 caracteres." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

   await pool.execute(
        `
        UPDATE users
        SET password_hash = ?, updated_at = NOW()
        WHERE id = ?
        `,
        [passwordHash, id]
    );

    return res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({ message: "Erro ao alterar senha." });
  }
});

router.patch("/users/:id/status", authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body || {};

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Status inválido." });
    }

    if (req.user.id === id && isActive === false) {
      return res.status(400).json({ message: "Você não pode desativar seu próprio usuário." });
    }

    await pool.execute(
        `
        UPDATE users
        SET is_active = ?, updated_at = NOW()
        WHERE id = ?
        `,
        [isActive ? 1 : 0, id]
    );

    return res.json({ message: "Status atualizado com sucesso." });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return res.status(500).json({ message: "Erro ao atualizar status." });
  }
});

export default router;