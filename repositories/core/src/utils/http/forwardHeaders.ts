// utils/http/forwardHeaders.ts
import { Request, Response } from "express";

export function appendForwardedHeaders(req: Request, res: Response): void {
  const remote = req.socket.remoteAddress ?? "0.0.0.0";

  const getHeader = (
    value: string | string[] | undefined,
    fallback: string
  ): string => {
    if (!value) return fallback;
    return Array.isArray(value) ? value[0] : value;
  };

  const forwardedFor = getHeader(req.headers["x-forwarded-for"], remote);
  const realIp = getHeader(req.headers["x-real-ip"], remote);
  const proto = getHeader(req.headers["x-forwarded-proto"], "https");

  res.setHeader("X-Forwarded-For", forwardedFor);
  res.setHeader("X-Real-IP", realIp);
  res.setHeader("X-Forwarded-Proto", proto);

  /**
   * 🛡️ Seguridad
   *Este header solo se inyecta en el backend core después de autenticar con authenticate, así que:
   *No es manipulable por el cliente.
   *Solo se agrega si el usuario está autenticado (req.userId ya seteado).
   *No contiene información sensible como tokens.
   *
   */

  // 🔐 Headers extendidos solo si el usuario está autenticado
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
