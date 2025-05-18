// 📁 @services/account.service.ts

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import VerificationCodeType from "@constants/verificationCodeType";

import prisma from "@config/prisma";

import { fiveMinutesFromNow, thirtyDaysFromNow } from "@utils/date/date";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendDeviceValidationEmail,
} from "@utils/notifications/sendMail";

import appAssert from "@utils/validation/appAssert";

import { compareValue, hashValue } from "@utils/auth/bcrypt";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "@utils/auth/jwt";

import HttpException from "@utils/http/HttpException";

import { UserRole } from "@constants/userRole";
import { SupportedLang } from "@constants/errorMessages";

import {
  type CreateAccountParams,
  type CreateAccountResponse,
  type VerifyEmailParams,
  type VerifyEmailResult,
  type LoginParams,
  type LoginResponse,
  type LoginDeviceCheckResponse,
  type RefreshTokenResponse,
  type LogoutResponse,
  type LogoutOthersResponse,
  type ResetPasswordRequest,
  type ResetPasswordParamsRequest,
  type ResetPasswordRequestResponse,
  type ResetPasswordResponse,
} from "@custom-types/modules/auth/account";
import { API_STATUS } from "@constants/apiStatus";
import { getJwtExpiration } from "@utils/auth/getJwtExpiration";
import { generateClientKeyFromMeta } from "@utils/auth/generateClientKey";
import logger from "@utils/logging/logger";
import { findOrCreateDevice } from "@utils/auth/findOrCreateDevice";
import { findRefreshTokenByClientKey } from "@utils/auth/tokenDatabase";
import { loggerSecurityEvent } from "@utils/logging/loggerSecurityEvent";
import { revokeAccessToken } from "@utils/auth/tokenRedis";
import { loggerAudit } from "@utils/logging/loggerAudit";
import { createNewDevice } from "@utils/auth/createNewDevice";
import { checkDeviceOrSendVerification } from "@utils/auth/checkDeviceOrSendVerification";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { TokenType } from "@prisma/client";

export const createAccountService = async (
  data: CreateAccountParams
): Promise<CreateAccountResponse> => {
  // 1️⃣ Verificar si el email ya está registrado
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  appAssert(
    !existingUser,
    HTTP_CODE.CONFLICT,
    "Email is already in use.",
    ERROR_CODE.CONFLICT,
    [
      {
        field: "email",
        message: "This email address is already registered.",
      },
    ]
  );

  // 2️⃣ Hashear la contraseña
  const hashedPassword = await hashValue(data.password);

  // 3️⃣ Crear el usuario
  const newUser = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      verified: false,
    },
  });

  // 4️⃣ Generar código de verificación
  const verificationCode = crypto.randomInt(100000, 999999).toString();
  const hashedCode = await hashValue(verificationCode);
  const requestId = uuidv4();

  const verifyCode = await prisma.verificationCode.create({
    data: {
      userId: newUser.id,
      type: VerificationCodeType.EmailVerification,
      hashedCode,
      requestId,
      expiresAt: fiveMinutesFromNow(),
    },
  });

  // 5️⃣ Enviar email de verificación
  await sendVerificationEmail(newUser.email, verificationCode);

  // 6️⃣ Logger del registro
  logger.info("👤 Registro con metadata", {
    ...data.meta,
    email: newUser.email,
    userId: newUser.id,
    event: "user.registered.with.meta",
  });

  const expiresIn = Math.floor(
    (verifyCode.expiresAt.getTime() - Date.now()) / 1000
  );
  // ✅ Retornar estructura profesional y expandible
  return {
    status: API_STATUS.CREATED,
    message: "Account created successfully. Please verify your email.",
    data: {
      userId: newUser.id,
      email: newUser.email,
      requestId: requestId,
      expiresIn: expiresIn,
      verified: false,
    },
  };
};

