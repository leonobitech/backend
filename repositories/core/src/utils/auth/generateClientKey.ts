import { CLIENT_KEY_SECRET } from "@config/env";
import { hmacHash } from "@utils/crypto/hmacHash";

/**
 * Genera un clientKey estable basado en campos inmutables del dispositivo.
 *
 * Campos incluidos (NO cambian entre redes):
 * - userId, sessionId: identificadores de la sesión
 * - device, os, browser: tipo de dispositivo
 * - screenResolution, label: fingerprint adicional
 *
 * Campos EXCLUIDOS intencionalmente:
 * - ipAddress: cambia entre WiFi y datos móviles
 * - userAgent: puede cambiar con updates del browser
 * - language: puede cambiar con config del phone
 * - timezone: puede cambiar al viajar
 * - platform: redundante con os
 */
export const generateClientKeyFromMeta = async (
  meta: RequestMeta,
  userId: string,
  sessionId: string
): Promise<string> => {
  const fields: Record<string, string> = {
    userId,
    sessionId,
    device: meta.deviceInfo.device,
    os: meta.deviceInfo.os,
    browser: meta.deviceInfo.browser,
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
