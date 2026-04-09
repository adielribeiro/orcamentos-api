import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { pool } from "../db.js";
import { authRequired } from "../middleware/auth.js";

dotenv.config();

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }

    const [rows] = await pool.execute(
      `
      SELECT id, email, password_hash, role, is_active
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "E-mail ou senha inválidos." });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: "Usuário desativado." });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ message: "E-mail ou senha inválidos." });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
      }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: !!user.is_active
      }
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ message: "Erro ao fazer login." });
  }
});

router.get("/me", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, email, role, is_active
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    const user = rows[0];

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: !!user.is_active
      }
    });
  } catch (error) {
    console.error("Erro ao carregar usuário:", error);
    return res.status(500).json({ message: "Erro ao carregar usuário." });
  }
});

export default router;