export const verifyEmailService = async ({
  email,
  code,
  requestId,
  meta,
}: VerifyEmailParams): Promise<VerifyEmailResult> => {
  // 1. Buscar al usuario
  const user = await prisma.user.findUnique({ where: { email } });
  appAssert(
    user,
    HTTP_CODE.NOT_FOUND,
    "User not found. Please check the email or register.",
    ERROR_CODE.USER_NOT_FOUND,
    [
      {
        field: "email",
        message: "No user found with this email.",
      },
    ]
  );

  // 2. Buscar el código de verificación (más recientes primero)
  const validCode = await prisma.verificationCode.findUnique({
    where: { requestId },
  });

  // 3. Si no hay código y el usuario ya está verificado
  if (!validCode) {
    if (user.verified) {
      return {
        status: "alreadyVerified",
        message: "Your email is already verified.",
        alreadyVerified: true,
      };
    }
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      "Invalid or expired verification code.",
      ERROR_CODE.INVALID_VERIFICATION_CODE,
      [
        {
          field: "code",
          message: "The code provided is invalid or already used.",
        },
      ]
    );
  }

  // 4. Validar que el código pertenece al usuario correcto
  appAssert(
    validCode.userId === user.id,
    HTTP_CODE.UNAUTHORIZED,
    "Este código no pertenece a este usuario.",
    ERROR_CODE.INVALID_VERIFICATION_CODE
  );

  // 5. Validar que no fue usado
  appAssert(
    !validCode.used,
    HTTP_CODE.UNAUTHORIZED,
    "Este código ya fue utilizado.",
    ERROR_CODE.INVALID_VERIFICATION_CODE
  );

  // 6. Validar el valor del código (comparación con hash)
  const isValid = await compareValue(code, validCode.hashedCode);
  appAssert(
    isValid,
    HTTP_CODE.UNAUTHORIZED,
    "Invalid verification code.",
    ERROR_CODE.INVALID_VERIFICATION_CODE,
    [
      {
        field: "code",
        message: "The code entered is incorrect.",
      },
    ]
  );

  // 7. Validar expiración
  const isExpired = validCode.expiresAt < new Date();
  if (isExpired) {
    const newCode = crypto.randomInt(100000, 999999).toString();
    const hashedNewCode = await hashValue(newCode);
    const newRequestId = uuidv4();

    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        type: validCode.type, // ✅ mismo tipo que el original
        hashedCode: hashedNewCode,
        requestId: newRequestId,
        expiresAt: fiveMinutesFromNow(),
      },
    });

    if (validCode.type === VerificationCodeType.EmailVerification) {
      await sendVerificationEmail(user.email, newCode);
    } else if (validCode.type === VerificationCodeType.DeviceValidation) {
      await sendDeviceValidationEmail(user.email, newCode);
    }

    return {
      status: "resend",
      message: "Your code has expired. A new one was sent to your email.",
      requestId: newRequestId,
      expiresIn: 300,
      resend: true,
    };
  }

  // 8. Marcar códigos anteriores como usados y limpiar
  await prisma.verificationCode.updateMany({
    where: {
      userId: user.id,
      type: validCode.type,
    },
    data: { used: true },
  });

  await prisma.verificationCode.deleteMany({
    where: {
      userId: user.id,
      type: validCode.type,
      used: true,
    },
  });

  // 9. Si es email verification → marcar usuario como verificado
  if (
    validCode.type === VerificationCodeType.EmailVerification &&
    !user.verified
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { verified: true },
    });
  }

  // 10. Crear dispositivo para esta sesión
  const device = await createNewDevice(user.id, meta);

  // 11. Crear la sesión
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceId: device.id,
      clientKey: "",
      expiresAt: thirtyDaysFromNow(),
    },
  });

  const hashedPublicKey = await generateClientKeyFromMeta(
    meta,
    user.id,
    session.id
  );

  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  // 12. Generar tokens
  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(
      user.id,
      session.id,
      user.role as UserRole,
      hashedPublicKey
    );

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(
      user.id,
      session.id,
      user.role as UserRole,
      hashedPublicKey
    );

  await prisma.tokenRecord.createMany({
    data: [
      {
        jti: accessTokenId,
        type: "ACCESS",
        token: accessToken,
        sessionId: session.id,
        userId: user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(accessToken),
        revoked: false,
      },
      {
        jti: refreshTokenId,
        type: "REFRESH",
        token: refreshToken,
        sessionId: session.id,
        userId: user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(refreshToken),
        revoked: false,
      },
    ],
  });

  // 13. Final: retornar payload
  return {
    status: API_STATUS.VERIFIED,
    message: "Your verification was successful.",
    data: {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      role: user.role as UserRole,
    },
    tokens: {
      accessTokenId,
      hashedPublicKey,
    },
  };
};

