/**
 * 🔐 PASSKEY SERVICE
 *
 * Este servicio maneja la autenticación con Passkeys (WebAuthn/FIDO2).
 * Los passkeys son credenciales criptográficas que permiten autenticación sin contraseña
 * usando biometría (Face ID, Touch ID, huella digital) o llaves de seguridad físicas.
 *
 * Flujo general:
 * 1. REGISTRO: El servidor genera un challenge → el navegador crea una credencial → el servidor la verifica y guarda
 * 2. LOGIN: El servidor genera un challenge → el usuario autentica con su passkey → el servidor verifica y crea sesión
 *
 * Tecnologías usadas:
 * - @simplewebauthn/server: Librería que implementa el estándar WebAuthn
 * - Redis: Para almacenar challenges temporales (5 minutos de expiración)
 * - Prisma: Para persistir passkeys, devices y sessions
 */

import {
  generateRegistrationOptions, // Genera opciones para crear un nuevo passkey
  verifyRegistrationResponse, // Verifica que el passkey creado sea válido
  generateAuthenticationOptions, // Genera opciones para autenticar con un passkey existente
  verifyAuthenticationResponse, // Verifica que la autenticación sea válida
} from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import type {
  RegistrationResponseJSON, // Tipo: Respuesta del navegador al crear passkey
  AuthenticationResponseJSON, // Tipo: Respuesta del navegador al autenticar
  AuthenticatorTransportFuture, // Tipo: Métodos de transporte (usb, nfc, ble, hybrid, internal)
} from "@simplewebauthn/server";
import { prisma } from "@config/prisma";
import { redis } from "@config/redis";
import { webAuthnConfig } from "@config/webauthn";
import HttpException from "@utils/http/HttpException";
import { ERROR_CODE } from "@constants/errorCode";
import { HTTP_CODE } from "@constants/httpCode";
import type { StoredChallenge } from "@custom-types/modules/auth/passkey";
import { findOrCreateDevice } from "@utils/auth/findOrCreateDevice";
import { generateClientKeyFromMeta } from "@utils/auth/generateClientKey";
import { generateAccessToken, generateRefreshToken } from "@utils/auth/jwt";
import { getJwtExpiration } from "@utils/auth/getJwtExpiration";
import { thirtyDaysFromNow } from "@utils/date/date";
import type { UserRole } from "@constants/userRole";
import { loggerEvent } from "@utils/logging/loggerEvent";

/**
 * 📝 PASO 1 DE REGISTRO: Generar challenge para crear un passkey
 *
 * ¿Qué hace?
 * - Crea un "desafío criptográfico" que el navegador usará para crear el passkey
 * - Obtiene los passkeys existentes del usuario para evitar duplicados
 * - Guarda el challenge en Redis con 5 minutos de expiración
 *
 * Flujo:
 * 1. El usuario YA está autenticado (requiere token JWT válido)
 * 2. Busca al usuario en la base de datos
 * 3. Obtiene los passkeys que ya tiene registrados
 * 4. Genera opciones de registro con configuración WebAuthn
 * 5. Guarda el challenge en Redis (temporal)
 * 6. Retorna las opciones al frontend para que el navegador cree el passkey
 *
 * @param userId - ID del usuario autenticado (viene del middleware authenticate)
 * @param meta - Metadata de la petición (IP, user agent, device info, etc.)
 * @returns Opciones que el navegador usará para crear el passkey
 */
export async function generatePasskeyRegistrationChallenge(
  userId: string,
  meta: RequestMeta
) {
  loggerEvent(
    "passkey.service.register.challenge.start",
    { userId },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Buscar al usuario en la base de datos
  // Necesitamos su email y nombre para asociarlo al passkey
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    loggerEvent(
      "passkey.service.register.challenge.user-not-found",
      { userId },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.USER_NOT_FOUND,
      "UserNotFound"
    );
  }

  loggerEvent(
    "passkey.service.register.challenge.user-found",
    { userId, email: user.email },
    undefined,
    "passkey.service"
  );

  // 2️⃣ Obtener passkeys existentes del usuario
  // Esto permite que el navegador evite crear duplicados del mismo dispositivo
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  loggerEvent(
    "passkey.service.register.challenge.existing-passkeys",
    { userId, count: existingPasskeys.length },
    undefined,
    "passkey.service"
  );

  // 3️⃣ Generar las opciones de registro usando la librería WebAuthn
  const options = await generateRegistrationOptions({
    rpName: webAuthnConfig.rpName, // "LeonobiTech" - Nombre que se muestra al usuario
    rpID: webAuthnConfig.rpId, // Dominio (ej: "leonobitech.com")
    userID: isoUint8Array.fromUTF8String(user.id), // ID del usuario convertido a bytes
    userName: user.email, // Email del usuario
    userDisplayName:
      user.name && user.name.trim() !== ""
        ? user.name
        : user.email.split("@")[0], // Nombre amigable (usa parte del email si name está vacío)
    timeout: webAuthnConfig.timeout, // 2 minutos para completar el proceso
    attestationType: webAuthnConfig.attestation, // "none" = no verificar fabricante del dispositivo

    // excludeCredentials: Lista de passkeys que ya tiene el usuario
    // El navegador no permitirá registrar el mismo dispositivo dos veces
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key",
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),

    // Configuración del autenticador (dispositivo que crea el passkey)
    authenticatorSelection: {
      authenticatorAttachment: webAuthnConfig.authenticatorAttachment, // undefined = cualquier tipo
      requireResidentKey: webAuthnConfig.requireResidentKey, // true = passkey se guarda en el dispositivo
      residentKey: "required", // El passkey DEBE guardarse en el dispositivo (no efímero)
      userVerification: webAuthnConfig.userVerification, // "required" = fuerza biometría/PIN
    },

    // Algoritmos criptográficos soportados: ES256 (-7) y RS256 (-257)
    supportedAlgorithmIDs: [...webAuthnConfig.supportedAlgorithms],
  });

  // 4️⃣ Guardar el challenge en Redis (expiración de 5 minutos)
  // El challenge es un valor aleatorio que se usa para prevenir ataques de replay
  const challengeKey = `passkey:register:challenge:${userId}`;
  const challengeData: StoredChallenge = {
    challenge: options.challenge, // String base64url del challenge
    userId,
    expiresAt: Date.now() + webAuthnConfig.challengeTTL, // 5 minutos
  };

  await redis.setEx(
    challengeKey,
    Math.floor(webAuthnConfig.challengeTTL / 1000), // TTL en segundos
    JSON.stringify(challengeData)
  );

  loggerEvent(
    "passkey.service.register.challenge.redis-stored",
    {
      userId,
      challengeKey,
      ttlSeconds: Math.floor(webAuthnConfig.challengeTTL / 1000),
    },
    undefined,
    "passkey.service"
  );

  // 5️⃣ Retornar las opciones al frontend
  // El navegador usará estas opciones con navigator.credentials.create()
  loggerEvent(
    "passkey.service.register.challenge.complete",
    { userId, rpId: options.rp.id, rpName: options.rp.name },
    undefined,
    "passkey.service"
  );

  return options;
}

