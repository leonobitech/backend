/**
 * 🔐 PENDING TOKEN UTILITY
 *
 * Maneja tokens temporales para el flujo de 2FA con passkey.
 * Este token se emite después de validar email/password pero ANTES
 * de completar la verificación con passkey.
 *
 * Características:
 * - TTL corto: 5 minutos
 * - Almacenado en Redis
 * - Solo permite acceso a endpoints de passkey setup/verify
 */

import { redis } from "@config/redis";
import { randomUUID, createHash } from "crypto";
import { SignJWT, jwtVerify, decodeJwt } from "jose";
import { JWT_SECRET, JWT_ISSUER } from "@config/env";
import { Audience } from "@constants/audience";
import { ERROR_CODE } from "@constants/errorCode";
import { HTTP_CODE } from "@constants/httpCode";
import HttpException from "@utils/http/HttpException";

// TTL de 5 minutos para el token pendiente
const PENDING_TOKEN_TTL_MS = 5 * 60 * 1000;
const PENDING_TOKEN_TTL_SECONDS = 5 * 60;

export interface PendingTokenPayload {
  userId: string;
  email: string;
  hasPasskey: boolean;
  aud: Audience.PasskeyPending;
  exp: number;
}

export interface StoredPendingToken {
  userId: string;
  email: string;
  hasPasskey: boolean;
  createdAt: number;
  expiresAt: number;
}

/**
 * 🔐 Genera un token pendiente después de validar email/password
 *
 * @param userId - ID del usuario
 * @param email - Email del usuario
 * @param hasPasskey - Si el usuario ya tiene passkey registrada
 * @returns Token pendiente y datos para el frontend
 */
export async function generatePendingToken(
  userId: string,
  email: string,
  hasPasskey: boolean
): Promise<{
  pendingToken: string;
  pendingTokenId: string;
  requiresPasskeySetup: boolean;
  requiresPasskeyVerify: boolean;
  expiresIn: number;
}> {
  const tokenId = randomUUID();
  const hashedTokenId = createHash("sha256").update(tokenId).digest("hex");

  const expirationTime = Math.floor((Date.now() + PENDING_TOKEN_TTL_MS) / 1000);

  const payload: PendingTokenPayload = {
    userId,
    email,
    hasPasskey,
    aud: Audience.PasskeyPending,
    exp: expirationTime,
  };

  // Firmar el token
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS512" })
    .setIssuer(JWT_ISSUER)
    .setAudience(Audience.PasskeyPending)
    .setJti(tokenId)
    .setSubject(userId)
    .setExpirationTime(expirationTime)
    .setIssuedAt(Math.floor(Date.now() / 1000))
    .sign(new TextEncoder().encode(JWT_SECRET));

  // Guardar en Redis para validación posterior
  const storedData: StoredPendingToken = {
    userId,
    email,
    hasPasskey,
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_TOKEN_TTL_MS,
  };

  const redisKey = `passkey:pending:${hashedTokenId}`;
  await redis.setEx(redisKey, PENDING_TOKEN_TTL_SECONDS, JSON.stringify(storedData));

  return {
    pendingToken: token,
    pendingTokenId: hashedTokenId,
    requiresPasskeySetup: !hasPasskey,
    requiresPasskeyVerify: hasPasskey,
    expiresIn: PENDING_TOKEN_TTL_SECONDS,
  };
}

/**
 * 🔍 Verifica y extrae datos de un token pendiente
 *
 * @param token - Token pendiente a verificar
 * @returns Datos del usuario si el token es válido
 */
export async function verifyPendingToken(token: string): Promise<{
  userId: string;
  email: string;
  hasPasskey: boolean;
}> {
  try {
    // Verificar firma del token
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
      {
        issuer: JWT_ISSUER,
        audience: Audience.PasskeyPending,
      }
    );

    if (!payload.jti || !payload.sub) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Invalid pending token structure",
        ERROR_CODE.INVALID_PENDING_TOKEN
      );
    }

    // Hashear el JTI para buscar en Redis
    const hashedTokenId = createHash("sha256").update(payload.jti).digest("hex");
    const redisKey = `passkey:pending:${hashedTokenId}`;

    // Verificar que existe en Redis (no fue revocado/usado)
    const storedData = await redis.get(redisKey);

    if (!storedData) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Pending token expired or already used",
        ERROR_CODE.PENDING_TOKEN_EXPIRED
      );
    }

    const parsed: StoredPendingToken = JSON.parse(storedData);

    // Verificar que no ha expirado
    if (parsed.expiresAt < Date.now()) {
      await redis.del(redisKey);
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Pending token expired",
        ERROR_CODE.PENDING_TOKEN_EXPIRED
      );
    }

    return {
      userId: parsed.userId,
      email: parsed.email,
      hasPasskey: parsed.hasPasskey,
    };
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      "Invalid or expired pending token",
      ERROR_CODE.INVALID_PENDING_TOKEN
    );
  }
}

/**
 * 🗑️ Invalida/consume un token pendiente (después de usarlo)
 *
 * @param token - Token pendiente a invalidar
 */
export async function consumePendingToken(token: string): Promise<void> {
  try {
    const decoded = decodeJwt(token);

    if (!decoded.jti) return;

    const hashedTokenId = createHash("sha256").update(decoded.jti).digest("hex");
    const redisKey = `passkey:pending:${hashedTokenId}`;

    await redis.del(redisKey);
  } catch {
    // Ignorar errores al consumir token (puede que ya no exista)
  }
}

/**
 * 🔍 Extrae el userId de un token pendiente sin verificar completamente
 * Útil para logging y debugging
 *
 * @param token - Token pendiente
 * @returns userId o null si no se puede extraer
 */
export function extractUserIdFromPendingToken(token: string): string | null {
  try {
    const decoded = decodeJwt(token);
    return decoded.sub as string || null;
  } catch {
    return null;
  }
}
