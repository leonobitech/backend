import { Request, Response, NextFunction } from "express";
import { loggerAudit } from "@utils/logging/loggerAudit";

// 🔐 Cookies siempre permitidas
const baseAllowedCookies = [
  "accessKey",
  "clientKey",
  "sidebar_state",
  "clientMeta",
];

// 🍪 Cookies necesarias para Traefik ForwardAuth (n8n, Odoo)
const forwardAuthExtras = [
  "n8n-auth", // n8n

  "tz", // Odoo
  "session_id", // Odoo
  "frontend_lang", // Odoo
  "cids", // Odoo

  "jwt_token", // Baserow
  "baserow_dashboard_alert_closed", // Baserow
  "baserow_group_id", // Baserow
  "defaultViewId", // Baserow
  "i18n-language", // Baserow

  "cw_d_session_info", // Chatwoot
  "_chatwoot_session", // Chatwoot

  "odoo_mcp_session", // Odoo MCP Connector

  "clientMeta",
];

export default function cleanCookies(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const rawCookies = req.headers.cookie?.split(";") || [];

  // Agregamos extras si estamos en cualquier ruta ForwardAuth
  const isForwardAuth =
    req.path === "/security/verify-admin" ||
    req.path === "/security/verify-user";
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