/**
 * ✅ PASO 2 DE REGISTRO: Verificar el passkey creado y guardarlo en la base de datos
 *
 * ¿Qué hace?
 * - Verifica que el passkey creado por el navegador sea válido
 * - Valida el challenge guardado en Redis
 * - Guarda el passkey en la base de datos
 * - Asocia el passkey con el dispositivo del usuario
 *
 * Flujo:
 * 1. El frontend llamó a navigator.credentials.create() y el usuario creó el passkey
 * 2. El navegador retorna una credencial (credential) que contiene la clave pública
 * 3. Recuperamos el challenge de Redis para validar que la petición sea legítima
 * 4. Verificamos criptográficamente que la credencial sea válida
 * 5. Guardamos la clave pública en la base de datos
 * 6. Asociamos el passkey con el dispositivo (iPhone, Android, etc.)
 *
 * @param userId - ID del usuario autenticado
 * @param credential - Credencial generada por el navegador (contiene clave pública)
 * @param name - Nombre amigable para el passkey (ej: "iPhone de Felix")
 * @param meta - Metadata del dispositivo (IP, user agent, etc.)
 * @returns El passkey guardado en la base de datos
 */
export async function verifyPasskeyRegistration(
  userId: string,
  credential: RegistrationResponseJSON,
  name: string | undefined,
  meta: RequestMeta
) {
  loggerEvent(
    "passkey.service.register.verify.start",
    { userId, credentialId: credential.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Recuperar el challenge de Redis
  // El challenge se generó en el paso anterior y debe coincidir
  const challengeKey = `passkey:register:challenge:${userId}`;
  const storedChallengeData = await redis.get(challengeKey);

  if (!storedChallengeData) {
    loggerEvent(
      "passkey.service.register.verify.challenge-not-found",
      { userId, challengeKey },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_NOT_FOUND_OR_EXPIRED,
      "ChallengeNotFoundOrExpired"
    );
  }

  loggerEvent(
    "passkey.service.register.verify.challenge-retrieved",
    { userId },
    undefined,
    "passkey.service"
  );

  const storedChallenge: StoredChallenge = JSON.parse(storedChallengeData);

  // 2️⃣ Verificar que el challenge no haya expirado (5 minutos)
  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(challengeKey);
    loggerEvent(
      "passkey.service.register.verify.challenge-expired",
      { userId, expiresAt: storedChallenge.expiresAt, now: Date.now() },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_EXPIRED,
      "ChallengeExpired"
    );
  }

  loggerEvent(
    "passkey.service.register.verify.challenge-valid",
    { userId },
    undefined,
    "passkey.service"
  );

  // 3️⃣ Verificar criptográficamente que la credencial sea válida
  // La librería @simplewebauthn/server verifica:
  // - Que el challenge coincida con el que enviamos
  // - Que el origin sea correcto (ej: https://leonobitech.com)
  // - Que el rpID coincida (ej: leonobitech.com)
  // - Que la firma criptográfica sea válida
  loggerEvent(
    "passkey.service.register.verify.verifying-credential",
    {
      userId,
      expectedOrigin: webAuthnConfig.origin,
      expectedRPID: webAuthnConfig.rpId,
    },
    undefined,
    "passkey.service"
  );

  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: webAuthnConfig.origin,
    expectedRPID: webAuthnConfig.rpId,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    loggerEvent(
      "passkey.service.register.verify.verification-failed",
      { userId, verified: verification.verified },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.PASSKEY_VERIFICATION_FAILED,
      "PasskeyVerificationFailed"
    );
  }

  loggerEvent(
    "passkey.service.register.verify.verification-success",
    { userId },
    undefined,
    "passkey.service"
  );

  const { credential: credentialInfo } = verification.registrationInfo;

  // 🔍 DEBUG: Log transports recibidos del navegador
  loggerEvent(
    "passkey.service.register.verify.transports-debug",
    {
      userId,
      transportsReceived: credential.response.transports,
      transportsType: typeof credential.response.transports,
      transportsIsArray: Array.isArray(credential.response.transports),
      transportsLength: credential.response.transports?.length,
    },
    undefined,
    "passkey.service"
  );

  // 4️⃣ Encontrar o crear el dispositivo en la base de datos
  // Un dispositivo es único por la combinación: userId + device + os + browser
  // Ejemplo: "iPhone + iOS + Safari" es un dispositivo único
  const device = await prisma.device.upsert({
    where: {
      unique_device: {
        userId,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
        browser: meta.deviceInfo.browser,
      },
    },
    update: {
      lastUsedAt: new Date(),
      ipAddress: meta.ipAddress,
    },
    create: {
      userId,
      device: meta.deviceInfo.device,
      os: meta.deviceInfo.os,
      browser: meta.deviceInfo.browser,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      language: meta.language,
      timezone: meta.timezone,
      platform: meta.platform,
      screenResolution: meta.screenResolution,
      label: meta.label,
    },
  });

  // 5️⃣ Guardar el passkey en la base de datos
  // Guardar TODOS los transports que reporta el navegador
  // Esto permite cross-device authentication (la esencia de las passkeys)
  // Si Safari/Chrome envían ['internal', 'hybrid'], guardamos ambos para permitir:
  // - 'internal': Login desde el mismo dispositivo (Touch ID, Windows Hello)
  // - 'hybrid': Login desde otro dispositivo via QR code (iCloud Keychain, Google Password Manager)
  const transportsFromBrowser = credential.response.transports || [];
  const transportsToSave = Array.from(new Set(transportsFromBrowser));

  loggerEvent(
    "passkey.service.register.verify.creating-passkey",
    {
      userId,
      deviceId: device.id,
      name: name || `${meta.deviceInfo.device} (${meta.deviceInfo.os})`,
      transportsFromBrowser,
      transportsToSave,
      filtered: transportsFromBrowser.length !== transportsToSave.length,
    },
    undefined,
    "passkey.service"
  );

  const passkey = await prisma.passkey.create({
    data: {
      userId,
      deviceId: device.id,
      // credentialId: Identificador único de la credencial (como un UUID)
      // Usar credential.id directamente (ya viene en base64url del navegador)
      credentialId: credential.id,
      // publicKey: Clave pública que se usará para verificar autenticaciones futuras
      publicKey: Buffer.from(credentialInfo.publicKey).toString("base64url"),
      // counter: Contador de usos (protege contra ataques de clonación)
      counter: credentialInfo.counter,
      // Nombre amigable (ej: "iPhone de Felix" o generado automático)
      name: name || `${meta.deviceInfo.device} (${meta.deviceInfo.os})`,
      // Métodos de transporte soportados (USB, NFC, Bluetooth, híbrido, interno)
      // Usar EXACTAMENTE los transports que el navegador reportó
      transports: transportsToSave,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  loggerEvent(
    "passkey.service.register.verify.passkey-created",
    { userId, passkeyId: passkey.id, passkeyName: passkey.name },
    undefined,
    "passkey.service"
  );

  // 6️⃣ Eliminar el challenge de Redis (ya fue usado)
  await redis.del(challengeKey);

  loggerEvent(
    "passkey.service.register.verify.complete",
    { userId, passkeyId: passkey.id },
    undefined,
    "passkey.service"
  );

  // 7️⃣ Retornar el passkey creado
  return passkey;
}

/**
 * 🔑 PASO 1 DE LOGIN: Generar challenge para autenticar con un passkey existente
 *
 * ¿Qué hace?
 * - Crea un "desafío criptográfico" para que el usuario autentique con su passkey
 * - Si se proporciona email, busca los passkeys específicos de ese usuario
 * - Si NO se proporciona email, permite login "discoverable" (el dispositivo muestra sus passkeys)
 *
 * Flujo:
 * 1. Usuario SIN sesión activa quiere iniciar sesión con passkey
 * 2. (Opcional) Frontend envía el email del usuario
 * 3. Si hay email, buscamos sus passkeys y los enviamos al navegador
 * 4. Generamos un challenge y lo guardamos en Redis
 * 5. El navegador mostrará los passkeys disponibles al usuario
 *
 * Tipos de login:
 * - CON email: El navegador solo mostrará los passkeys de ese usuario específico
 * - SIN email: "Discoverable credentials" - el navegador muestra TODOS los passkeys guardados en el dispositivo
 *
 * @param email - (Opcional) Email del usuario para filtrar passkeys
 * @param meta - Metadata de la petición
 * @returns Opciones que el navegador usará para autenticar
 */
export async function generatePasskeyAuthenticationChallenge(
  email?: string,
  meta?: RequestMeta
) {
  loggerEvent(
    "passkey.service.login.challenge.start",
    { email: email || "discoverable", hasEmail: !!email },
    undefined,
    "passkey.service"
  );

  let allowCredentials: Array<{
    id: string;
    type: "public-key";
    transports: AuthenticatorTransportFuture[];
  }> = [];

  let userId: string | undefined;

  // 1️⃣ Si se proporciona email, buscar los passkeys del usuario
  if (email) {
    loggerEvent(
      "passkey.service.login.challenge.searching-user",
      { email },
      undefined,
      "passkey.service"
    );

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      loggerEvent(
        "passkey.service.login.challenge.user-not-found",
        { email, fallback: "discoverable" },
        undefined,
        "passkey.service"
      );
    } else {
      userId = user.id;

      loggerEvent(
        "passkey.service.login.challenge.user-found",
        { userId },
        undefined,
        "passkey.service"
      );

      // Obtener todos los passkeys registrados por este usuario
      const passkeys = await prisma.passkey.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      });

      loggerEvent(
        "passkey.service.login.challenge.passkeys-found",
        { userId, count: passkeys.length },
        undefined,
        "passkey.service"
      );

      // Mapear los passkeys a la estructura que espera WebAuthn
      allowCredentials = passkeys.map((passkey) => ({
        id: passkey.credentialId, // ID único de cada passkey
        type: "public-key" as const,
        // Usar los transports tal como están guardados en la DB
        // Si ya incluyen 'hybrid', Safari lo mostrará como opción
        // Si solo tienen 'internal', Safari usará autenticación local
        transports: (passkey.transports as AuthenticatorTransportFuture[]) || [],
      }));
    }
  } else {
    loggerEvent(
      "passkey.service.login.challenge.discoverable-mode",
      {},
      undefined,
      "passkey.service"
    );
  }

  // 2️⃣ Generar opciones de autenticación
  const options = await generateAuthenticationOptions({
    rpID: webAuthnConfig.rpId, // Dominio (ej: "leonobitech.com")
    timeout: webAuthnConfig.timeout, // 2 minutos para completar
    userVerification: webAuthnConfig.userVerification, // "required" = fuerza biometría/PIN
    // Si hay passkeys específicos, enviarlos. Si no, undefined = modo "discoverable"
    allowCredentials:
      allowCredentials.length > 0 ? allowCredentials : undefined,
  });

  // 3️⃣ Guardar el challenge en Redis (expiración de 5 minutos)
  const challengeKey = `passkey:login:challenge:${options.challenge}`;
  const challengeData: StoredChallenge = {
    challenge: options.challenge,
    userId, // Puede ser undefined si no se proporcionó email
    expiresAt: Date.now() + webAuthnConfig.challengeTTL,
  };

  await redis.setEx(
    challengeKey,
    Math.floor(webAuthnConfig.challengeTTL / 1000),
    JSON.stringify(challengeData)
  );

  loggerEvent(
    "passkey.service.login.challenge.redis-stored",
    {
      challengeKey,
      userId: userId || "discoverable",
      ttlSeconds: Math.floor(webAuthnConfig.challengeTTL / 1000),
    },
    undefined,
    "passkey.service"
  );

  // 4️⃣ Retornar las opciones al frontend
  // El navegador usará estas opciones con navigator.credentials.get()
  loggerEvent(
    "passkey.service.login.challenge.complete",
    {
      userId: userId || "discoverable",
      allowCredentialsCount: allowCredentials.length,
      rpId: webAuthnConfig.rpId,
    },
    undefined,
    "passkey.service"
  );

  return options;
}

