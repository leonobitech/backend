import { CLIENT_KEY_SECRET, NODE_ENV } from "@config/env";
import { hmacHash } from "@utils/crypto/hmacHash";

export const generateClientKeyFromMeta = async (
  meta: RequestMeta,
  userId: string,
  sessionId: string,
  verbose = NODE_ENV !== "production"
): Promise<string> => {
  const fields: Record<string, string> = {
    userId,
    sessionId,
    ipAddress: meta.ipAddress ?? "",
    device: meta.deviceInfo.device ?? "",
    os: meta.deviceInfo.os ?? "",
    browser: meta.deviceInfo.browser ?? "",
    userAgent: meta.userAgent ?? "",
    language: meta.language ?? "",
    platform: meta.platform ?? "",
    timezone: meta.timezone ?? "",
    screenResolution: meta.screenResolution ?? "",
    label: meta.label ?? "",
    host: meta.host ?? "",
  };

  const raw = Object.values(fields).join(":");
  const secret = CLIENT_KEY_SECRET;

  if (!secret) {
    throw new Error("Missing CLIENT_KEY_SECRET for HMAC hashing.");
  }

  const fingerprint = hmacHash(raw, secret);

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