export const loginService = async ({
  email,
  password,
  meta,
}: LoginParams): Promise<LoginResponse | LoginDeviceCheckResponse> => {
  const user = await prisma.user.findUnique({ where: { email } });

  appAssert(
    user,
    HTTP_CODE.UNAUTHORIZED,
    "Credenciales inválidas",
    ERROR_CODE.INVALID_CREDENTIALS
  );

  appAssert(
    user.verified,
    HTTP_CODE.UNAUTHORIZED,
    "Debes verificar tu email antes de iniciar sesión",
    ERROR_CODE.EMAIL_NOT_VERIFIED
  );

  const isMatch = await compareValue(password, user.password);

  appAssert(
    isMatch,
    HTTP_CODE.UNAUTHORIZED,
    "Credenciales inválidas",
    ERROR_CODE.INVALID_CREDENTIALS
  );

  // 🔎 Buscar o registrar el dispositivo
  // Revisar si el dispositivo ya existe y no crear uno nuevo.
  // sino existe valida por email antes de crear uno nuevo.
  const result = await checkDeviceOrSendVerification(user.id, user.email, meta);

  if (result.status === API_STATUS.DEVICE_PENDING_VERIFICATION) {
    loggerEvent("user.device.verification_started", {
      userId: user.id,
      email: user.email,
      source: "loginService",
    });
    return result;
  }

  // 🧠 Crear la sesión
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceId: result.data.deviceId,
      clientKey: "",
      expiresAt: thirtyDaysFromNow(),
    },
  });

  // 🔐 Generar huella digital (clientKey)
  const hashedPublicKey = await generateClientKeyFromMeta(
    meta,
    user.id,
    session.id
  );

  // ⬇️ Guardar clientKey en la sesión
  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  // 🔐 Firmar tokens
  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(
      user.id,
      session.id,
      user.role as UserRole,
      hashedPublicKey
    );

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(
      user.id,
      session.id,
      user.role as UserRole,
      hashedPublicKey
    );

  // 🧾 Registrar tokens en TokenRecord
  await prisma.tokenRecord.createMany({
    data: [
      {
        jti: accessTokenId,
        type: "ACCESS",
        token: accessToken,
        sessionId: session.id,
        userId: user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(accessToken),
        revoked: false,
      },
      {
        jti: refreshTokenId,
        type: "REFRESH",
        token: refreshToken,
        sessionId: session.id,
        userId: user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(refreshToken),
        revoked: false,
      },
    ],
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Login successful.",
    data: {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      role: user.role as UserRole,
    },
    tokens: {
      accessTokenId,
      hashedPublicKey,
    },
  };
};