/**
 * ✅ PASO 2 DE LOGIN: Verificar la autenticación con passkey y crear sesión
 *
 * ¿Qué hace?
 * - Verifica que el passkey usado sea válido
 * - Valida el challenge guardado en Redis
 * - Crea una nueva sesión en la base de datos
 * - Genera tokens JWT (access + refresh)
 * - Retorna los datos de usuario y sesión
 *
 * Flujo:
 * 1. El frontend llamó a navigator.credentials.get() y el usuario autenticó con su passkey
 * 2. El navegador retorna una credencial firmada criptográficamente
 * 3. Recuperamos el challenge de Redis y el passkey de la base de datos
 * 4. Verificamos la firma criptográfica usando la clave pública guardada
 * 5. Creamos una sesión, dispositivo, y tokens JWT
 * 6. Retornamos todo al frontend para que guarde las cookies de sesión
 *
 * Este es el proceso COMPLETO de login sin contraseña.
 *
 * @param credential - Credencial firmada por el navegador
 * @param meta - Metadata de la petición
 * @returns Usuario, sesión, y tokens para cookies
 */
export async function verifyPasskeyAuthentication(
  credential: AuthenticationResponseJSON,
  meta: RequestMeta
) {
  loggerEvent(
    "passkey.service.login.verify.start",
    { credentialId: credential.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Decodificar clientDataJSON para extraer el challenge
  // El clientDataJSON contiene el challenge en formato base64url
  const clientDataJSON = Buffer.from(
    credential.response.clientDataJSON,
    "base64url"
  ).toString("utf-8");

  const clientData = JSON.parse(clientDataJSON);
  const receivedChallenge = clientData.challenge;

  loggerEvent(
    "passkey.service.login.verify.challenge-extracted",
    { receivedChallenge },
    undefined,
    "passkey.service"
  );

  // 2️⃣ Buscar el challenge en Redis usando el challenge decodificado
  const challengeKey = `passkey:login:challenge:${receivedChallenge}`;

  loggerEvent(
    "passkey.service.login.verify.searching-challenge",
    { challengeKey },
    undefined,
    "passkey.service"
  );

  const storedChallengeData = await redis.get(challengeKey);

  if (!storedChallengeData) {
    loggerEvent(
      "passkey.service.login.verify.challenge-not-found",
      { credentialId: credential.id, challengeKey },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_NOT_FOUND_OR_EXPIRED,
      "ChallengeNotFoundOrExpired"
    );
  }

  loggerEvent(
    "passkey.service.login.verify.challenge-retrieved",
    { challengeKey },
    undefined,
    "passkey.service"
  );

  const storedChallenge: StoredChallenge = JSON.parse(storedChallengeData);

  // 3️⃣ Verificar que el challenge no haya expirado
  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(challengeKey);
    loggerEvent(
      "passkey.service.login.verify.challenge-expired",
      {
        credentialId: credential.id,
        expiresAt: storedChallenge.expiresAt,
        now: Date.now(),
      },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_EXPIRED,
      "ChallengeExpired"
    );
  }

  loggerEvent(
    "passkey.service.login.verify.challenge-valid",
    {},
    undefined,
    "passkey.service"
  );

  // 4️⃣ Buscar el passkey en la base de datos usando el credentialId
  // El credentialId identifica únicamente a este passkey específico
  loggerEvent(
    "passkey.service.login.verify.searching-passkey",
    { credentialId: credential.id },
    undefined,
    "passkey.service"
  );

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: credential.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          verified: true,
          isActive: true,
        },
      },
    },
  });

  if (!passkey) {
    loggerEvent(
      "passkey.service.login.verify.passkey-not-found",
      { credentialId: credential.id },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.INVALID_PASSKEY,
      "InvalidPasskey"
    );
  }

  loggerEvent(
    "passkey.service.login.verify.passkey-found",
    {
      credentialId: credential.id,
      userId: passkey.user.id,
      email: passkey.user.email,
      passkeyCounter: passkey.counter,
    },
    undefined,
    "passkey.service"
  );

  // 4️⃣ Verificar que la cuenta del usuario esté activa
  if (!passkey.user.isActive) {
    loggerEvent(
      "passkey.service.login.verify.user-inactive",
      { userId: passkey.user.id, email: passkey.user.email },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.FORBIDDEN,
      ERROR_CODE.USER_ACCOUNT_IS_DEACTIVATED,
      "UserAccountIsDeactivated"
    );
  }

  loggerEvent(
    "passkey.service.login.verify.user-active",
    { userId: passkey.user.id },
    undefined,
    "passkey.service"
  );

  // 5️⃣ Verificar criptográficamente la autenticación
  // La librería @simplewebauthn/server verifica:
  // - Que el challenge coincida con el guardado en Redis
  // - Que el origin sea correcto
  // - Que la firma criptográfica sea válida usando la clave pública guardada
  // - Que el counter sea mayor al anterior (protección contra clonación)
  loggerEvent(
    "passkey.service.login.verify.verifying-authentication",
    {
      userId: passkey.user.id,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: webAuthnConfig.origin,
      expectedRPID: webAuthnConfig.rpId,
      storedCounter: passkey.counter,
    },
    undefined,
    "passkey.service"
  );

  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: webAuthnConfig.origin,
    expectedRPID: webAuthnConfig.rpId,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"), // Clave pública guardada
      counter: passkey.counter, // Contador de usos previos
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    loggerEvent(
      "passkey.service.login.verify.verification-failed",
      {
        userId: passkey.user.id,
        credentialId: credential.id,
        verified: verification.verified,
      },
      undefined,
      "passkey.service"
    );
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      ERROR_CODE.INVALID_PASSKEY,
      "InvalidPasskey"
    );
  }

  loggerEvent(
    "passkey.service.login.verify.verification-success",
    {
      userId: passkey.user.id,
      newCounter: verification.authenticationInfo.newCounter,
      oldCounter: passkey.counter,
    },
    undefined,
    "passkey.service"
  );

  // 6️⃣ Actualizar el contador del passkey
  // El counter se incrementa en cada uso y previene ataques de clonación
  // Si un atacante clona el passkey, el contador estará desincronizado
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  loggerEvent(
    "passkey.service.login.verify.passkey-updated",
    { userId: passkey.user.id, passkeyId: passkey.id },
    undefined,
    "passkey.service"
  );

  // 7️⃣ Eliminar el challenge de Redis (ya fue usado)
  await redis.del(challengeKey);

  loggerEvent(
    "passkey.service.login.verify.challenge-deleted",
    { userId: passkey.user.id, challengeKey },
    undefined,
    "passkey.service"
  );

  // 8️⃣ Encontrar o crear el dispositivo
  // Esto registra desde qué dispositivo se hizo login (iPhone, Android, etc.)
  loggerEvent(
    "passkey.service.login.verify.finding-device",
    {
      userId: passkey.user.id,
      device: meta.deviceInfo.device,
      os: meta.deviceInfo.os,
      browser: meta.deviceInfo.browser,
    },
    undefined,
    "passkey.service"
  );

  const device = await findOrCreateDevice(passkey.user.id, meta);

  loggerEvent(
    "passkey.service.login.verify.device-ready",
    { userId: passkey.user.id, deviceId: device.id },
    undefined,
    "passkey.service"
  );

  // 9️⃣ Crear una nueva sesión en la base de datos
  // Una sesión representa un login activo que expira en 30 días
  loggerEvent(
    "passkey.service.login.verify.creating-session",
    { userId: passkey.user.id, deviceId: device.id },
    undefined,
    "passkey.service"
  );

  const session = await prisma.session.create({
    data: {
      userId: passkey.user.id,
      deviceId: device.id,
      clientKey: "", // Se actualiza en el siguiente paso
      expiresAt: thirtyDaysFromNow(), // 30 días de expiración
    },
  });

  loggerEvent(
    "passkey.service.login.verify.session-created",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  // 🔟 Generar el clientKey (fingerprint del dispositivo)
  // El clientKey es un hash de: IP + userAgent + userId + sessionId
  // Esto previene que roben el token y lo usen desde otro dispositivo
  loggerEvent(
    "passkey.service.login.verify.generating-clientkey",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  const hashedPublicKey = await generateClientKeyFromMeta(
    meta,
    passkey.user.id,
    session.id
  );

  loggerEvent(
    "passkey.service.login.verify.clientkey-generated",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣1️⃣ Actualizar la sesión con el clientKey
  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  loggerEvent(
    "passkey.service.login.verify.session-updated",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣2️⃣ Generar tokens JWT (access y refresh)
  // Access token: Válido por 15 minutos, se usa en cada petición
  // Refresh token: Válido por 30 días, se usa para renovar el access token
  loggerEvent(
    "passkey.service.login.verify.generating-tokens",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(
      passkey.user.id,
      session.id,
      passkey.user.role as UserRole,
      hashedPublicKey
    );

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(
      passkey.user.id,
      session.id,
      passkey.user.role as UserRole,
      hashedPublicKey
    );

  loggerEvent(
    "passkey.service.login.verify.tokens-generated",
    {
      userId: passkey.user.id,
      sessionId: session.id,
      accessTokenId,
      refreshTokenId,
    },
    undefined,
    "passkey.service"
  );

  // 1️⃣3️⃣ Registrar los tokens en la base de datos
  // Esto permite revocarlos si es necesario (logout, sesión comprometida, etc.)
  loggerEvent(
    "passkey.service.login.verify.storing-tokens",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  await prisma.tokenRecord.createMany({
    data: [
      {
        jti: accessTokenId, // Identificador único del token
        type: "ACCESS", // Tipo de token
        token: accessToken, // El token JWT completo
        sessionId: session.id,
        userId: passkey.user.id,
        publicKey: hashedPublicKey, // clientKey para validar que no fue robado
        expiresAt: await getJwtExpiration(accessToken),
        revoked: false,
      },
      {
        jti: refreshTokenId,
        type: "REFRESH",
        token: refreshToken,
        sessionId: session.id,
        userId: passkey.user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(refreshToken),
        revoked: false,
      },
    ],
  });

  loggerEvent(
    "passkey.service.login.verify.tokens-stored",
    { userId: passkey.user.id, sessionId: session.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣4️⃣ Retornar los datos al controlador
  // El controlador usará estos datos para:
  // - Establecer cookies (accessKey, clientKey)
  // - Enviar datos del usuario al frontend
  loggerEvent(
    "passkey.service.login.verify.complete",
    {
      userId: passkey.user.id,
      sessionId: session.id,
      email: passkey.user.email,
    },
    undefined,
    "passkey.service"
  );

  return {
    user: passkey.user,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    tokens: {
      accessTokenId, // Se guarda en cookie "accessKey"
      hashedPublicKey, // Se guarda en cookie "clientKey"
    },
  };
}

/**
 * 📋 LISTAR PASSKEYS: Obtener todos los passkeys registrados por el usuario
 *
 * ¿Qué hace?
 * - Busca todos los passkeys del usuario en la base de datos
 * - Incluye información del dispositivo asociado (iPhone, Android, etc.)
 * - Retorna una lista ordenada por fecha de creación (más reciente primero)
 *
 * Uso típico:
 * - Pantalla de "Mis dispositivos" o "Seguridad" en el frontend
 * - El usuario puede ver todos sus passkeys y eliminar los que ya no use
 *
 * @param userId - ID del usuario autenticado
 * @returns Lista de passkeys con información del dispositivo
 */
export async function listUserPasskeys(userId: string) {
  // Buscar todos los passkeys del usuario con información del dispositivo
  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    include: {
      device: {
        select: {
          device: true, // Ejemplo: "iPhone", "Pixel 7"
          os: true, // Ejemplo: "iOS 17", "Android 14"
          browser: true, // Ejemplo: "Safari", "Chrome"
        },
      },
    },
    orderBy: { createdAt: "desc" }, // Más recientes primero
  });

  // Mapear a un formato simplificado para el frontend
  return passkeys.map((passkey) => ({
    id: passkey.id,
    name: passkey.name, // Nombre amigable (ej: "iPhone de Felix")
    device: passkey.device, // Información del dispositivo
    transports: passkey.transports, // Métodos de transporte soportados
    createdAt: passkey.createdAt, // Cuándo se creó
    lastUsedAt: passkey.lastUsedAt, // Último uso
  }));
}

/**
 * 🗑️ ELIMINAR PASSKEY: Borrar un passkey específico
 *
 * ¿Qué hace?
 * - Verifica que el passkey pertenezca al usuario (seguridad)
 * - Elimina el passkey de la base de datos
 * - El usuario ya no podrá usar ese passkey para iniciar sesión
 *
 * Casos de uso:
 * - Usuario perdió su iPhone y quiere desvincularlo
 * - Usuario cambió de teléfono y quiere eliminar el antiguo
 * - Usuario ya no usa un dispositivo específico
 *
 * IMPORTANTE: Eliminar un passkey NO cierra las sesiones activas.
 * Para cerrar sesiones, el usuario debe usar la función de "Cerrar sesión en todos los dispositivos".
 *
 * @param userId - ID del usuario autenticado
 * @param passkeyId - ID del passkey a eliminar
 * @returns El ID del passkey eliminado
 */
export async function deletePasskey(userId: string, passkeyId: string) {
  // 1️⃣ Verificar que el passkey pertenezca al usuario
  // Esto previene que un usuario elimine passkeys de otros usuarios
  const passkey = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
  });

  if (!passkey) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.PASSKEY_NOT_FOUND,
      "PasskeyNotFound"
    );
  }

  // 2️⃣ Eliminar el passkey de la base de datos
  await prisma.passkey.delete({
    where: { id: passkeyId },
  });

  // 3️⃣ Retornar confirmación
  return { passkeyId };
}

//==============================================================================
//                    🔐 PASSKEY 2FA MANDATORY FUNCTIONS
//==============================================================================

/**
 * 🔐 SETUP CHALLENGE: Generar challenge para configurar passkey obligatorio
 *
 * IMPORTANTE: Este endpoint fuerza `authenticatorAttachment: "cross-platform"`
 * para que SOLO se pueda usar un dispositivo externo (teléfono).
 * No permite usar Keychain local, Windows Hello, etc.
 *
 * @param userId - ID del usuario (extraído del pendingToken)
 * @param email - Email del usuario
 * @param meta - Metadata de la petición
 * @returns Opciones de registro con cross-platform forzado
 */
export async function generatePasskeySetupChallenge(
  userId: string,
  email: string,
  meta: RequestMeta
) {
  loggerEvent(
    "passkey.service.setup.challenge.start",
    { userId, email },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Buscar al usuario en la base de datos
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.USER_NOT_FOUND,
      "UserNotFound"
    );
  }

  // 2️⃣ Verificar que no tenga passkeys (doble check de seguridad)
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  // 3️⃣ Generar opciones de registro con CROSS-PLATFORM forzado
  const options = await generateRegistrationOptions({
    rpName: webAuthnConfig.rpName,
    rpID: webAuthnConfig.rpId,
    userID: isoUint8Array.fromUTF8String(user.id),
    userName: user.email,
    userDisplayName:
      user.name && user.name.trim() !== ""
        ? user.name
        : user.email.split("@")[0],
    timeout: webAuthnConfig.timeout,
    attestationType: webAuthnConfig.attestation,
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key",
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
    // 🔐 CRÍTICO: Forzar cross-platform (solo teléfono, no Keychain local)
    authenticatorSelection: {
      authenticatorAttachment: "cross-platform", // 🔐 SOLO dispositivos externos
      requireResidentKey: true,
      residentKey: "required",
      userVerification: "required",
    },
    supportedAlgorithmIDs: [...webAuthnConfig.supportedAlgorithms],
  });

  // 4️⃣ Guardar challenge en Redis
  const challengeKey = `passkey:setup:challenge:${userId}`;
  const challengeData: StoredChallenge = {
    challenge: options.challenge,
    userId,
    expiresAt: Date.now() + webAuthnConfig.challengeTTL,
  };

  await redis.setEx(
    challengeKey,
    Math.floor(webAuthnConfig.challengeTTL / 1000),
    JSON.stringify(challengeData)
  );

  loggerEvent(
    "passkey.service.setup.challenge.complete",
    { userId, rpId: options.rp.id, crossPlatformEnforced: true },
    undefined,
    "passkey.service"
  );

  return options;
}

