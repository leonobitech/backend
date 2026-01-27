/**
 * 🔐 PASSKEY RECOVERY SERVICE
 *
 * Maneja la recuperación de acceso cuando el usuario pierde su teléfono
 * y no puede verificar con su passkey.
 *
 * Flujo:
 * 1. Usuario intenta login pero no puede verificar passkey
 * 2. Solicita recuperación → se envía OTP al email
 * 3. Usuario ingresa OTP → se valida
 * 4. Usuario puede configurar nuevo passkey
 */

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { redis } from "@config/redis";
import prisma from "@config/prisma";
import { ERROR_CODE } from "@constants/errorCode";
import { HTTP_CODE } from "@constants/httpCode";
import HttpException from "@utils/http/HttpException";
import { hashValue, compareValue } from "@utils/auth/bcrypt";
import { sendPasskeyRecoveryEmail } from "@utils/notifications/sendMail";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { verifyPendingToken, generatePendingToken } from "@utils/auth/pendingToken";

// TTL de 10 minutos para el código de recuperación
const RECOVERY_CODE_TTL_SECONDS = 10 * 60;
const MAX_RECOVERY_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hora

interface StoredRecoveryCode {
  hashedCode: string;
  userId: string;
  email: string;
  attempts: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * 📧 Solicitar recuperación de passkey
 *
 * Envía un código OTP al email del usuario para recuperar acceso.
 *
 * @param pendingToken - Token pendiente del paso anterior
 * @returns Datos del request de recuperación
 */
export async function requestPasskeyRecovery(pendingToken: string) {
  // 1️⃣ Verificar token pendiente
  const tokenData = await verifyPendingToken(pendingToken);

  loggerEvent(
    "passkey.recovery.request.start",
    { userId: tokenData.userId, email: tokenData.email },
    undefined,
    "passkeyRecovery.service"
  );

  // 2️⃣ Verificar rate limiting
  const rateLimitKey = `passkey:recovery:ratelimit:${tokenData.userId}`;
  const attempts = await redis.incr(rateLimitKey);

  if (attempts === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
  }

  if (attempts > 3) {
    loggerEvent(
      "passkey.recovery.request.rate_limited",
      { userId: tokenData.userId, attempts },
      undefined,
      "passkeyRecovery.service"
    );
    throw new HttpException(
      HTTP_CODE.TOO_MANY_REQUESTS,
      "Too many recovery attempts. Please try again later.",
      ERROR_CODE.TOO_MANY_RECOVERY_ATTEMPTS
    );
  }

  // 3️⃣ Generar código OTP
  const recoveryCode = crypto.randomInt(100000, 999999).toString();
  const hashedCode = await hashValue(recoveryCode);
  const requestId = uuidv4();

  // 4️⃣ Guardar en Redis
  const storedData: StoredRecoveryCode = {
    hashedCode,
    userId: tokenData.userId,
    email: tokenData.email,
    attempts: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + RECOVERY_CODE_TTL_SECONDS * 1000,
  };

  const redisKey = `passkey:recovery:${requestId}`;
  await redis.setEx(redisKey, RECOVERY_CODE_TTL_SECONDS, JSON.stringify(storedData));

  // 5️⃣ Enviar email
  await sendPasskeyRecoveryEmail(tokenData.email, recoveryCode);

  loggerEvent(
    "passkey.recovery.request.complete",
    { userId: tokenData.userId, requestId },
    undefined,
    "passkeyRecovery.service"
  );

  return {
    requestId,
    email: tokenData.email,
    expiresIn: RECOVERY_CODE_TTL_SECONDS,
  };
}

/**
 * ✅ Verificar código de recuperación
 *
 * Valida el código OTP y genera un nuevo pending token para configurar passkey.
 *
 * @param requestId - ID del request de recuperación
 * @param code - Código OTP ingresado
 * @returns Nuevo pending token para setup
 */
export async function verifyRecoveryCode(
  requestId: string,
  code: string
) {
  const redisKey = `passkey:recovery:${requestId}`;

  loggerEvent(
    "passkey.recovery.verify.start",
    { requestId },
    undefined,
    "passkeyRecovery.service"
  );

  // 1️⃣ Buscar datos en Redis
  const storedDataRaw = await redis.get(redisKey);

  if (!storedDataRaw) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      "Recovery code expired or not found",
      ERROR_CODE.RECOVERY_CODE_EXPIRED
    );
  }

  const storedData: StoredRecoveryCode = JSON.parse(storedDataRaw);

  // 2️⃣ Verificar expiración
  if (storedData.expiresAt < Date.now()) {
    await redis.del(redisKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      "Recovery code expired",
      ERROR_CODE.RECOVERY_CODE_EXPIRED
    );
  }

  // 3️⃣ Verificar intentos
  if (storedData.attempts >= MAX_RECOVERY_ATTEMPTS) {
    await redis.del(redisKey);
    loggerEvent(
      "passkey.recovery.verify.max_attempts",
      { requestId, userId: storedData.userId },
      undefined,
      "passkeyRecovery.service"
    );
    throw new HttpException(
      HTTP_CODE.TOO_MANY_REQUESTS,
      "Too many failed attempts. Please request a new code.",
      ERROR_CODE.TOO_MANY_RECOVERY_ATTEMPTS
    );
  }

  // 4️⃣ Verificar código
  const isValid = await compareValue(code, storedData.hashedCode);

  if (!isValid) {
    // Incrementar intentos
    storedData.attempts += 1;
    await redis.setEx(
      redisKey,
      Math.ceil((storedData.expiresAt - Date.now()) / 1000),
      JSON.stringify(storedData)
    );

    loggerEvent(
      "passkey.recovery.verify.invalid_code",
      { requestId, userId: storedData.userId, attempts: storedData.attempts },
      undefined,
      "passkeyRecovery.service"
    );

    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      "Invalid recovery code",
      ERROR_CODE.RECOVERY_CODE_INVALID
    );
  }

  // 5️⃣ Eliminar código usado
  await redis.del(redisKey);

  // 6️⃣ Eliminar passkeys existentes del usuario (perdió el teléfono)
  await prisma.passkey.deleteMany({
    where: { userId: storedData.userId },
  });

  loggerEvent(
    "passkey.recovery.verify.passkeys_deleted",
    { userId: storedData.userId },
    undefined,
    "passkeyRecovery.service"
  );

  // 7️⃣ Generar nuevo pending token para setup
  const pendingTokenResult = await generatePendingToken(
    storedData.userId,
    storedData.email,
    false // hasPasskey = false porque los eliminamos
  );

  loggerEvent(
    "passkey.recovery.verify.complete",
    { userId: storedData.userId, requestId },
    undefined,
    "passkeyRecovery.service"
  );

  return {
    userId: storedData.userId,
    email: storedData.email,
    pendingToken: pendingTokenResult.pendingToken,
    expiresIn: pendingTokenResult.expiresIn,
  };
}
