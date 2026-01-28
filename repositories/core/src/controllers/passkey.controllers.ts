/**
 * 🎮 PASSKEY CONTROLLER
 *
 * Este controlador maneja las rutas HTTP para la autenticación con Passkeys.
 * Actúa como intermediario entre el frontend y el servicio de passkeys.
 *
 * Estructura típica de un controlador:
 * 1. Extraer datos del request (body, params, userId del middleware)
 * 2. Llamar al servicio correspondiente
 * 3. Retornar respuesta HTTP con el resultado
 *
 * Todas las funciones están envueltas en catchErrors() para manejo automático de errores.
 */

import type { Request, Response } from "express";
import catchErrors from "@utils/http/catchErrors";
import {
  generatePasskeyRegistrationChallenge,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationChallenge,
  verifyPasskeyAuthentication,
  listUserPasskeys,
  deletePasskey,
  // 🔐 Mandatory 2FA functions
  generatePasskeySetupChallenge,
  verifyPasskeySetupAndLogin,
} from "@services/passkey.service";
import HttpException from "@utils/http/HttpException";
import { ERROR_CODE } from "@constants/errorCode";
import {
  requestPasskeyRecovery,
  verifyRecoveryCode,
} from "@services/passkeyRecovery.service";
import { verifyPendingToken } from "@utils/auth/pendingToken";
import { setAuthCookies } from "@utils/auth/cookies";
import { HTTP_CODE } from "@constants/httpCode";
import type {
  PasskeyRegisterChallengeRequest,
  PasskeyRegisterVerifyRequest,
  PasskeyLoginChallengeRequest,
  PasskeyLoginVerifyRequest,
} from "@custom-types/modules/auth/passkey";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { loggerAudit } from "@utils/logging/loggerAudit";

/**
 * 📝 POST /account/passkey/register/challenge
 *
 * PASO 1 DE REGISTRO: Generar challenge para crear un passkey
 *
 * Requiere autenticación: ✅ SÍ (middleware authenticate)
 *
 * Flujo:
 * 1. El usuario YA está autenticado con email/password o con otra sesión
 * 2. Quiere AGREGAR un passkey a su cuenta para futuros logins
 * 3. Frontend llama a este endpoint
 * 4. Backend genera un challenge y lo retorna
 * 5. Frontend usa el challenge para crear el passkey con navigator.credentials.create()
 *
 * Request body:
 * - meta: RequestMeta (IP, user agent, device info, etc.)
 *
 * Response:
 * - options: Opciones de registro para WebAuthn (incluye el challenge)
 */
export const generateRegisterChallenge = catchErrors(
  async (req: Request, res: Response) => {
    // Obtener userId del middleware authenticate (el usuario YA está logueado)
    const userId = req.userId!;
    const { meta } = req.body as PasskeyRegisterChallengeRequest;

    loggerEvent(
      "passkey.register.challenge.start",
      { userId, device: meta.deviceInfo.device, os: meta.deviceInfo.os },
      req,
      "passkey.controller"
    );

    // Llamar al servicio para generar el challenge
    const options = await generatePasskeyRegistrationChallenge(userId, meta);

    loggerEvent(
      "passkey.register.challenge.success",
      { userId, challengeLength: options.challenge.length },
      req,
      "passkey.controller"
    );

    // Retornar las opciones al frontend
    res.status(HTTP_CODE.OK).json({
      message: "Registration challenge generated",
      options,  // El frontend usará esto con navigator.credentials.create()
    });
  }
);

/**
 * ✅ POST /account/passkey/register/verify
 *
 * PASO 2 DE REGISTRO: Verificar y guardar el passkey creado
 *
 * Requiere autenticación: ✅ SÍ (middleware authenticate)
 *
 * Flujo:
 * 1. El frontend llamó a navigator.credentials.create() y el usuario creó el passkey
 * 2. Frontend envía la credencial generada a este endpoint
 * 3. Backend verifica que la credencial sea válida
 * 4. Backend guarda el passkey en la base de datos
 * 5. El usuario ahora puede usar este passkey para futuros logins
 *
 * Request body:
 * - credential: RegistrationResponseJSON (contiene la clave pública)
 * - name: string (opcional, nombre amigable como "iPhone de Felix")
 * - meta: RequestMeta
 *
 * Response:
 * - passkey: Passkey creado (id, name, createdAt)
 */