export const refreshAccessTokenService = async (
  clientKey: string,
  meta: RequestMeta,
  lang: SupportedLang
): Promise<RefreshTokenResponse> => {
  // Se busca el registro del refresh token usando la publicKey (clientKey)
  const tokenRecord = await findRefreshTokenByClientKey(clientKey);

  appAssert(
    tokenRecord,
    HTTP_CODE.UNAUTHORIZED,
    "No valid refresh token found.",
    ERROR_CODE.INVALID_REFRESH_TOKEN
  );

  appAssert(
    tokenRecord.expiresAt > new Date(),
    HTTP_CODE.UNAUTHORIZED,
    "Refresh token expired.",
    ERROR_CODE.TOKEN_EXPIRED
  );

  // 🔐 Validación estricta de huella digital: Se reconstruye el fingerprint esperado
  const expectedClientKey = await generateClientKeyFromMeta(
    meta,
    tokenRecord.user.id,
    tokenRecord.session.id
  );

  // Si la huella generada no coincide con la registrada, se loguea el evento y se rechaza la solicitud.
  if (expectedClientKey !== tokenRecord.publicKey) {
    await loggerSecurityEvent({
      meta,
      type: "auth.refresh.fingerprint.mismatch",
      userId: tokenRecord.user.id,
      sessionId: tokenRecord.session.id,
      details: {
        expected: tokenRecord.publicKey,
        received: expectedClientKey,
        meta,
      },
    });
    appAssert(
      false,
      HTTP_CODE.UNAUTHORIZED,
      "Fingerprint mismatch on refresh.",
      ERROR_CODE.FINGERPRINT_MISMATCH
    );
  }

  // Verificación del token registrado
  const { payload } = await verifyToken(tokenRecord.token, lang);

  appAssert(
    payload.sessionId === tokenRecord.sessionId,
    HTTP_CODE.UNAUTHORIZED,
    "Session mismatch.",
    ERROR_CODE.INVALID_SESSION
  );

  const { user, session } = tokenRecord;

  // 🔐 Generar nuevos tokens utilizando el clientKey recibido (que coincide con la huella original)
  const newAccess = await generateAccessToken(
    user.id,
    session.id,
    user.role as UserRole,
    clientKey
  );
  const newRefresh = await generateRefreshToken(
    user.id,
    session.id,
    user.role as UserRole,
    clientKey
  );

  // 🔄 Sobrescribir registros existentes en DB
  await prisma.tokenRecord.updateMany({
    where: {
      sessionId: session.id,
      userId: user.id,
      publicKey: clientKey,
      type: "ACCESS",
    },
    data: {
      jti: newAccess.hashedJti,
      token: newAccess.token,
      expiresAt: await getJwtExpiration(newAccess.token),
      revoked: false,
    },
  });

  await prisma.tokenRecord.updateMany({
    where: {
      sessionId: session.id,
      userId: user.id,
      publicKey: clientKey,
      type: "REFRESH",
    },
    data: {
      jti: newRefresh.hashedJti,
      token: newRefresh.token,
      expiresAt: await getJwtExpiration(newRefresh.token),
      revoked: false,
    },
  });

  return {
    status: API_STATUS.REFRESHED,
    message: "Access token refreshed successfully.",
    data: {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
    },
    tokens: {
      accessTokenId: newAccess.hashedJti,
      hashedPublicKey: clientKey,
      accessToken: newAccess.token,
    },
  };
};

