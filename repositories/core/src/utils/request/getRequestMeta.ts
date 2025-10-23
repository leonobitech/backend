// File: src/utils/request/getRequestMeta.ts

import { Request } from "express";
import * as UAParser from "ua-parser-js";
import { z } from "zod";

/** Normaliza IPv6-mapped IPv4 (::ffff:…) → 192.168.0.1 */
const normalizeIpAddress = (ip: string): string => {
  if (!ip) return "0.0.0.0";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
};

/** Extrae la IP real de headers o socket */
const extractServerIp = (req: Request): string => {
  const headers = req.headers;

  const realIp =
    headers["x-real-ip"]?.toString() ||
    headers["cf-connecting-ip"]?.toString() ||
    (() => {
      const forwarded = headers["x-forwarded-for"]?.toString();
      if (!forwarded) return "";
      const parts = forwarded
        .split(",")
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      if (parts.length === 0) return "";
      return parts[parts.length - 1];
    })() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "";

  return normalizeIpAddress(realIp);
};

/** Parseo sencillo de User-Agent */
const parseUA = (ua: string) => {
  const p = new UAParser.UAParser();
  p.setUA(ua);
  const browserRaw = p.getBrowser();
  const osRaw = p.getOS();
  const deviceRaw = p.getDevice();

  let browser = browserRaw.name || "Unknown";

  // 🔍 Correcciones manuales para navegadores mal detectados
  if (ua.includes("EdgA")) browser = "Edge Mobile";
  else if (ua.includes("EdgiOS")) browser = "Edge iOS";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Brave")) browser = "Brave";
  else if (ua.includes("Vivaldi")) browser = "Vivaldi";
  else if (ua.includes("OPR/")) browser = "Opera";

  const os =
    osRaw.name && osRaw.version
      ? `${osRaw.name} ${osRaw.version}`
      : osRaw.name || "Unknown";

  return {
    device: deviceRaw.type || "Desktop",
    os,
    browser,
  };
};

export interface RequestMeta {
  ipAddress: string;
  deviceInfo: { browser: string; os: string; device: string };
  userAgent: string;
  language: string;
  platform: string;
  timezone: string;
  screenResolution: string;
  label: string;
  path: string;
  method: string;
  host: string;
}

const MetaSchema = z.object({
  ipAddress: z.string().min(3),
  deviceInfo: z.object({
    browser: z.string().min(1),
    os: z.string().min(1),
    device: z.string().min(1),
  }),
  userAgent: z.string().min(1),
  language: z.string().min(1),
  platform: z.string().min(1),
  timezone: z.string().min(1),
  screenResolution: z.string().min(1),
  label: z.string().min(1),
});

export const getRequestMeta = (req: Request): RequestMeta => {
  const clientMeta = (req.body as any)?.meta as
    | Partial<RequestMeta>
    | undefined;

  const serverUa = String(req.headers["user-agent"] || "unknown");
  const serverDevice = parseUA(serverUa);
  const serverIp = extractServerIp(req);
  const extra = (req.body as any)?.deviceExtra || {};

  const fallbackMeta: RequestMeta = {
    ipAddress: serverIp,
    deviceInfo: serverDevice,
    userAgent: serverUa,
    language: (req.headers["accept-language"] as string)?.split(",")[0] || "en",
    platform: extra.platform ?? req.headers["sec-ch-ua-platform"] ?? "",
    timezone: extra.timezone ?? "",
    screenResolution: extra.screenResolution ?? "",
    label: extra.label ?? "",
    path: req.originalUrl,
    method: req.method,
    host: req.hostname,
  };

  // 🔒 Si el cliente envió un meta, validamos todo estrictamente
  if (clientMeta) {
    const parsed = MetaSchema.safeParse(clientMeta);
    if (!parsed.success) {
      throw new Error("❌ Metadatos del cliente incompletos o inválidos");
    }

    const sanitized: RequestMeta = {
      ipAddress: fallbackMeta.ipAddress,
      deviceInfo: parsed.data.deviceInfo,
      userAgent: fallbackMeta.userAgent,
      language: parsed.data.language || fallbackMeta.language,
      platform: parsed.data.platform || fallbackMeta.platform,
      timezone: parsed.data.timezone || fallbackMeta.timezone,
      screenResolution:
        parsed.data.screenResolution || fallbackMeta.screenResolution,
      label: parsed.data.label || fallbackMeta.label,
      path: fallbackMeta.path,
      method: fallbackMeta.method,
      host: fallbackMeta.host,
    };

    return sanitized;
  }

  return fallbackMeta;
};