export const verifyRegister = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { credential, name, meta } = req.body as PasskeyRegisterVerifyRequest;

    loggerEvent(
      "passkey.register.verify.start",
      { userId, credentialId: credential.id, name },
      req,
      "passkey.controller"
    );

    // Verificar y guardar el passkey
    const passkey = await verifyPasskeyRegistration(
      userId,
      credential,
      name,
      meta
    );

    loggerAudit(
      "passkey.registered",
      {
        performedBy: userId,
        passkeyId: passkey.id,
        passkeyName: passkey.name,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
      },
      req
    );

    // Retornar confirmación
    res.status(HTTP_CODE.CREATED).json({
      message: "Passkey registered successfully",
      passkey,
    });
  }
);

/**
 * 🔑 POST /account/passkey/login/challenge
 *
 * PASO 1 DE LOGIN: Generar challenge para autenticar con passkey
 *
 * Requiere autenticación: ❌ NO (es un endpoint público de login)
 *
 * Flujo:
 * 1. Usuario SIN sesión activa quiere iniciar sesión
 * 2. Frontend puede enviar el email (opcional) o dejarlo vacío
 * 3. Backend genera un challenge y lo retorna
 * 4. Frontend usa el challenge con navigator.credentials.get()
 * 5. El navegador muestra los passkeys disponibles al usuario
 *
 * Request body:
 * - email: string (opcional, para filtrar passkeys específicos del usuario)
 * - meta: RequestMeta
 *
 * Response:
 * - options: Opciones de autenticación para WebAuthn (incluye el challenge)
 */
export const generateLoginChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const { email, meta } = req.body as PasskeyLoginChallengeRequest;

    loggerEvent(
      "passkey.login.challenge.start",
      { email: email || "discoverable", hasEmail: !!email },
      req,
      "passkey.controller"
    );

    // Generar challenge (con o sin email)
    const options = await generatePasskeyAuthenticationChallenge(email, meta);

    loggerEvent(
      "passkey.login.challenge.success",
      {
        email: email || "discoverable",
        challengeLength: options.challenge.length,
        allowCredentialsCount: options.allowCredentials?.length || 0
      },
      req,
      "passkey.controller"
    );

    res.status(HTTP_CODE.OK).json({
      message: "Authentication challenge generated",
      options,  // El frontend usará esto con navigator.credentials.get()
    });
  }
);

/**
 * ✅ POST /account/passkey/login/verify
 *
 * PASO 2 DE LOGIN: Verificar autenticación y crear sesión
 *
 * Requiere autenticación: ❌ NO (es un endpoint público de login)
 *
 * Flujo:
 * 1. Frontend llamó a navigator.credentials.get() y el usuario autenticó
 * 2. Frontend envía la credencial firmada a este endpoint
 * 3. Backend verifica la firma criptográfica
 * 4. Backend crea una sesión y genera tokens JWT
 * 5. Backend establece cookies (accessKey, clientKey)
 * 6. El usuario ahora está autenticado y puede acceder a rutas protegidas
 *
 * Request body:
 * - credential: AuthenticationResponseJSON (firmada criptográficamente)
 * - meta: RequestMeta
 *
 * Response:
 * - user: Datos del usuario (id, email, name, role)
 * - session: Datos de la sesión (id, expiresAt)
 *
 * Side effects:
 * - Establece cookies HttpOnly: accessKey, clientKey
 */