export const logoutService = async (
  clientKey: string,
  meta: RequestMeta,
  lang: SupportedLang
): Promise<LogoutResponse> => {
  // 1️⃣ Buscar el refresh token por fingerprint (clientKey)
  const tokenRecord = await findRefreshTokenByClientKey(clientKey);

  appAssert(
    tokenRecord,
    HTTP_CODE.UNAUTHORIZED,
    "No valid refresh token found.",
    ERROR_CODE.INVALID_REFRESH_TOKEN
  );

  // 2️⃣ Validar fingerprint actual contra la esperada
  const expectedClientKey = await generateClientKeyFromMeta(
    meta,
    tokenRecord.user.id,
    tokenRecord.session.id
  );

  appAssert(
    expectedClientKey === tokenRecord.publicKey,
    HTTP_CODE.UNAUTHORIZED,
    "Fingerprint mismatch on logout.",
    ERROR_CODE.FINGERPRINT_MISMATCH
  );

  // 🔐 Log si hay mismatch (para trazabilidad)
  if (expectedClientKey !== tokenRecord.publicKey) {
    await loggerSecurityEvent({
      meta,
      type: "auth.logout.fingerprint.mismatch",
      userId: tokenRecord.user.id,
      sessionId: tokenRecord.session.id,
      details: {
        expected: tokenRecord.publicKey,
        received: expectedClientKey,
      },
    });
  }

  // 3️⃣ Verificar el refreshToken (Zod y claims)
  const { payload } = await verifyToken(tokenRecord.token, lang);

  appAssert(
    payload.sessionId === tokenRecord.session.id,
    HTTP_CODE.UNAUTHORIZED,
    "Session mismatch.",
    ERROR_CODE.INVALID_SESSION
  );

  // 4️⃣ Eliminar el token ACCESS de Redis (por jti o accessKey)
  // 🧠 Buscar el token ACCESS para esta sesión
  const accessTokenRecord = await prisma.tokenRecord.findFirst({
    where: {
      sessionId: tokenRecord.session.id,
      userId: tokenRecord.user.id,
      type: "ACCESS",
      revoked: false,
    },
  });

  if (accessTokenRecord) {
    await revokeAccessToken(accessTokenRecord.jti); // 🧹 Borrar de Redis
  }

  // 5️⃣ Revocar todos los tokens relacionados con esta sesión
  await prisma.tokenRecord.updateMany({
    where: {
      sessionId: tokenRecord.session.id,
      userId: tokenRecord.user.id,
      revoked: false,
    },
    data: {
      revoked: true,
    },
  });

  // 6️⃣ Buscar la sesión activa por clientKey (más preciso)
  const session = await prisma.session.findFirst({
    where: {
      userId: tokenRecord.user.id,
      clientKey: tokenRecord.publicKey,
      isRevoked: false,
    },
  });

  if (session) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        isRevoked: true,
        lastUsedAt: new Date(),
      },
    });
  }

  // 7️⃣ Registrar auditoría
  await loggerAudit("user.logged_out", {
    performedBy: tokenRecord.user.id,
    sessionId: tokenRecord.session.id,
    clientKey,
  });

  // 8️⃣ Respuesta final
  return {
    status: "loggedOut",
    message: "Sesión cerrada correctamente.",
    data: {
      userId: tokenRecord.user.id,
      sessionId: tokenRecord.session.id,
    },
  };
};

export const logoutAllOtherSessionsService = async (
  clientKey: string,
  meta: RequestMeta,
  lang: SupportedLang
): Promise<LogoutOthersResponse> => {
  const tokenRecord = await findRefreshTokenByClientKey(clientKey);

  appAssert(
    tokenRecord,
    HTTP_CODE.UNAUTHORIZED,
    "No valid refresh token found.",
    ERROR_CODE.INVALID_REFRESH_TOKEN
  );

  const expectedClientKey = await generateClientKeyFromMeta(
    meta,
    tokenRecord.user.id,
    tokenRecord.session.id
  );

  appAssert(
    expectedClientKey === tokenRecord.publicKey,
    HTTP_CODE.UNAUTHORIZED,
    "Fingerprint mismatch on logout others.",
    ERROR_CODE.FINGERPRINT_MISMATCH
  );

  const currentClientKey = tokenRecord.publicKey;
  const userId = tokenRecord.user.id;

  // 1️⃣ Buscar sesiones activas distintas a la del clientKey actual
  const otherSessions = await prisma.session.findMany({
    where: {
      userId,
      clientKey: { not: currentClientKey },
      isRevoked: false,
    },
  });

  const otherSessionIds = otherSessions.map((s) => s.id);

  if (otherSessionIds.length === 0) {
    return {
      status: "othersLoggedOut",
      message: "No hay otras sesiones activas.",
      data: {
        userId,
        sessionKept: tokenRecord.session.id,
      },
    };
  }

  // 2️⃣ Revocar tokens de esas sesiones
  const tokenRecords = await prisma.tokenRecord.findMany({
    where: {
      sessionId: { in: otherSessionIds },
      revoked: false,
    },
  });

  for (const token of tokenRecords) {
    if (token.type === TokenType.ACCESS) {
      await revokeAccessToken(token.jti);
      await prisma.tokenRecord.deleteMany({
        where: { jti: token.jti, userId },
      });
    } else {
      await prisma.tokenRecord.updateMany({
        where: { jti: token.jti, userId },
        data: { revoked: true },
      });
    }
  }

  // 3️⃣ Revocar esas sesiones
  await prisma.session.updateMany({
    where: {
      id: { in: otherSessionIds },
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      lastUsedAt: new Date(),
    },
  });

  // 4️⃣ Auditoría
  await loggerAudit("user.logged_out_other_sessions", {
    performedBy: userId,
    sessionKept: tokenRecord.session.id,
    revokedSessions: otherSessionIds,
    totalRevoked: otherSessionIds.length,
  });

  return {
    status: "othersLoggedOut",
    message: "Todas las sesiones fueron cerradas excepto la actual.",
    data: {
      userId,
      sessionKept: tokenRecord.session.id,
    },
  };
};

