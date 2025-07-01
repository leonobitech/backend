import { Request } from "express";

export function resolveSource(req: Request): string {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = req.headers.host || "";
  const path = req.headers["x-forwarded-uri"] || req.url || "";
  const userAgent = req.headers["user-agent"] || "";

  const raw = typeof forwardedHost === "string" ? forwardedHost : host;

  if (
    userAgent.includes("Go-http-client") &&
    path.includes("/security/verify-admin")
  )
    return "traefik";

  // 🔍 Dominio/subdominio
  if (raw.includes("odoo")) return "odoo";
  if (raw.includes("n8n")) return "n8n";
  if (raw.includes("chat")) return "chatwoot";
  if (raw.includes("br.")) return "baserow";
  if (raw.includes("frontend") || raw.includes("app.")) return "frontend";
  if (raw.includes("core")) return "core";

  // 🔁 Fallback por path
  if (typeof path === "string") {
    if (path.includes("/web") || path.includes("/web/login")) return "odoo";
    if (path.includes("/n8n")) return "n8n";
    if (path.includes("/cable")) return "chatwoot";
  }

  return "unknown";
}