/**
 * ✅ VERIFY SETUP: Verificar passkey creado y completar login
 *
 * Este endpoint:
 * 1. Verifica el passkey creado
 * 2. Lo guarda en la base de datos
 * 3. Crea una sesión completa
 * 4. Genera tokens JWT
 *
 * @param userId - ID del usuario
 * @param credential - Credencial del navegador
 * @param name - Nombre del passkey
 * @param meta - Metadata de la petición
 * @returns Usuario, sesión y tokens
 */
export async function verifyPasskeySetupAndLogin(
  userId: string,
  credential: RegistrationResponseJSON,
  name: string | undefined,
  meta: RequestMeta
) {
  loggerEvent(
    "passkey.service.setup.verify.start",
    { userId, credentialId: credential.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Recuperar challenge de Redis
  const challengeKey = `passkey:setup:challenge:${userId}`;
  const storedChallengeData = await redis.get(challengeKey);

  if (!storedChallengeData) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_NOT_FOUND_OR_EXPIRED,
      "ChallengeNotFoundOrExpired"
    );
  }

  const storedChallenge: StoredChallenge = JSON.parse(storedChallengeData);

  // 2️⃣ Verificar expiración
  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(challengeKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_EXPIRED,
      "ChallengeExpired"
    );
  }

  // 3️⃣ Verificar credencial
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: webAuthnConfig.origin,
    expectedRPID: webAuthnConfig.rpId,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.PASSKEY_VERIFICATION_FAILED,
      "PasskeyVerificationFailed"
    );
  }

  const { credential: credentialInfo } = verification.registrationInfo;

  // 4️⃣ Buscar usuario
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.USER_NOT_FOUND,
      "UserNotFound"
    );
  }

  // 5️⃣ Crear/actualizar dispositivo
  const device = await prisma.device.upsert({
    where: {
      unique_device: {
        userId,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
        browser: meta.deviceInfo.browser,
      },
    },
    update: {
      lastUsedAt: new Date(),
      ipAddress: meta.ipAddress,
    },
    create: {
      userId,
      device: meta.deviceInfo.device,
      os: meta.deviceInfo.os,
      browser: meta.deviceInfo.browser,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      language: meta.language,
      timezone: meta.timezone,
      platform: meta.platform,
      screenResolution: meta.screenResolution,
      label: meta.label,
    },
  });

  // 6️⃣ Guardar passkey
  const transportsToSave = Array.from(
    new Set(credential.response.transports || [])
  );

  loggerEvent(
    "passkey.service.setup.verify.saving-passkey",
    {
      userId,
      credentialIdLength: credential.id.length,
      transportsFromBrowser: credential.response.transports,
      transportsToSave,
      rpId: webAuthnConfig.rpId,
    },
    undefined,
    "passkey.service"
  );

  const passkey = await prisma.passkey.create({
    data: {
      userId,
      deviceId: device.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credentialInfo.publicKey).toString("base64url"),
      counter: credentialInfo.counter,
      name: name || `${meta.deviceInfo.device} (${meta.deviceInfo.os})`,
      transports: transportsToSave,
    },
    select: {
      id: true,
      name: true,
    },
  });

  // 7️⃣ Eliminar challenge
  await redis.del(challengeKey);

  // 8️⃣ Crear sesión completa
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceId: device.id,
      clientKey: "",
      expiresAt: thirtyDaysFromNow(),
    },
  });

  // 9️⃣ Generar clientKey
  const hashedPublicKey = await generateClientKeyFromMeta(meta, user.id, session.id);

  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  // 🔟 Generar tokens
  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(user.id, session.id, user.role as UserRole, hashedPublicKey);

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(user.id, session.id, user.role as UserRole, hashedPublicKey);

  // 1️⃣1️⃣ Registrar tokens
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

  loggerEvent(
    "passkey.service.setup.verify.complete",
    { userId, sessionId: session.id, passkeyId: passkey.id },
    undefined,
    "passkey.service"
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    tokens: {
      accessTokenId,
      hashedPublicKey,
    },
    passkey: {
      id: passkey.id,
      name: passkey.name,
    },
  };
}

