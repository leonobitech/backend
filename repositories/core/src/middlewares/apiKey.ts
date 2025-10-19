import type { RequestHandler } from "express";
import { CORE_API_KEY } from "@config/env";

const PUBLIC_PATHS = [
  "/account/login",
  "/account/register",
  "/account/verify-email",
  "/account/password/forgot",
  "/account/password/reset",
  "/account/refresh",
  "/account/passkey/login/challenge",
  "/account/passkey/login/verify",
];

const isPublicPath = (path: string): boolean => {
  return PUBLIC_PATHS.some(
    (publicPath) => path === publicPath || path.startsWith(`${publicPath}/`)
  );
};

export const apiKeyGuard: RequestHandler = (req, res, next) => {
  if (isPublicPath(req.path)) {
    return next();
  }

  const apiKey = req.get("x-core-access-key");

  if (!apiKey || apiKey !== CORE_API_KEY) {
    res.status(403).json({ error: "Forbidden – Invalid API key" });
    return;
  }

  next();
};
