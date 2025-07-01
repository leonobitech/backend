// utils/http/forwardHeaders.ts
import { Request, Response } from "express";

/**
 * Aplica headers de reenvío (`X-Forwarded-For`, `X-Real-IP`, etc.) a la response,
 * basándose en lo recibido desde Traefik (req.headers) o en la IP del socket.
 */
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
}
