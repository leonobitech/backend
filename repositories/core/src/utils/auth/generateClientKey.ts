import { CLIENT_KEY_SECRET, NODE_ENV } from "@config/env";
import { hmacHash } from "@utils/crypto/hmacHash";

export const generateClientKeyFromMeta = async (
  meta: RequestMeta,
  userId: string,
  sessionId: string,
  verbose = NODE_ENV !== "production"
): Promise<string> => {
  // 1️⃣ Masked IP: conservar solo primer /24
  let ipSegment = "";
  if (meta.ipAddress) {
    const parts = meta.ipAddress.split(".");
    if (parts.length === 4) {
      ipSegment = parts.slice(0, 3).join("."); // ej. "172.69.138"
    }
  }

  // 2️⃣ Campos inmutables
  const fields: Record<string, string> = {
    userId,
    sessionId,
    ipAddress: ipSegment,
    device: meta.deviceInfo.device,
    os: meta.deviceInfo.os,
    browser: meta.deviceInfo.browser,
    userAgent: meta.userAgent,
    language: meta.language,
    platform: meta.platform,
    timezone: meta.timezone,
    screenResolution: meta.screenResolution,
    label: meta.label,
    host: meta.host,
  };

  // 3️⃣ Montamos la cadena
  const raw = Object.values(fields).join(":");
  const secret = CLIENT_KEY_SECRET;

  if (!secret) {
    throw new Error("Missing CLIENT_KEY_SECRET for HMAC hashing.");
  }

  const fingerprint = hmacHash(raw, secret);

  // 4️⃣ Logging en dev
  if (verbose) {
    const logLine = () =>
      console.log("--------------------------------------------------");
    logLine();
    console.log(
      "🧬 Generando clientKey (HMAC-SHA512) con los siguientes datos:"
    );
    Object.entries(fields).forEach(([key, value]) => {
      const display = value === "" ? "(empty)" : value;
      console.log(`  🔹 ${key.padEnd(18)}: ${display}`);
    });
    logLine();
    console.log("🔗 Cadena para hashear:");
    console.log(`  ${raw}`);
    logLine();
    console.log("🔐 Resultado del clientKey (hash):");
    console.log(`  ${fingerprint}`);
    logLine();
  }

  return fingerprint;
};
