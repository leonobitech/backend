import { CLIENT_KEY_SECRET, NODE_ENV } from "@config/env";
import { hmacHash } from "@utils/crypto/hmacHash";

export const generateClientKeyFromMeta = async (
  meta: RequestMeta,
  userId: string,
  sessionId: string,
  verbose = NODE_ENV !== "production"
): Promise<string> => {
  // 1️⃣ Usar IP completa (4 octetos) para mayor seguridad
  // Esto previene ataques de usuarios en la misma subred /24
  const ipAddress = meta.ipAddress || "0.0.0.0";

  // 2️⃣ Campos inmutables que identifican de forma única este dispositivo
  // IMPORTANTE: Cualquier cambio en estos campos invalidará el clientKey
  const fields: Record<string, string> = {
    userId,
    sessionId,
    ipAddress, // IP completa (ej: "181.47.137.24")
    device: meta.deviceInfo.device,
    os: meta.deviceInfo.os,
    browser: meta.deviceInfo.browser,
    userAgent: meta.userAgent,
    language: meta.language,
    platform: meta.platform,
    timezone: meta.timezone,
    screenResolution: meta.screenResolution,
    label: "leonobitech", // Valor fijo para consistencia entre páginas
  };

  // 3️⃣ Montamos la cadena
  const raw = Object.values(fields).join(":");
  const secret = CLIENT_KEY_SECRET;

  if (!secret) {
    throw new Error("Missing CLIENT_KEY_SECRET for HMAC hashing.");
  }

  const fingerprint = hmacHash(raw, secret);

  // 4️⃣ Logging solo en desarrollo (sin exponer datos sensibles)
  if (verbose && NODE_ENV === "development") {
    console.log("🧬 ClientKey generado para sesión:", sessionId.substring(0, 8) + "...");
    console.log("  Dispositivo:", meta.deviceInfo.device, "-", meta.deviceInfo.os);
    // NO logueamos el fingerprint completo ni la IP en producción
  }

  return fingerprint;
};
