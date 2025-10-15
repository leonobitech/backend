import { randomUUID } from "node:crypto";
import { env } from "@/config/env";
import { ensureRedisConnection, redis } from "@/lib/redis";

export type CodeChallengeMethod = "S256" | "plain";

export interface AuthorizationCodePayload {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: CodeChallengeMethod;
  scope: string;
  subject: string;
  state?: string;
  nonce?: string;
  createdAt: number;
}

export interface RefreshTokenPayload {
  token: string;
  clientId: string;
  subject: string;
  scope: string;
  createdAt: number;
}

const codeKey = (code: string) => `auth_code:${code}`;
const refreshKey = (token: string) => `refresh_token:${token}`;
const nonceKey = (nonce: string) => `nonce:${nonce}`;

export async function createAuthorizationCode(data: Omit<AuthorizationCodePayload, "code" | "createdAt">) {
  await ensureRedisConnection();
  const code = randomUUID();
  const payload: AuthorizationCodePayload = {
    code,
    createdAt: Date.now(),
    ...data
  };
  await redis.set(codeKey(code), JSON.stringify(payload), { EX: env.AUTH_CODE_TTL });
  return payload;
}

export async function consumeAuthorizationCode(code: string) {
  await ensureRedisConnection();
  const value = await redis.get(codeKey(code));
  if (!value) return null;
  await redis.del(codeKey(code));
  return JSON.parse(value) as AuthorizationCodePayload;
}

export async function createRefreshToken(data: Omit<RefreshTokenPayload, "token" | "createdAt">) {
  await ensureRedisConnection();
  const token = randomUUID();
  const payload: RefreshTokenPayload = {
    token,
    createdAt: Date.now(),
    ...data
  };
  await redis.set(refreshKey(token), JSON.stringify(payload), { EX: env.REFRESH_TOKEN_TTL });
  return payload;
}

export async function getRefreshToken(token: string) {
  await ensureRedisConnection();
  const value = await redis.get(refreshKey(token));
  if (!value) return null;
  return JSON.parse(value) as RefreshTokenPayload;
}

export async function revokeRefreshToken(token: string) {
  await ensureRedisConnection();
  await redis.del(refreshKey(token));
}

export async function storeNonce(nonce: string, ttlSeconds = 300) {
  await ensureRedisConnection();
  await redis.set(nonceKey(nonce), "1", { EX: ttlSeconds });
}

export async function consumeNonce(nonce: string) {
  await ensureRedisConnection();
  const exists = await redis.get(nonceKey(nonce));
  if (!exists) return false;
  await redis.del(nonceKey(nonce));
  return true;
}
