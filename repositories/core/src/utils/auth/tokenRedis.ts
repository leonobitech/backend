import { redis } from "@config/redis";
import { ERROR_CODE } from "@constants/errorCode";
import { HTTP_CODE } from "@constants/httpCode";
import HttpException from "@utils/http/HttpException";
import prisma from "@config/prisma";
import { generateClientKeyFromMeta } from "./generateClientKey";
import { generateClientKeyLegacy } from "./generateClientKeyLegacy";
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
 * 🕐 Mueve un token a "período de gracia" (120 segundos) para permitir propagación de cookies.
 * Se usa durante el refresh para que el token viejo siga siendo válido brevemente.
 *
 * SECURITY: 2 minutos da suficiente margen para propagación de cookies sin ser excesivo.
 */
export const moveTokenToGracePeriod = async (
  hashedJti: string
): Promise<void> => {
  const oldKey = `access_token:${hashedJti}`;
  const graceKey = `access_token:${hashedJti}:grace`;
  const GRACE_PERIOD_SECONDS = 120; // 2 minutos para propagación de cookies

  const data = await redis.get(oldKey);
  if (data) {
    // Mover el token al período de gracia con TTL reducido
    await redis.set(graceKey, data, { EX: GRACE_PERIOD_SECONDS });
    if (process.env.NODE_ENV === "development") {
      console.log(`⏳ Token movido a período de gracia (${GRACE_PERIOD_SECONDS}s)`);
    }
  }

  // Eliminar el token original
  await redis.del(oldKey);
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
  fromGrace?: boolean;
}> => {
  const key = `access_token:${accessKey}`;
  const graceKey = `access_token:${accessKey}:grace`;

  const data = await redis.get(key);
  const ttl = await redis.ttl(key);

  if (data && ttl > 0) {
    const { token, clientKeyHash } = JSON.parse(data);

    // Retorna access token desde Redis
    return { token, clientKeyHash, ttl, refreshed: false };
  }

  // 🕐 Buscar en período de gracia antes de ir al fallback
  const graceData = await redis.get(graceKey);
  const graceTtl = await redis.ttl(graceKey);

  if (graceData && graceTtl > 0) {
    const { token, clientKeyHash } = JSON.parse(graceData);
    console.log(`⏳ Token encontrado en período de gracia (TTL: ${graceTtl}s)`);

    // Retorna desde período de gracia (no genera nuevo refresh)
    return { token, clientKeyHash, ttl: graceTtl, refreshed: false, fromGrace: true };
  }

  // 🔥 Limpieza proactiva si estaba vencido
  await redis.del(key);
  await redis.del(graceKey);

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
        session: {
          include: {
            device: true,
          },
        },
      },
    });

    if (!record) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Access token not found in Redis or DB.",
        ERROR_CODE.TOKEN_REVOKED
      );
    }

    // 🔐 Validación de huella digital con soporte para formato legacy
    const expectedClientKey = await generateClientKeyFromMeta(
      meta,
      record.userId,
      record.sessionId
    );

    // 🔄 BACKWARD COMPATIBILITY: Intentar también con formato legacy (IP /24)
    const expectedClientKeyLegacy = await generateClientKeyLegacy(
      meta,
      record.userId,
      record.sessionId
    );

    const isValidFingerprint =
      clientKey === expectedClientKey ||
      clientKey === expectedClientKeyLegacy;

    if (!isValidFingerprint) {
      await loggerSecurityEvent({
        meta,
        type: "client_key_mismatch",
        userId: record.userId,
        sessionId: record.sessionId,
        details: {
          receivedClientKey: clientKey,
          expectedNew: expectedClientKey,
          expectedLegacy: expectedClientKeyLegacy,
        },
      });

      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "This token was not generated from this device or IP address.",
        ERROR_CODE.INVALID_CLIENT_KEY
      );
    }

    // 🔄 Validar también contra session.clientKey
    // La session puede estar en nuevo formato mientras el cliente envía legacy
    // Solo validamos que la session coincida con uno de los dos formatos esperados
    const isValidSessionFingerprint =
      record.session.clientKey === expectedClientKey ||
      record.session.clientKey === expectedClientKeyLegacy;

    appAssert(
      isValidSessionFingerprint,
      HTTP_CODE.UNAUTHORIZED,
      "Session fingerprint does not match expected format.",
      ERROR_CODE.INVALID_CLIENT_KEY
    );

    // 🔐 VALIDACIÓN ADICIONAL: Verificar IP contra Device.ipAddress
    // Esta validación previene que una sesión siga siendo válida si la IP
    // del dispositivo fue modificada en la base de datos
    if (record.session.device.ipAddress !== meta.ipAddress) {
      await loggerSecurityEvent({
        meta,
        type: "ip_mismatch",
        userId: record.userId,
        sessionId: record.sessionId,
        details: {
          requestIp: meta.ipAddress,
          storedIp: record.session.device.ipAddress,
          message: "IP address does not match stored device IP",
        },
      });

      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "IP address does not match stored device. Session may have been compromised.",
        ERROR_CODE.INVALID_CLIENT_KEY
      );
    }

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