export const verifyLogin = catchErrors(async (req: Request, res: Response) => {
  const { credential, meta } = req.body as PasskeyLoginVerifyRequest;

  loggerEvent(
    "passkey.login.verify.start",
    { credentialId: credential.id },
    req,
    "passkey.controller"
  );

  // Verificar autenticación y crear sesión completa
  const result = await verifyPasskeyAuthentication(credential, meta);

  loggerAudit(
    "passkey.login.success",
    {
      performedBy: result.user.id,
      sessionId: result.session.id,
      email: result.user.email,
      device: meta.deviceInfo.device,
      os: meta.deviceInfo.os,
      ipAddress: meta.ipAddress,
    },
    req
  );

  // Establecer cookies de autenticación (HttpOnly, Secure, SameSite)
  setAuthCookies({
    res,
    accessKey: result.tokens.accessTokenId,     // Hash del JTI del access token
    clientKey: result.tokens.hashedPublicKey,   // Fingerprint del dispositivo
  });

  // Retornar datos del usuario y sesión al frontend
  res.status(HTTP_CODE.OK).json({
    message: "Login successful with passkey",
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
    },
    session: {
      id: result.session.id,
      expiresAt: result.session.expiresAt,
    },
  });
});

/**
 * 📋 GET /account/passkeys
 *
 * Listar todos los passkeys del usuario
 *
 * Requiere autenticación: ✅ SÍ (middleware authenticate)
 *
 * Uso:
 * - Pantalla de "Mis dispositivos" o "Seguridad"
 * - El usuario puede ver todos sus passkeys registrados
 * - Muestra información del dispositivo, fecha de creación, último uso
 *
 * Response:
 * - passkeys: Array de passkeys con información completa
 */
export const getPasskeys = catchErrors(async (req: Request, res: Response) => {
  const userId = req.userId!;

  // Obtener lista de passkeys
  const passkeys = await listUserPasskeys(userId);

  res.status(HTTP_CODE.OK).json({
    message: "Passkeys retrieved successfully",
    passkeys,
  });
});

/**
 * 🗑️ DELETE /account/passkeys/:passkeyId
 *
 * Eliminar un passkey específico
 *
 * Requiere autenticación: ✅ SÍ (middleware authenticate)
 *
 * Uso:
 * - Usuario perdió su dispositivo
 * - Usuario ya no usa un dispositivo específico
 * - Usuario quiere desvincular un passkey
 *
 * URL params:
 * - passkeyId: ID del passkey a eliminar
 *
 * Response:
 * - passkeyId: ID del passkey eliminado
 *
 * NOTA: Eliminar un passkey NO cierra las sesiones activas.
 */
export const deletePasskeyById = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { passkeyId } = req.params;

    loggerEvent(
      "passkey.delete.start",
      { userId, passkeyId },
      req,
      "passkey.controller"
    );

    // Eliminar passkey
    const result = await deletePasskey(userId, passkeyId);

    loggerAudit(
      "passkey.deleted",
      {
        performedBy: userId,
        passkeyId: result.passkeyId,
      },
      req
    );

    res.status(HTTP_CODE.OK).json({
      message: "Passkey deleted successfully",
      passkeyId: result.passkeyId,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 MANDATORY 2FA ENDPOINTS
// Estos endpoints manejan el flujo obligatorio de passkey después del login
// con email/password. El usuario DEBE configurar o verificar su passkey.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 📝 POST /account/passkey/setup/challenge
 *
 * PASO 1 DE SETUP OBLIGATORIO: Generar challenge para crear passkey
 *
 * Requiere: pendingToken (emitido después del login con email/password)
 *
 * IMPORTANTE: Solo permite passkeys cross-platform (teléfono), NO Keychain
 *
 * Request body:
 * - pendingToken: string (token temporal del login)
 * - meta: RequestMeta
 *
 * Response:
 * - options: Opciones de registro WebAuthn (authenticatorAttachment: "cross-platform")
 */
export const generateSetupChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const { pendingToken, meta } = req.body;

    // Verificar pending token
    const tokenData = await verifyPendingToken(pendingToken);

    loggerEvent(
      "passkey.setup.challenge.start",
      {
        userId: tokenData.userId,
        email: tokenData.email,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
      },
      req,
      "passkey.controller"
    );

    // Generar challenge (cross-platform ONLY)
    const options = await generatePasskeySetupChallenge(
      tokenData.userId,
      tokenData.email,
      meta
    );

    loggerEvent(
      "passkey.setup.challenge.success",
      { userId: tokenData.userId, challengeLength: options.challenge.length },
      req,
      "passkey.controller"
    );

    res.status(HTTP_CODE.OK).json({
      message: "Setup challenge generated (cross-platform only)",
      options,
      userId: tokenData.userId,
      email: tokenData.email,
    });
  }
);

