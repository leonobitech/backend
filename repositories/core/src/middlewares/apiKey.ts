import type { RequestHandler } from "express";
import { CORE_API_KEY } from "@config/env";

export const apiKeyGuard: RequestHandler = (req, res, next) => {
  // ✂️ Si es una llamada de ForwardAuth de Traefik (/security/*), saltamos la validación de API Key
  if (req.path.startsWith("/security")) {
    return next();
  }

  const apiKey = req.get("x-core-access-key");

  if (!apiKey || apiKey !== CORE_API_KEY) {
    res.status(403).json({ error: "Forbidden – Invalid API key" });
    return;
  }

  next();
};
