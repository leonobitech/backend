// 📁 @services/magicLink.service.ts

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import VerificationCodeType from "@constants/verificationCodeType";
import { API_STATUS } from "@constants/apiStatus";

import prisma from "@config/prisma";
import { APP_ORIGIN } from "@config/env";

import { fiveMinutesFromNow } from "@utils/date/date";
import { sendMagicLinkEmail } from "@utils/notifications/sendMail";
import { hashValue, compareValue } from "@utils/auth/bcrypt";
import { generatePendingToken } from "@utils/auth/pendingToken";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";
import { loggerAudit } from "@utils/logging/loggerAudit";

import type {
  MagicLinkSentResponse,
  MagicLinkVerifyResponse,
  LoginPasskeySetupRequiredResponse,
  LoginPasskeyVerifyRequiredResponse,
  MagicLinkOnboardingRequiredResponse,
} from "@custom-types/modules/auth/account";

/**
 * 🔑 Solicita un magic link para login/registro.
 *
 * Si el email no existe, crea el usuario automáticamente.
 * Siempre retorna éxito para evitar enumeración de emails.
 */
export const requestMagicLinkService = async (
  email: string
): Promise<MagicLinkSentResponse> => {
  const sanitizedEmail = email.trim().toLowerCase();

  // Buscar o crear usuario
  let user = await prisma.user.findUnique({
    where: { email: sanitizedEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: sanitizedEmail,
        verified: false,
      },
    });

    logger.info("👤 New user created via magic link", {
      userId: user.id,
      email: sanitizedEmail,
      event: "user.created.magic_link",
    });
  }

  // Invalidar códigos anteriores no usados
  await prisma.verificationCode.updateMany({
    where: {
      userId: user.id,
      type: VerificationCodeType.MagicLink,
      used: false,
    },
    data: { used: true },
  });

  // Generar token seguro
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = await hashValue(rawToken);
  const requestId = uuidv4();

  await prisma.verificationCode.create({
    data: {
      userId: user.id,
      type: VerificationCodeType.MagicLink,
      hashedCode: hashedToken,
      requestId,
      expiresAt: fiveMinutesFromNow(),
    },
  });

  // Construir magic link URL
  const magicLinkUrl = `${APP_ORIGIN}/auth/verify?token=${rawToken}&rid=${requestId}`;

  // Enviar email
  await sendMagicLinkEmail(sanitizedEmail, magicLinkUrl);

  logger.info("🔑 Magic link sent", {
    userId: user.id,
    email: sanitizedEmail,
    event: "magic_link.sent",
  });

  return {
    status: API_STATUS.MAGIC_LINK_SENT,
    message: "Check your email for a login link.",
    data: {
      email: sanitizedEmail,
      expiresIn: 300,
    },
  };
};

/**
 * 🔓 Verifica un magic link token y emite un pendingToken.
 *
 * Retorna uno de tres estados:
 * - ONBOARDING_REQUIRED: usuario nuevo sin nombre → ir a onboarding
 * - PASSKEY_SETUP_REQUIRED: sin passkey → ir a setup
 * - PASSKEY_VERIFY_REQUIRED: tiene passkey → ir a verify
 */
