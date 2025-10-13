import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importPKCS8, JWTPayload, SignJWT } from "jose";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = resolve(__dirname, "../../keys");

let cachedPrivateKey: CryptoKey | null = null;

export async function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  try {
    const pem = await readFile(resolve(keysDir, "private.pem"), "utf-8");
    cachedPrivateKey = await importPKCS8(pem, "RS256");
    return cachedPrivateKey;
  } catch (error) {
    logger.error({ err: error }, "[auth] unable to load private.pem");
    throw new Error("Private key not available. Run npm run generate:keys");
  }
}

export async function signAccessToken(payload: JWTPayload) {
  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: env.JWKS_KID, typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(now + env.ACCESS_TOKEN_TTL)
    .sign(key);
}