/**
 * 🔐 2FA CHALLENGE: Generar challenge para verificar passkey existente
 *
 * Enviamos allowCredentials con TODOS los transportes incluyendo 'hybrid'
 * para que el navegador muestre la opción de QR code y el teléfono
 * pueda encontrar la passkey específica.
 *
 * @param userId - ID del usuario
 * @param meta - Metadata de la petición
 * @returns Opciones de autenticación
 */
export async function generatePasskey2FAChallenge(userId: string, meta?: RequestMeta) {
  loggerEvent(
    "passkey.service.2fa.challenge.start",
    { userId },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Obtener los passkeys del usuario
  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true, name: true },
  });

  if (passkeys.length === 0) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.PASSKEY_NOT_FOUND,
      "NoPasskeysFound"
    );
  }

  loggerEvent(
    "passkey.service.2fa.challenge.passkeys-found",
    {
      userId,
      passkeyCount: passkeys.length,
      passkeys: passkeys.map(p => ({
        credentialId: p.credentialId.substring(0, 20) + "...",
        transports: p.transports,
        name: p.name
      }))
    },
    undefined,
    "passkey.service"
  );

  // 2️⃣ Construir allowCredentials con transportes explícitos
  // Siempre incluir 'hybrid' para permitir QR code authentication
  const allowCredentials = passkeys.map((passkey) => {
    // Combinar los transports guardados con 'hybrid' para asegurar que el QR funcione
    const storedTransports = (passkey.transports as AuthenticatorTransportFuture[]) || [];
    const allTransports = Array.from(new Set([...storedTransports, "hybrid", "internal"]));

    return {
      id: passkey.credentialId,
      type: "public-key" as const,
      transports: allTransports as AuthenticatorTransportFuture[],
    };
  });

  loggerEvent(
    "passkey.service.2fa.challenge.allowCredentials",
    {
      userId,
      allowCredentials: allowCredentials.map(c => ({
        id: c.id.substring(0, 20) + "...",
        transports: c.transports
      }))
    },
    undefined,
    "passkey.service"
  );

  // 3️⃣ Generar opciones de autenticación con allowCredentials explícitos
  const options = await generateAuthenticationOptions({
    rpID: webAuthnConfig.rpId,
    timeout: webAuthnConfig.timeout,
    userVerification: "required",
    allowCredentials,
  });

  // 4️⃣ Guardar challenge en Redis (con userId para seguridad)
  const challengeKey = `passkey:2fa:challenge:${userId}:${options.challenge}`;
  const challengeData: StoredChallenge = {
    challenge: options.challenge,
    userId,
    expiresAt: Date.now() + webAuthnConfig.challengeTTL,
  };

  await redis.setEx(
    challengeKey,
    Math.floor(webAuthnConfig.challengeTTL / 1000),
    JSON.stringify(challengeData)
  );

  loggerEvent(
    "passkey.service.2fa.challenge.complete",
    {
      userId,
      passkeyCount: passkeys.length,
      rpId: webAuthnConfig.rpId,
      hasAllowCredentials: true
    },
    undefined,
    "passkey.service"
  );

  return options;
}