export const requestPasswordResetService = async (
  email: ResetPasswordRequest
): Promise<ResetPasswordRequestResponse> => {
  // 1️⃣ Verificar si existe el usuario
  const user = await prisma.user.findUnique({ where: { email } });

  appAssert(
    user,
    HTTP_CODE.NOT_FOUND,
    "No user found with this email.",
    ERROR_CODE.USER_NOT_FOUND,
    [
      {
        field: "email",
        message: "We couldn't find an account with this email.",
      },
    ]
  );

  // 2️⃣ Eliminar códigos anteriores de tipo PasswordReset
  await prisma.verificationCode.deleteMany({
    where: {
      userId: user.id,
      type: VerificationCodeType.PasswordReset,
    },
  });
  // 2️⃣ Generar nuevo código y hashear
  const rawCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos
  const hashedCode = await hashValue(rawCode);
  const requestId = uuidv4();

  const verifyCode = await prisma.verificationCode.create({
    data: {
      userId: user.id,
      type: VerificationCodeType.PasswordReset,
      hashedCode,
      requestId,
      expiresAt: fiveMinutesFromNow(),
    },
  });

  // 3️⃣ Enviar email
  await sendPasswordResetEmail(user.email, rawCode);

  const expiresIn = Math.floor(
    (verifyCode.expiresAt.getTime() - Date.now()) / 1000
  );

  return {
    status: "passwordResetCodeSent",
    message: "Password reset code sent to your email.",
    data: {
      email: user.email,
      requestId: requestId,
      expiresIn: expiresIn,
      codeSent: true,
    },
  };
};