/**
 * ✅ POST /account/passkey/setup/verify
 *
 * PASO 2 DE SETUP OBLIGATORIO: Verificar passkey y crear sesión
 *
 * Flujo:
 * 1. Usuario creó passkey con navigator.credentials.create()
 * 2. Backend verifica la credencial
 * 3. Backend guarda el passkey
 * 4. Backend crea sesión completa y establece cookies
 *
 * Request body:
 * - pendingToken: string
 * - credential: RegistrationResponseJSON
 * - name: string (nombre del passkey, ej: "iPhone de Felix")
 * - meta: RequestMeta
 *
 * Response:
 * - user: Datos del usuario
 * - session: Datos de la sesión
 *
 * Side effects:
 * - Establece cookies HttpOnly: accessKey, clientKey
 */
export const verifySetupAndLogin = catchErrors(
  async (req: Request, res: Response) => {
    const { pendingToken, credential, name, meta } = req.body;

    // Verificar pending token
    const tokenData = await verifyPendingToken(pendingToken);

    loggerEvent(
      "passkey.setup.verify.start",
      { userId: tokenData.userId, credentialId: credential.id, name },
      req,
      "passkey.controller"
    );

    // Verificar, guardar passkey y crear sesión
    const result = await verifyPasskeySetupAndLogin(
      tokenData.userId,
      credential,
      name,
      meta
    );

    loggerAudit(
      "passkey.setup.complete",
      {
        performedBy: result.user.id,
        sessionId: result.session.id,
        passkeyId: result.passkey.id,
        passkeyName: result.passkey.name,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
        ipAddress: meta.ipAddress,
      },
      req
    );

    // Establecer cookies de autenticación
    setAuthCookies({
      res,
      accessKey: result.tokens.accessTokenId,
      clientKey: result.tokens.hashedPublicKey,
    });

    res.status(HTTP_CODE.CREATED).json({
      message: "Passkey setup complete - logged in",
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt,
      },
      passkey: {
        id: result.passkey.id,
        name: result.passkey.name,
      },
    });
  }
);

/**
 * 🔑 POST /account/passkey/2fa/challenge
 *
 * PASO 1 DE VERIFICACIÓN 2FA: Generar challenge para autenticar
 *
 * Requiere: pendingToken (emitido después del login con email/password)
 *
 * Request body:
 * - pendingToken: string
 * - meta: RequestMeta
 *
 * Response:
 * - options: Opciones de autenticación WebAuthn
 */
export const generate2FAChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const { pendingToken, meta } = req.body;

    // Verificar pending token
    const tokenData = await verifyPendingToken(pendingToken);

    loggerEvent(
      "passkey.2fa.challenge.start",
      { userId: tokenData.userId, email: tokenData.email },
      req,
      "passkey.controller"
    );

    // Usar EXACTAMENTE la misma función del login electivo que funcionaba
    // Pasamos el email para que use allowCredentials con los passkeys del usuario
    const options = await generatePasskeyAuthenticationChallenge(tokenData.email, meta);

    loggerEvent(
      "passkey.2fa.challenge.success",
      {
        userId: tokenData.userId,
        challengeLength: options.challenge.length,
        allowCredentialsCount: options.allowCredentials?.length || 0,
      },
      req,
      "passkey.controller"
    );

    res.status(HTTP_CODE.OK).json({
      message: "2FA challenge generated",
      options,
      userId: tokenData.userId,
      email: tokenData.email,
    });
  }
);

/**
 * ✅ POST /account/passkey/2fa/verify
 *
 * PASO 2 DE VERIFICACIÓN 2FA: Verificar passkey y crear sesión
 *
 * Request body:
 * - pendingToken: string
 * - credential: AuthenticationResponseJSON
 * - meta: RequestMeta
 *
 * Response:
 * - user: Datos del usuario
 * - session: Datos de la sesión
 *
 * Side effects:
 * - Establece cookies HttpOnly: accessKey, clientKey
 */