export const verifyMagicLinkService = async (
  token: string,
  requestId: string
): Promise<MagicLinkVerifyResponse> => {
  // Buscar el verification code por requestId
  const verificationCode = await prisma.verificationCode.findUnique({
    where: { requestId },
    include: { user: true },
  });

  appAssert(
    verificationCode,
    HTTP_CODE.BAD_REQUEST,
    "Invalid or expired magic link.",
    ERROR_CODE.INVALID_VERIFICATION_CODE
  );

  appAssert(
    !verificationCode.used,
    HTTP_CODE.BAD_REQUEST,
    "This magic link has already been used.",
    ERROR_CODE.INVALID_VERIFICATION_CODE
  );

  appAssert(
    verificationCode.type === VerificationCodeType.MagicLink,
    HTTP_CODE.BAD_REQUEST,
    "Invalid verification type.",
    ERROR_CODE.INVALID_VERIFICATION_CODE
  );

  // Verificar expiración
  const isExpired = verificationCode.expiresAt < new Date();
  if (isExpired) {
    // Marcar como usado y reenviar automáticamente
    await prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true },
    });

    // Generar nuevo magic link
    const newRawToken = crypto.randomBytes(32).toString("hex");
    const newHashedToken = await hashValue(newRawToken);
    const newRequestId = uuidv4();

    await prisma.verificationCode.create({
      data: {
        userId: verificationCode.userId,
        type: VerificationCodeType.MagicLink,
        hashedCode: newHashedToken,
        requestId: newRequestId,
        expiresAt: fiveMinutesFromNow(),
      },
    });

    const magicLinkUrl = `${APP_ORIGIN}/auth/verify?token=${newRawToken}&rid=${newRequestId}`;
    await sendMagicLinkEmail(verificationCode.user.email, magicLinkUrl);

    appAssert(
      false,
      HTTP_CODE.BAD_REQUEST,
      "Magic link expired. A new one has been sent to your email.",
      ERROR_CODE.CODE_EXPIRED
    );
  }

  // Comparar token
  const isValid = await compareValue(token, verificationCode.hashedCode);
  appAssert(
    isValid,
    HTTP_CODE.BAD_REQUEST,
    "Invalid magic link.",
    ERROR_CODE.INVALID_VERIFICATION_CODE
  );

  // Marcar como usado
  await prisma.verificationCode.update({
    where: { id: verificationCode.id },
    data: { used: true },
  });

  const user = verificationCode.user;

  // Marcar usuario como verificado
  if (!user.verified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { verified: true },
    });
  }

  // Contar passkeys del usuario
  const passkeyCount = await prisma.passkey.count({
    where: { userId: user.id },
  });
  const hasPasskey = passkeyCount > 0;

  // Generar pending token para el siguiente paso
  const pending = await generatePendingToken(user.id, user.email, hasPasskey);

  await loggerAudit("magic_link.verified", {
    performedBy: user.id,
    email: user.email,
    hasPasskey,
    isNewUser: !user.name,
  });

  // Usuario nuevo sin nombre → onboarding
  if (!user.name) {
    return {
      status: API_STATUS.ONBOARDING_REQUIRED,
      message: "Please complete your profile.",
      data: {
        userId: user.id,
        email: user.email,
        pendingToken: pending.pendingToken,
        expiresIn: pending.expiresIn,
      },
    } satisfies MagicLinkOnboardingRequiredResponse;
  }

  // Sin passkey → setup
  if (!hasPasskey) {
    return {
      status: API_STATUS.PASSKEY_SETUP_REQUIRED,
      message: "Please set up your passkey for secure access.",
      data: {
        userId: user.id,
        email: user.email,
        pendingToken: pending.pendingToken,
        expiresIn: pending.expiresIn,
      },
    } satisfies LoginPasskeySetupRequiredResponse;
  }

  // Tiene passkey → verify
  return {
    status: API_STATUS.PASSKEY_VERIFY_REQUIRED,
    message: "Please verify your identity with your passkey.",
    data: {
      userId: user.id,
      email: user.email,
      pendingToken: pending.pendingToken,
      expiresIn: pending.expiresIn,
    },
  } satisfies LoginPasskeyVerifyRequiredResponse;
};

/**
 * 📝 Completa el onboarding de un usuario nuevo.
 *
 * Actualiza el nombre y retorna un nuevo pendingToken
 * para continuar al passkey setup.
 */
export const completeOnboardingService = async (
  userId: string,
  email: string,
  name: string
): Promise<LoginPasskeySetupRequiredResponse> => {
  // Actualizar nombre
  await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });

  // Generar nuevo pending token para passkey setup
  const pending = await generatePendingToken(userId, email, false);

  await loggerAudit("user.onboarding.completed", {
    performedBy: userId,
    name: name.trim(),
  });

  return {
    status: API_STATUS.PASSKEY_SETUP_REQUIRED,
    message: "Profile updated. Please set up your passkey.",
    data: {
      userId,
      email,
      pendingToken: pending.pendingToken,
      expiresIn: pending.expiresIn,
    },
  };
};
