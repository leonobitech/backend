// utils/request/getRequestMeta.ts
import { Request } from "express";
import * as UAParser from "ua-parser-js";

// ✅ Normaliza IPs tipo "::ffff:192.168.0.1" → "192.168.0.1"
const normalizeIpAddress = (ip: string): string => {
  if (!ip) return "0.0.0.0";
  return ip.startsWith("::ffff:") ? ip.replace("::ffff:", "") : ip;
};

const getIpAddress = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return normalizeIpAddress(forwarded.split(",")[0].trim());
  }

  const rawIp = req.socket?.remoteAddress || req.ip || "0.0.0.0";
  return normalizeIpAddress(rawIp);
};

const parseUserAgent = (userAgent: string) => {
  const parser = new UAParser.UAParser();
  parser.setUA(userAgent);

  const browser = parser.getBrowser()?.name || "Unknown";
  const os = parser.getOS()?.name || "Unknown";
  const device = parser.getDevice()?.type || "Desktop";

  return { browser, os, device };
};

export const getRequestMeta = (req: Request): RequestMeta => {
  const userAgent = req.headers["user-agent"] || "unknown";
  const ipAddress = getIpAddress(req);
  const deviceInfo = parseUserAgent(userAgent);
  const extra = req.body?.deviceExtra || {};

  return {
    ipAddress,
    deviceInfo,
    userAgent,
    language: req.lang || "en",
    platform: extra.platform ?? "",
    timezone: extra.timezone ?? "",
    screenResolution: extra.screenResolution ?? "",
    label: extra.label ?? "",
    path: req.originalUrl,
    method: req.method,
    host: req.hostname,
  };
};
