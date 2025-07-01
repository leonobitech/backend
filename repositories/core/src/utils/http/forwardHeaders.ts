// utils/http/forwardHeaders.ts
import { Request, Response } from "express";

/** Normaliza IPv6-mapped IPv4 (::ffff:…) → 192.168.0.1 */
const normalizeIpAddress = (ip: string): string => {
  if (!ip) return "0.0.0.0";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
};

export function appendForwardedHeaders(req: Request, res: Response): void {
  const remote = req.socket.remoteAddress ?? "0.0.0.0";

  const getHeader = (
    value: string | string[] | undefined,
    fallback: string
  ): string => {
    if (!value) return fallback;
    return Array.isArray(value) ? value[0] : value;
  };

  const forwardedFor = normalizeIpAddress(
    getHeader(req.headers["x-forwarded-for"], remote)
  );
  const realIp = normalizeIpAddress(
    getHeader(req.headers["x-real-ip"], remote)
  );
  const proto = getHeader(req.headers["x-forwarded-proto"], "https");
  const host = getHeader(req.headers["host"], "unknown");

  res.setHeader("X-Forwarded-For", forwardedFor);
  res.setHeader("X-Real-IP", realIp);
  res.setHeader("X-Forwarded-Proto", proto);
  res.setHeader("X-Forwarded-Host", host); // 🔍 útil para logs, debugging o proxy encadenados

  /**
   * 🛡️ Seguridad
   * Este header solo se inyecta en el backend core después de autenticar con authenticate, así que:
   * - No es manipulable por el cliente.
   * - Solo se agrega si el usuario está autenticado (req.userId ya seteado).
   * - No contiene información sensible como tokens.
   */

  if (req.userId) {
    res.setHeader("X-User-Id", req.userId);
  }
  if (req.role) {
    res.setHeader("X-User-Role", req.role);
  }
  if (req.sessionId) {
    res.setHeader("X-Session-Id", req.sessionId);
  }
}
