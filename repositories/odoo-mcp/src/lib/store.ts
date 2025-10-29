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
const accessTokenKey = (jti: string) => `access_token:${jti}`;
const revokedTokenKey = (jti: string) => `revoked_token:${jti}`;

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

export async function revokeAllUserRefreshTokens(userId: string) {
  await ensureRedisConnection();

  // Scan all refresh_token:* keys
  const pattern = "refresh_token:*";
  const keys: string[] = [];

  for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    keys.push(key);
  }

  // Filter keys that belong to this user
  const tokensToRevoke: string[] = [];
  for (const key of keys) {
    const value = await redis.get(key);
    if (value) {
      const payload = JSON.parse(value) as RefreshTokenPayload;
      if (payload.subject === userId) {
        tokensToRevoke.push(key);
      }
    }
  }

  // Delete all user's refresh tokens
  if (tokensToRevoke.length > 0) {
    await redis.del(tokensToRevoke);
  }

  return tokensToRevoke.length;
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

// Access token tracking (for revocation)
export interface AccessTokenMetadata {
  jti: string;
  userId: string;
  scope: string;
  issuedAt: number;
}

export async function storeAccessToken(metadata: AccessTokenMetadata, ttl: number) {
  await ensureRedisConnection();
  await redis.set(
    accessTokenKey(metadata.jti),
    JSON.stringify(metadata),
    { EX: ttl }
  );
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  await ensureRedisConnection();
  const revoked = await redis.get(revokedTokenKey(jti));
  return revoked !== null;
}

export async function revokeAccessToken(jti: string, ttl: number) {
  await ensureRedisConnection();
  // Add to revocation blacklist with same TTL as token
  await redis.set(revokedTokenKey(jti), "1", { EX: ttl });
  // Remove from active tokens
  await redis.del(accessTokenKey(jti));
}

export async function revokeAllUserAccessTokens(userId: string) {
  await ensureRedisConnection();

  // Scan all access_token:* keys
  const pattern = "access_token:*";
  const keys: string[] = [];

  for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    keys.push(key);
  }

  // Filter keys that belong to this user and revoke them
  const tokensToRevoke: Array<{ jti: string; metadata: AccessTokenMetadata }> = [];
  for (const key of keys) {
    const value = await redis.get(key);
    if (value) {
      const metadata = JSON.parse(value) as AccessTokenMetadata;
      if (metadata.userId === userId) {
        const jti = key.replace("access_token:", "");
        tokensToRevoke.push({ jti, metadata });
      }
    }
  }

  // Revoke all user's access tokens
  for (const { jti, metadata } of tokensToRevoke) {
    // Calculate remaining TTL based on token age
    const now = Math.floor(Date.now() / 1000);
    const age = now - Math.floor(metadata.issuedAt / 1000);
    const remainingTTL = Math.max(0, 3600 - age); // Assuming 1 hour token lifetime

    await revokeAccessToken(jti, remainingTTL);
  }

  return tokensToRevoke.length;
}
