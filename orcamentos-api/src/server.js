import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import quotesRoutes from "./routes/quotes.routes.js";

dotenv.config();

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((item) => item.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/quotes", quotesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Erro interno do servidor." });
});

const port = Number(process.env.PORT || 80);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`API rodando em ${host}:${port}`);
});