export const verify2FAAndLogin = catchErrors(
  async (req: Request, res: Response) => {
    const { pendingToken, credential, meta } = req.body;

    // Verificar pending token
    const tokenData = await verifyPendingToken(pendingToken);

    loggerEvent(
      "passkey.2fa.verify.start",
      { userId: tokenData.userId, credentialId: credential.id },
      req,
      "passkey.controller"
    );

    // Usar EXACTAMENTE la misma función del login electivo que funcionaba
    const result = await verifyPasskeyAuthentication(credential, meta);

    // Validar que el passkey pertenece al usuario del pendingToken
    if (result.user.id !== tokenData.userId) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        ERROR_CODE.INVALID_PASSKEY,
        "InvalidPasskey"
      );
    }

    loggerAudit(
      "passkey.2fa.login.success",
      {
        performedBy: result.user.id,
        sessionId: result.session.id,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
        ipAddress: meta.ipAddress,
      },
      req
    );

    // Establecer cookies de autenticación
    setAuthCookies({
      res,
      accessKey: result.tokens.accessTokenId,
      clientKey: result.tokens.hashedPublicKey,
    });

    res.status(HTTP_CODE.OK).json({
      message: "2FA verification successful - logged in",
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt,
      },
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 RECOVERY ENDPOINTS
// Para cuando el usuario pierde acceso a su teléfono y no puede verificar passkey
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 📧 POST /account/passkey/recovery/request
 *
 * Solicitar código de recuperación por email
 *
 * Flujo:
 * 1. Usuario intenta login pero no tiene acceso a su passkey
 * 2. Solicita recuperación con su pendingToken
 * 3. Backend envía código OTP al email
 * 4. Usuario ingresa código en /recovery/verify
 *
 * Request body:
 * - pendingToken: string (del login con email/password)
 *
 * Response:
 * - requestId: string (para usar en /recovery/verify)
 * - email: string (parcialmente enmascarado)
 * - expiresIn: number (segundos)
 */
export const requestRecovery = catchErrors(
  async (req: Request, res: Response) => {
    const { pendingToken } = req.body;

    loggerEvent(
      "passkey.recovery.request.controller.start",
      {},
      req,
      "passkey.controller"
    );

    const result = await requestPasskeyRecovery(pendingToken);

    // Enmascarar email para la respuesta
    const maskedEmail = result.email.replace(
      /^(.{2})(.*)(@.*)$/,
      (_, start, middle, domain) => start + "*".repeat(middle.length) + domain
    );

    loggerEvent(
      "passkey.recovery.request.controller.success",
      { requestId: result.requestId, maskedEmail },
      req,
      "passkey.controller"
    );

    res.status(HTTP_CODE.OK).json({
      message: "Recovery code sent to email",
      requestId: result.requestId,
      email: maskedEmail,
      expiresIn: result.expiresIn,
    });
  }
);

/**
 * ✅ POST /account/passkey/recovery/verify
 *
 * Verificar código de recuperación y obtener nuevo pendingToken
 *
 * Flujo:
 * 1. Usuario ingresa código OTP recibido por email
 * 2. Backend verifica el código
 * 3. Backend elimina passkeys existentes (perdió el teléfono)
 * 4. Backend genera nuevo pendingToken
 * 5. Usuario puede ir a /setup para crear nuevo passkey
 *
 * Request body:
 * - requestId: string (del paso anterior)
 * - code: string (código OTP de 6 dígitos)
 *
 * Response:
 * - pendingToken: string (nuevo token para setup)
 * - expiresIn: number (segundos)
 */
export const verifyRecovery = catchErrors(
  async (req: Request, res: Response) => {
    const { requestId, code } = req.body;

    loggerEvent(
      "passkey.recovery.verify.controller.start",
      { requestId },
      req,
      "passkey.controller"
    );

    const result = await verifyRecoveryCode(requestId, code);

    loggerAudit(
      "passkey.recovery.verified",
      {
        performedBy: result.userId,
        email: result.email,
      },
      req
    );

    res.status(HTTP_CODE.OK).json({
      message: "Recovery verified - passkeys cleared",
      pendingToken: result.pendingToken,
      expiresIn: result.expiresIn,
      email: result.email,
    });
  }
);
