import { redis } from "@config/redis";
import { ERROR_CODE } from "@constants/errorCode";
import { HTTP_CODE } from "@constants/httpCode";
import HttpException from "@utils/http/HttpException";
import prisma from "@config/prisma";
import { generateClientKeyFromMeta } from "./generateClientKey";
import { loggerSecurityEvent } from "@utils/logging/loggerSecurityEvent";
import appAssert from "@utils/validation/appAssert";

/**
 * 🎯 Convención de claves Redis:
 * access_token:{jti} → JWT completo
 */

/**
 * 📦 Guarda un access token (JWT) en Redis con TTL.
 */
export const cacheAccessToken = async (
  hashedJti: string,
  jwe: string,
  clientPublicKeyHash: string,
  ttlSeconds: number
): Promise<void> => {
  if (!hashedJti) {
    throw new Error("Cannot cache access token: jti is undefined.");
  }

  try {
    if (!redis.isReady) {
      console.warn("🕒 Redis client not ready. Connecting...");
      await redis.connect();
    }

    const key = `access_token:${hashedJti}`;
    const value = JSON.stringify({
      token: jwe,
      clientKeyHash: clientPublicKeyHash,
    });

    await redis.set(key, value, { EX: ttlSeconds });

    console.log("✅ Access token cacheado correctamente en Redis");
  } catch (error) {
    console.error("❌ Error al cachear access token en Redis:", error);
  }
};

/**
 * 📦 Recupera el token desde Redis, valida que no esté expirado (TTL <= 0)
 * Si no existe o expiró, lanza error. Útil para prevalidar antes de jwtVerify.
 */
export const findAccessTokenOrThrow = async (
  accessKey: string,
  clientKey: string,
  meta: RequestMeta,
  useFallback = false
): Promise<{
  token: string;
  clientKeyHash: string;
  ttl: number;
  refreshed: boolean;
}> => {
  const key = `access_token:${accessKey}`;
  const data = await redis.get(key);
  const ttl = await redis.ttl(key);

  if (data && ttl > 0) {
    const { token, clientKeyHash } = JSON.parse(data);

    // Retorna access token desde Redis
    return { token, clientKeyHash, ttl, refreshed: false };
  }

  // 🔥 Limpieza proactiva si estaba vencido
  await redis.del(key);

  // ⛓️ Fallback a DB si está habilitado
  if (useFallback) {
    const record = await prisma.tokenRecord.findFirst({
      where: {
        jti: accessKey,
        type: "ACCESS",
        revoked: false,
      },
      include: {
        user: true,
        session: true,
      },
    });

    if (!record) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Access token not found in Redis or DB.",
        ERROR_CODE.TOKEN_REVOKED
      );
    }

    const expectedClientKey = await generateClientKeyFromMeta(
      meta,
      record.userId,
      record.sessionId
    );

    if (clientKey !== expectedClientKey) {
      await loggerSecurityEvent({
        meta,
        type: "client_key_mismatch",
        userId: record.userId,
        sessionId: record.sessionId,
      });

      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "This token was not generated from this device or IP address.",
        ERROR_CODE.INVALID_CLIENT_KEY
      );
    }

    appAssert(
      record.session.clientKey === clientKey,
      HTTP_CODE.UNAUTHORIZED,
      "Client key does not match the session fingerprint.",
      ERROR_CODE.INVALID_CLIENT_KEY
    );

    const expiresAt = record.expiresAt.getTime();
    const ttlFromDb = Math.floor((expiresAt - Date.now()) / 1000);

    return {
      token: record.token,
      clientKeyHash: record.publicKey,
      ttl: ttlFromDb,
      refreshed: true,
    };
  }

  throw new HttpException(
    HTTP_CODE.UNAUTHORIZED,
    "Access token not found or expired.",
    ERROR_CODE.TOKEN_REVOKED
  );
};

/**
 * 🧼 Revoca un token (elimina de Redis).
 */
export const revokeAccessToken = async (accessKey: string): Promise<void> => {
  await redis.del(`access_token:${accessKey}`);
};
