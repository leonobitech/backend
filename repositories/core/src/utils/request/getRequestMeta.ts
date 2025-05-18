// File: src/utils/request/getRequestMeta.ts
import { Request } from "express";
import * as UAParser from "ua-parser-js";

/** Normaliza IPv6-mapped IPv4 (::ffff:…) → 192.168.0.1 */
const normalizeIpAddress = (ip: string): string => {
  if (!ip) return "0.0.0.0";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
};

/** Extrae la IP real de headers o socket */
const extractServerIp = (req: Request): string => {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") {
    return normalizeIpAddress(fwd.split(",")[0].trim());
  }
  const raw = req.socket?.remoteAddress || req.ip || "";
  return normalizeIpAddress(raw);
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
  if (ua.includes("EdgA")) {
    browser = "Edge Mobile";
  } else if (ua.includes("EdgiOS")) {
    browser = "Edge iOS";
  } else if (ua.includes("Edg/")) {
    browser = "Edge";
  } else if (ua.includes("Brave")) {
    browser = "Brave";
  } else if (ua.includes("Vivaldi")) {
    browser = "Vivaldi";
  } else if (ua.includes("OPR/")) {
    browser = "Opera";
  }

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

export const getRequestMeta = (req: Request): RequestMeta => {
  // 1️⃣ Si el cliente envió un meta completo, lo usamos como base
  const clientMeta = (req.body as any)?.meta as
    | Partial<RequestMeta>
    | undefined;

  // 2️⃣ Construimos el meta “servidor” real
  const serverUa = String(req.headers["user-agent"] || "unknown");
  const serverDevice = parseUA(serverUa);
  const serverIp = extractServerIp(req);
  const extra = (req.body as any)?.deviceExtra || {};

  const serverMeta: RequestMeta = {
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

  if (!clientMeta) {
    return serverMeta;
  }

  // 3️⃣ Mezclamos: tomamos del cliente todo salvo la IP (si está vacía)
  return {
    ipAddress: clientMeta.ipAddress?.trim()
      ? clientMeta.ipAddress!
      : serverMeta.ipAddress,
    deviceInfo: clientMeta.deviceInfo || serverMeta.deviceInfo,
    userAgent: clientMeta.userAgent || serverMeta.userAgent,
    language: clientMeta.language || serverMeta.language,
    platform: clientMeta.platform || serverMeta.platform,
    timezone: clientMeta.timezone || serverMeta.timezone,
    screenResolution:
      clientMeta.screenResolution || serverMeta.screenResolution,
    label: clientMeta.label || serverMeta.label,
    path: serverMeta.path,
    method: serverMeta.method,
    host: serverMeta.host,
  };
};
