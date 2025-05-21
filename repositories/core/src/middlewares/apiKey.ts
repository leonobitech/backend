import type { RequestHandler } from "express";
import { CORE_API_KEY } from "@config/env";

export const apiKeyGuard: RequestHandler = (req, res, next) => {
  const apiKey = req.get("x-core-access-key");

  if (!apiKey || apiKey !== CORE_API_KEY) {
    res.status(403).json({ error: "Forbidden – Invalid API key" });
    return; // 🔑 no retornás el resultado, solo cortás el flujo
  }

  next();
};