/**
 * ✅ VERIFY 2FA: Verificar passkey y completar login
 *
 * @param userId - ID del usuario
 * @param credential - Credencial firmada
 * @param meta - Metadata de la petición
 * @returns Usuario, sesión y tokens
 */
export async function verifyPasskey2FAAndLogin(
  userId: string,
  credential: AuthenticationResponseJSON,
  meta: RequestMeta
) {
  loggerEvent(
    "passkey.service.2fa.verify.start",
    { userId, credentialId: credential.id },
    undefined,
    "passkey.service"
  );

  // 1️⃣ Decodificar clientDataJSON para extraer challenge
  const clientDataJSON = Buffer.from(
    credential.response.clientDataJSON,
    "base64url"
  ).toString("utf-8");
  const clientData = JSON.parse(clientDataJSON);
  const receivedChallenge = clientData.challenge;

  // 2️⃣ Buscar challenge en Redis
  const challengeKey = `passkey:2fa:challenge:${userId}:${receivedChallenge}`;
  const storedChallengeData = await redis.get(challengeKey);

  if (!storedChallengeData) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_NOT_FOUND_OR_EXPIRED,
      "ChallengeNotFoundOrExpired"
    );
  }

  const storedChallenge: StoredChallenge = JSON.parse(storedChallengeData);

  // 3️⃣ Verificar expiración
  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(challengeKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_EXPIRED,
      "ChallengeExpired"
    );
  }

  // 4️⃣ Verificar que el userId coincide
  if (storedChallenge.userId !== userId) {
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      ERROR_CODE.INVALID_PASSKEY,
      "UserIdMismatch"
    );
  }

  // 5️⃣ Buscar passkey
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: credential.id },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, isActive: true },
      },
    },
  });

  if (!passkey || passkey.userId !== userId) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.INVALID_PASSKEY,
      "InvalidPasskey"
    );
  }

  if (!passkey.user.isActive) {
    throw new HttpException(
      HTTP_CODE.FORBIDDEN,
      ERROR_CODE.USER_ACCOUNT_IS_DEACTIVATED,
      "UserAccountIsDeactivated"
    );
  }

  // 6️⃣ Verificar autenticación
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: webAuthnConfig.origin,
    expectedRPID: webAuthnConfig.rpId,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: passkey.counter,
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      ERROR_CODE.INVALID_PASSKEY,
      "InvalidPasskey"
    );
  }

  // 7️⃣ Actualizar contador
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  // 8️⃣ Eliminar challenge
  await redis.del(challengeKey);

  // 9️⃣ Crear dispositivo y sesión
  const device = await findOrCreateDevice(passkey.user.id, meta);

  const session = await prisma.session.create({
    data: {
      userId: passkey.user.id,
      deviceId: device.id,
      clientKey: "",
      expiresAt: thirtyDaysFromNow(),
    },
  });

  const hashedPublicKey = await generateClientKeyFromMeta(
    meta,
    passkey.user.id,
    session.id
  );

  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  // 🔟 Generar tokens
  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(
      passkey.user.id,
      session.id,
      passkey.user.role as UserRole,
      hashedPublicKey
    );

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(
      passkey.user.id,
      session.id,
      passkey.user.role as UserRole,
      hashedPublicKey
    );

  // 1️⃣1️⃣ Registrar tokens
  await prisma.tokenRecord.createMany({
    data: [
      {
        jti: accessTokenId,
        type: "ACCESS",
        token: accessToken,
        sessionId: session.id,
        userId: passkey.user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(accessToken),
        revoked: false,
      },
      {
        jti: refreshTokenId,
        type: "REFRESH",
        token: refreshToken,
        sessionId: session.id,
        userId: passkey.user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(refreshToken),
        revoked: false,
      },
    ],
  });

  loggerEvent(
    "passkey.service.2fa.verify.complete",
    { userId: passkey.user.id, sessionId: session.id, passkeyId: passkey.id },
    undefined,
    "passkey.service"
  );

  return {
    user: passkey.user,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    tokens: {
      accessTokenId,
      hashedPublicKey,
    },
    passkeyId: passkey.id,
  };
}
