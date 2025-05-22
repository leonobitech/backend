import { Request, Response, NextFunction } from "express";
import { loggerAudit } from "@utils/logging/loggerAudit";

// 🔐 Cookies siempre permitidas
const baseAllowedCookies = ["accessKey", "clientKey", "sidebar:state"];

// 🍪 Cookies necesarias para Traefik ForwardAuth (n8n, Odoo)
const forwardAuthExtras = [
  "n8n-auth",
  "tz",
  "frontend_lang",
  "session_id",
  "cids",
];

export default function cleanCookies(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const rawCookies = req.headers.cookie?.split(";") || [];

  // Solo agregamos extras si estamos en /security/verify-admin
  const isForwardAuth = req.path === "/security/verify-admin";
  const allowedCookies = isForwardAuth
    ? [...baseAllowedCookies, ...forwardAuthExtras]
    : baseAllowedCookies;

  const kept: string[] = [];
  const removed: string[] = [];

  for (const cookie of rawCookies) {
    const trimmed = cookie.trim();
    const [name] = trimmed.split("=");

    if (allowedCookies.includes(name)) {
      kept.push(trimmed);
    } else {
      removed.push(name);
    }
  }

  // 🧼 Reescribe cookies permitidas o elimina todas
  if (kept.length > 0) {
    req.headers.cookie = kept.join("; ");
  } else {
    delete req.headers.cookie;
  }

  // 📝 Logging silencioso si se limpió algo
  if (removed.length > 0) {
    loggerAudit(
      "security.cookie_cleaned",
      {
        performedBy: "anonymous",
        reason: "Cookies no autorizadas eliminadas silenciosamente",
        cookiesRemoved: removed,
        path: req.originalUrl,
        method: req.method,
        ip: req.meta?.ipAddress,
        userAgent: req.meta?.userAgent,
        label: req.meta?.label,
      },
      req
    );
  }

  next();
}
