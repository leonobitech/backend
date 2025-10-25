// utils/auth/generateClientKeyLegacy.ts
import { CLIENT_KEY_SECRET } from "@config/env";
import { hmacHash } from "@utils/crypto/hmacHash";

/**
 * 🔄 LEGACY: Generación de clientKey con formato antiguo (IP /24)
 *
 * Esta función se mantiene TEMPORALMENTE para compatibilidad con
 * sesiones creadas antes del cambio a IP completa.
 *
 * Se usa solo durante el período de migración para validar
 * clientKeys antiguos y permitir auto-recovery de sesiones.
 *
 * @deprecated Usar generateClientKeyFromMeta() para nuevas sesiones
 */
export const generateClientKeyLegacy = async (
  meta: RequestMeta,
  userId: string,
  sessionId: string
): Promise<string> => {
  // Formato viejo: solo primeros 3 octetos
  let ipSegment = "";
  if (meta.ipAddress) {
    const parts = meta.ipAddress.split(".");
    if (parts.length === 4) {
      ipSegment = parts.slice(0, 3).join("."); // ej. "181.47.137"
    }
  }

  const fields: Record<string, string> = {
    userId,
    sessionId,
    ipAddress: ipSegment, // IP parcial (legacy)
    device: meta.deviceInfo.device,
    os: meta.deviceInfo.os,
    browser: meta.deviceInfo.browser,
    userAgent: meta.userAgent,
    language: meta.language,
    platform: meta.platform,
    timezone: meta.timezone,
    screenResolution: meta.screenResolution,
    label: meta.label,
  };

  const raw = Object.values(fields).join(":");
  const secret = CLIENT_KEY_SECRET;

  if (!secret) {
    throw new Error("Missing CLIENT_KEY_SECRET for HMAC hashing.");
  }

  return hmacHash(raw, secret);
};
