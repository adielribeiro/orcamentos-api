import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import quotesRoutes from "./routes/quotes.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import settingsRoutes from "./routes/settings.routes.js";

dotenv.config();

const app = express();

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/\/+$/, "");
}

const envOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const fallbackOrigins = [
  "https://app.orcafeito.com.br",
  "http://localhost:5173",
];

const allowedOrigins = envOrigins.length > 0 ? envOrigins : fallbackOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);

    console.log("[CORS] Origin recebida:", origin);
    console.log("[CORS] Origin normalizada:", normalizedOrigin);
    console.log("[CORS] Origins permitidas:", allowedOrigins);

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  return res.status(200).json({
    ok: true,
    frontendUrlRaw: process.env.FRONTEND_URL || null,
    allowedOrigins,
    originReceived: req.headers.origin || null,
  });
});

app.use("/auth", authRoutes);
app.use("/quotes", quotesRoutes);
app.use("/admin", adminRoutes);
app.use("/settings", settingsRoutes);

app.use((err, req, res, next) => {
  console.error("[ERROR]", err);

  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      message: err.message,
      frontendUrlRaw: process.env.FRONTEND_URL || null,
      allowedOrigins,
    });
  }

  return res.status(500).json({
    message: err.message || "Erro interno do servidor.",
  });
});

const port = Number(process.env.PORT || 80);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`API rodando em ${host}:${port}`);
  console.log("FRONTEND_URL bruto:", process.env.FRONTEND_URL || "(vazio)");
  console.log("Origins permitidas:", allowedOrigins);
});