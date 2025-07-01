// src/utils/request/resolveSource.ts
import { Request } from "express";

export function resolveSource(req: Request): string {
  const host =
    typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"]
      : typeof req.headers.host === "string"
        ? req.headers.host
        : "";

  if (host.includes("odoo")) return "odoo";
  if (host.includes("n8n")) return "n8n";
  if (host.includes("chat")) return "chatwoot";
  if (host.includes("br.")) return "baserow";
  if (host.includes("app.") || host.includes("frontend")) return "frontend";
  if (host.includes("core")) return "core";

  return "unknown";
}
