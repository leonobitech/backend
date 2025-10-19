import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import {
  JWT_ISSUER,
  SERVICE_TOKEN_SECRET,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_TTL_SECONDS,
} from "@config/env";

interface GenerateServiceTokenParams {
  clientId: string;
  scopes: string[];
}

export interface ServiceTokenResult {
  token: string;
  expiresIn: number;
}

export const generateServiceToken = async (
  params: GenerateServiceTokenParams
): Promise<ServiceTokenResult> => {
  const ttl = Number.isFinite(SERVICE_TOKEN_TTL_SECONDS)
    ? Math.max(SERVICE_TOKEN_TTL_SECONDS, 60)
    : 900;

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttl;

  const scope = params.scopes.join(" ");

  const token = await new SignJWT({
    scope,
    client_id: params.clientId,
    token_use: "service",
  })
    .setProtectedHeader({ alg: "HS512", typ: "JWT" })
    .setSubject(`service:${params.clientId}`)
    .setIssuer(JWT_ISSUER)
    .setAudience(SERVICE_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(SERVICE_TOKEN_SECRET));

  return { token, expiresIn: ttl };
};
