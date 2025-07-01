import { Request } from "express";

/**
 * 🧭 Determina la fuente del request (servicio origen) para logs o auditoría.
 */
export function resolveSource(req: Request): string {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = req.headers.host || "";
  const xForwardedUri = req.headers["x-forwarded-uri"];
  const path =
    typeof xForwardedUri === "string"
      ? xForwardedUri
      : Array.isArray(xForwardedUri)
        ? xForwardedUri[0] || ""
        : req.url || "";
  const userAgent = req.headers["user-agent"] || "";

  const rawHost =
    typeof forwardedHost === "string"
      ? forwardedHost
      : Array.isArray(forwardedHost)
        ? forwardedHost[0]
        : host;

  // 🛡️ Detectar Traefik ForwardAuth
  if (
    userAgent.toLowerCase().startsWith("go-http-client") &&
    path.includes("/security/verify-admin")
  ) {
    return "traefik";
  }

  // 🌐 Detectar por dominio o subdominio
  const domain = rawHost.toLowerCase();
  if (domain.includes("odoo")) return "odoo";
  if (domain.includes("n8n")) return "n8n";
  if (domain.includes("chat")) return "chatwoot";
  if (domain.includes("br.")) return "baserow";
  if (domain.includes("frontend") || domain.includes("app.")) return "frontend";
  if (domain.includes("core")) return "core";

  // 🔁 Fallback por path
  const p = path.toLowerCase();
  if (p.includes("/web") || p.includes("/web/login")) return "odoo";
  if (p.includes("/n8n")) return "n8n";
  if (p.includes("/cable")) return "chatwoot";

  return "unknown";
}