export const resetPasswordService = async ({
  email,
  code,
  requestId,
  newPassword,
  meta,
}: ResetPasswordParamsRequest): Promise<ResetPasswordResponse> => {
  const user = await prisma.user.findUnique({ where: { email } });

  appAssert(
    user,
    HTTP_CODE.NOT_FOUND,
    "User not found.",
    ERROR_CODE.USER_NOT_FOUND,
    [{ field: "email", message: "No user found with this email." }]
  );

  const codes = await prisma.verificationCode.findMany({
    where: {
      userId: user.id,
      type: VerificationCodeType.PasswordReset,
    },
    orderBy: { createdAt: "desc" },
  });

  const validCode = codes.find((v) => !v.used);

  appAssert(
    validCode,
    HTTP_CODE.UNAUTHORIZED,
    "Reset code invalid or already used.",
    ERROR_CODE.INVALID_VERIFICATION_CODE,
    [{ field: "code", message: "No valid reset code found." }]
  );

  const isValid = await compareValue(code, validCode.hashedCode);

  appAssert(
    isValid,
    HTTP_CODE.UNAUTHORIZED,
    "Reset code is incorrect.",
    ERROR_CODE.INVALID_VERIFICATION_CODE,
    [{ field: "code", message: "The reset code entered is incorrect." }]
  );

  const isExpired = validCode.expiresAt < new Date();

  if (isExpired) {
    const newCode = crypto.randomInt(100000, 999999).toString();
    const hashedNewCode = await hashValue(newCode);
    const newRequestId = uuidv4();

    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        type: VerificationCodeType.PasswordReset,
        hashedCode: hashedNewCode,
        requestId: newRequestId,
        expiresAt: fiveMinutesFromNow(),
      },
    });

    await sendPasswordResetEmail(user.email, newCode);

    return {
      status: API_STATUS.RESEND,
      message: "The code has expired. A new one was sent to your email.",
      requestId: newRequestId,
      expiresIn: 300,
      resend: true,
    };
  }

  // 🚫 Prevenir reuse de contraseña
  const isSamePassword = await compareValue(newPassword, user.password);
  appAssert(
    !isSamePassword,
    HTTP_CODE.BAD_REQUEST,
    "New password must be different from the old one.",
    ERROR_CODE.PASSWORD_REUSE,
    [{ field: "newPassword", message: "Try a different password." }]
  );

  // ✅ Cambiar la contraseña
  const hashedNewPassword = await hashValue(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedNewPassword },
  });

  // ✅ Marcar y limpiar los códigos
  await prisma.verificationCode.updateMany({
    where: {
      userId: user.id,
      type: VerificationCodeType.PasswordReset,
    },
    data: { used: true },
  });

  await prisma.verificationCode.deleteMany({
    where: {
      userId: user.id,
      type: VerificationCodeType.PasswordReset,
      used: true,
    },
  });

  // 🔐 Auditoría
  await loggerAudit("auth.password_reset", {
    performedBy: user.id,
    method: "code_verification",
    targetId: user.id,
  });

  //REVIEW: Revisar Vulnerabilidad.
  //TODO: revisar si se puede crear nuevo dispositivo desde una ruta publica,
  //  deberia haber un dispositvo registrado por que hay un usuario!
  // 📱 Crear o encontrar el dispositivo
  const device = await findOrCreateDevice(user.id, meta);

  // 🧠 Crear nueva sesión
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceId: device.id,
      clientKey: "", // Provide a default or computed value for clientKey
      expiresAt: thirtyDaysFromNow(),
    },
  });

  // 🔐 Generar huella digital
  const clientKey = await generateClientKeyFromMeta(meta, user.id, session.id);

  // ⬇️ Guardar clientKey en la sesión
  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: clientKey },
  });

  // 🪙 Generar tokens
  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(
      user.id,
      session.id,
      user.role as UserRole,
      clientKey
    );

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(
      user.id,
      session.id,
      user.role as UserRole,
      clientKey
    );

  // 💾 Guardar los nuevos tokens
  await prisma.tokenRecord.createMany({
    data: [
      {
        jti: accessTokenId,
        type: "ACCESS",
        token: accessToken,
        sessionId: session.id,
        userId: user.id,
        publicKey: clientKey,
        expiresAt: await getJwtExpiration(accessToken),
        revoked: false,
      },
      {
        jti: refreshTokenId,
        type: "REFRESH",
        token: refreshToken,
        sessionId: session.id,
        userId: user.id,
        publicKey: clientKey,
        expiresAt: await getJwtExpiration(refreshToken),
        revoked: false,
      },
    ],
  });

  // 🔐 Evento de seguridad
  await loggerSecurityEvent({
    meta,
    type: "auth.reset_password.success",
    userId: user.id,
    sessionId: session.id,
    details: {
      email,
      method: "code_and_new_password",
    },
  });

  return {
    status: API_STATUS.PASSWORD_RESET_SUCCESS,
    message: "Password changed successfully. You are now logged in.",
    data: {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
    },
    tokens: {
      accessTokenId,
      hashedPublicKey: clientKey,
    },
  };
};
