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
} from "@services/passkey.service";
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
