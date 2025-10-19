import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

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
  const header = decodeProtectedHeader(token);

  if (header?.alg?.startsWith("HS")) {
    if (!env.CORE_SERVICE_TOKEN_SECRET) {
      logger.error("[auth] Service token received but CORE_SERVICE_TOKEN_SECRET is not configured");
      throw new Error("Service token support not configured");
    }

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.CORE_SERVICE_TOKEN_SECRET),
      {
        issuer: env.CORE_SERVICE_TOKEN_ISSUER ?? env.JWT_ISSUER,
        audience: env.SERVICE_TOKEN_AUDIENCE
      }
    );
    return payload;
  }

  const jwkSet = await getJwkSet();
  const { payload } = await jwtVerify(token, jwkSet, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  });
  return payload;
}
