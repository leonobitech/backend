import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { isTokenRevoked } from "@/lib/store";

const keysDir = resolve(process.cwd(), "keys");

type JwksLoader = ReturnType<typeof createLocalJWKSet>;

let cachedJwkSet: JwksLoader | null = null;

async function getJwkSet(): Promise<JwksLoader> {
  if (cachedJwkSet) {
    return cachedJwkSet;
  }

  try {
    const jwksRaw = await readFile(resolve(keysDir, "jwks.json"), "utf-8");
    const jwksJson = JSON.parse(jwksRaw);
    cachedJwkSet = createLocalJWKSet(jwksJson);
    return cachedJwkSet;
  } catch (error) {
    logger.error({ err: error }, "[auth] unable to load jwks.json");
    throw new Error("JWKS not available. Run npm run generate:keys");
  }
}

export async function verifyAccessToken(token: string) {
  // Only support RSA tokens (RS256) for now
  // Service tokens (HMAC) can be added later if needed for n8n integration
  const jwkSet = await getJwkSet();
  const { payload } = await jwtVerify(token, jwkSet, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  });

  // Check if token has been revoked (blacklist check)
  if (payload.jti && await isTokenRevoked(payload.jti as string)) {
    throw new Error("Token has been revoked");
  }

  return payload;
}
