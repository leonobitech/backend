# 🔐 Sistema de Autenticación con Passkeys - Backend

> **Documentación completa del sistema de autenticación con Passkeys (WebAuthn/FIDO2) implementado en el backend de LeonobiTech**

---

## 📚 Tabla de Contenidos

1. [¿Qué son los Passkeys?](#qué-son-los-passkeys)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Flujo de Registro](#flujo-de-registro)
4. [Flujo de Login](#flujo-de-login)
5. [Conceptos de Seguridad](#conceptos-clave-de-seguridad)
6. [Estructura de Datos](#estructura-de-datos-en-base-de-datos)
7. [Ejemplos Prácticos](#ejemplo-práctico-completo)

---

## 🔐 ¿Qué son los Passkeys?

Los **passkeys** son una forma de autenticación **sin contraseña** que usa:

- **Biometría** (Face ID, Touch ID, huella digital)
- **Llaves de seguridad** físicas (YubiKey)
- **PIN del dispositivo**

### Funcionamiento Básico

Funcionan con **criptografía de clave pública/privada**:

- La **clave privada** se guarda en el dispositivo del usuario (nunca sale de ahí)
- La **clave pública** se guarda en tu servidor (base de datos)

**Ventajas sobre contraseñas:**

- ✅ Más seguro (inmune a phishing)
- ✅ Más rápido (un toque/mirada)
- ✅ No se puede robar la clave privada
- ✅ Funciona offline
- ✅ Sincronizable entre dispositivos (Apple iCloud, Google Password Manager)

---

## 📋 Arquitectura del Sistema

```
┌─────────────┐         ┌──────────────┐         ┌──────────┐
│  Frontend   │ ◄─────► │   Backend    │ ◄─────► │   Redis  │
│ (Browser)   │         │  (Express)   │         │ (Temp)   │
└─────────────┘         └──────────────┘         └──────────┘
                                │
                                ▼
                        ┌──────────────┐
                        │  PostgreSQL  │
                        │  (Prisma)    │
                        └──────────────┘
```

### Componentes

| Componente     | Responsabilidad                                                        |
| -------------- | ---------------------------------------------------------------------- |
| **Frontend**   | Usa API `navigator.credentials` del navegador para crear/usar passkeys |
| **Backend**    | Verifica credenciales, maneja sesiones, genera tokens JWT              |
| **Redis**      | Almacena challenges temporales con TTL de 5 minutos                    |
| **PostgreSQL** | Guarda passkeys, usuarios, sesiones, tokens de forma persistente       |

### Tecnologías Utilizadas

- **[@simplewebauthn/server](https://simplewebauthn.dev/)**: Librería que implementa el estándar WebAuthn
- **Prisma ORM**: Gestión de base de datos
- **Redis**: Cache y almacenamiento temporal
- **JWT (jose)**: Tokens de autenticación firmados con RSA
- **Express 5**: Framework web

---

## 🔄 Flujo de Registro de Passkey

### Escenario

Usuario **ya autenticado** quiere agregar un passkey a su cuenta para futuros logins.

### Diagrama de Secuencia

```
┌──────────┐                    ┌──────────┐                    ┌─────────┐
│ Frontend │                    │ Backend  │                    │  Redis  │
└────┬─────┘                    └────┬─────┘                    └────┬────┘
     │                               │                               │
     │ 1️⃣ POST /passkey/register/   │                               │
     │    challenge                  │                               │
     ├──────────────────────────────►│                               │
     │   { meta: {...} }             │                               │
     │                               │                               │
     │                               │ 2️⃣ Buscar usuario en DB      │
     │                               │                               │
     │                               │ 3️⃣ Generar challenge          │
     │                               │   (valor aleatorio)           │
     │                               │                               │
     │                               ├──────────────────────────────►│
     │                               │ 4️⃣ Guardar challenge          │
     │                               │   TTL: 5 minutos              │
     │                               │◄──────────────────────────────┤
     │◄──────────────────────────────┤                               │
     │   { options: {                │                               │
     │     challenge: "abc123...",   │                               │
     │     rpId: "leonobitech.com",  │                               │
     │     user: {...}               │                               │
     │   }}                          │                               │
     │                               │                               │
     │ 5️⃣ navigator.credentials      │                               │
     │    .create(options)           │                               │
     │    [Usuario usa Face ID]      │                               │
     │                               │                               │
     │ 6️⃣ POST /passkey/register/   │                               │
     │    verify                     │                               │
     ├──────────────────────────────►│                               │
     │   { credential: {...},        │                               │
     │     name: "iPhone 15" }       │                               │
     │                               │                               │
     │                               ├──────────────────────────────►│
     │                               │ 7️⃣ Recuperar challenge        │
     │                               │◄──────────────────────────────┤
     │                               │                               │
     │                               │ 8️⃣ Verificar firma            │
     │                               │   criptográfica               │
     │                               │   ✓ Challenge coincide        │
     │                               │   ✓ Origin correcto           │
     │                               │   ✓ Firma válida              │
     │                               │                               │
     │                               │ 9️⃣ Guardar en DB:             │
     │                               │   - credentialId              │
     │                               │   - publicKey (clave pública) │
     │                               │   - counter: 0                │
     │                               │   - deviceId                  │
     │                               │                               │
     │                               ├──────────────────────────────►│
     │                               │ 🔟 Eliminar challenge         │
     │                               │◄──────────────────────────────┤
     │◄──────────────────────────────┤                               │
     │   { passkey: {                │                               │
     │     id: "...",                │                               │
     │     name: "iPhone 15"         │                               │
     │   }}                          │                               │
     │                               │                               │
```

### Código Backend - Paso 1: Generar Challenge

**Endpoint:** `POST /account/passkey/register/challenge`

**Requiere autenticación:** ✅ SÍ (middleware `authenticate`)

```typescript
export async function generatePasskeyRegistrationChallenge(
  userId: string,
  meta: RequestMeta
) {
  // 1️⃣ Buscar usuario en la base de datos
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new HttpException(HTTP_CODE.NOT_FOUND, ERROR_CODE.USER_NOT_FOUND);
  }

  // 2️⃣ Obtener passkeys existentes del usuario (evitar duplicados)
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  // 3️⃣ Generar opciones de registro usando la librería WebAuthn
  const options = await generateRegistrationOptions({
    rpName: "LeonobiTech", // Nombre que se muestra al usuario
    rpID: "leonobitech.com", // Dominio
    userID: isoUint8Array.fromUTF8String(user.id), // ID del usuario (bytes)
    userName: user.email, // Email del usuario
    userDisplayName: user.name || user.email, // Nombre amigable
    timeout: 120000, // 2 minutos para completar
    attestationType: "none", // No verificar fabricante del dispositivo

    // Lista de passkeys que ya tiene (el navegador no permitirá duplicados)
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key",
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),

    // Configuración del autenticador
    authenticatorSelection: {
      authenticatorAttachment: undefined, // undefined = cualquier tipo
      requireResidentKey: true, // Passkey se guarda en el dispositivo
      residentKey: "required", // DEBE guardarse (no efímero)
      userVerification: "preferred", // Biometría preferida pero no obligatoria
    },

    // Algoritmos criptográficos soportados: ES256 (-7) y RS256 (-257)
    supportedAlgorithmIDs: [-7, -257],
  });

  // 4️⃣ Guardar el challenge en Redis con expiración de 5 minutos
  const challengeKey = `passkey:register:challenge:${userId}`;
  const challengeData = {
    challenge: options.challenge,
    userId,
    expiresAt: Date.now() + 300000, // 5 minutos
  };

  await redis.setEx(
    challengeKey,
    300, // TTL en segundos
    JSON.stringify(challengeData)
  );

  // 5️⃣ Retornar opciones al frontend
  return options;
}
```

### Código Backend - Paso 2: Verificar y Guardar

**Endpoint:** `POST /account/passkey/register/verify`

**Requiere autenticación:** ✅ SÍ (middleware `authenticate`)

```typescript
export async function verifyPasskeyRegistration(
  userId: string,
  credential: RegistrationResponseJSON,
  name: string | undefined,
  meta: RequestMeta
) {
  // 1️⃣ Recuperar el challenge de Redis
  const challengeKey = `passkey:register:challenge:${userId}`;
  const storedChallengeData = await redis.get(challengeKey);

  if (!storedChallengeData) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_NOT_FOUND_OR_EXPIRED
    );
  }

  const storedChallenge = JSON.parse(storedChallengeData);

  // 2️⃣ Verificar que el challenge no haya expirado
  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(challengeKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_EXPIRED
    );
  }

  // 3️⃣ Verificar criptográficamente que la credencial sea válida
  // La librería @simplewebauthn/server verifica:
  // - Que el challenge coincida con el que enviamos
  // - Que el origin sea correcto (https://leonobitech.com)
  // - Que el rpID coincida (leonobitech.com)
  // - Que la firma criptográfica sea válida
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: "https://leonobitech.com",
    expectedRPID: "leonobitech.com",
    requireUserVerification: false, // "preferred" = opcional
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.PASSKEY_VERIFICATION_FAILED
    );
  }

  const { credential: credentialInfo } = verification.registrationInfo;

  // 4️⃣ Encontrar o crear el dispositivo en la base de datos
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
  const passkey = await prisma.passkey.create({
    data: {
      userId,
      deviceId: device.id,
      credentialId: Buffer.from(credentialInfo.id).toString("base64url"),
      publicKey: Buffer.from(credentialInfo.publicKey).toString("base64url"),
      counter: credentialInfo.counter, // Contador inicial
      name: name || `${meta.deviceInfo.device} (${meta.deviceInfo.os})`,
      // Siempre incluir 'hybrid' para permitir autenticación cross-device con QR
      transports: Array.from(
        new Set([...(credential.response.transports || []), "hybrid"])
      ),
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  // 6️⃣ Eliminar el challenge de Redis (ya fue usado)
  await redis.del(challengeKey);

  // 7️⃣ Retornar el passkey creado
  return passkey;
}
```

---

## 🔑 Flujo de Login con Passkey

### Escenario

Usuario **SIN sesión activa** quiere iniciar sesión usando un passkey.

### Diagrama de Secuencia

```
┌──────────┐                    ┌──────────┐                    ┌─────────┐
│ Frontend │                    │ Backend  │                    │  Redis  │
└────┬─────┘                    └────┬─────┘                    └────┬────┘
     │                               │                               │
     │ 1️⃣ POST /passkey/login/       │                               │
     │    challenge                  │                               │
     ├──────────────────────────────►│                               │
     │   { email: "felix@...",       │                               │
     │     meta: {...} }             │                               │
     │                               │                               │
     │                               │ 2️⃣ Buscar passkeys del usuario│
     │                               │                               │
     │                               │ 3️⃣ Generar challenge          │
     │                               │                               │
     │                               ├──────────────────────────────►│
     │                               │ 4️⃣ Guardar challenge          │
     │                               │◄──────────────────────────────┤
     │◄──────────────────────────────┤                               │
     │   { options: {                │                               │
     │     challenge: "xyz789...",   │                               │
     │     allowCredentials: [...]   │                               │
     │   }}                          │                               │
     │                               │                               │
     │ 5️⃣ navigator.credentials      │                               │
     │    .get(options)              │                               │
     │    [Usuario usa Face ID]      │                               │
     │                               │                               │
     │ 6️⃣ POST /passkey/login/verify │                               │
     ├──────────────────────────────►│                               │
     │   { credential: {...} }       │                               │
     │                               │                               │
     │                               ├──────────────────────────────►│
     │                               │ 7️⃣ Recuperar challenge        │
     │                               │◄──────────────────────────────┤
     │                               │                               │
     │                               │ 8️⃣ Buscar passkey en DB       │
     │                               │   por credentialId            │
     │                               │                               │
     │                               │ 9️⃣ Verificar firma usando       │
     │                               │   publicKey guardada          │
     │                               │   ✓ Challenge coincide        │
     │                               │   ✓ Firma válida              │
     │                               │   ✓ Counter incrementó        │
     │                               │                               │
     │                               │ 🔟 Actualizar counter         │
     │                               │                               │
     │                               │ 1️⃣1️⃣ Crear sesión             │
     │                               │   - Session en DB             │
     │                               │   - Device en DB              │
     │                               │   - Access Token (JWT)        │
     │                               │   - Refresh Token (JWT)       │
     │                               │   - ClientKey (fingerprint)    │
     │                               │                               │
     │◄──────────────────────────────┤                               │
     │   Set-Cookie: accessKey=...   │                               │
     │   Set-Cookie: clientKey=...   │                               │
     │                               │                               │
     │   { user: {...},              │                               │
     │     session: {...} }          │                               │
     │                               │                               │
```

### Código Backend - Paso 1: Generar Challenge de Login

**Endpoint:** `POST /account/passkey/login/challenge`

**Requiere autenticación:** ❌ NO (es un endpoint público de login)

```typescript
export async function generatePasskeyAuthenticationChallenge(
  email?: string,
  meta?: RequestMeta
) {
  let allowCredentials: Array<{
    id: string;
    type: "public-key";
    transports: AuthenticatorTransportFuture[];
  }> = [];

  let userId: string | undefined;

  // 1️⃣ Si se proporciona email, buscar los passkeys del usuario
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      throw new HttpException(HTTP_CODE.NOT_FOUND, ERROR_CODE.USER_NOT_FOUND);
    }

    userId = user.id;

    // Obtener todos los passkeys registrados por este usuario
    const passkeys = await prisma.passkey.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });

    // Mapear los passkeys a la estructura que espera WebAuthn
    allowCredentials = passkeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key" as const,
      // Incluir 'hybrid' para permitir QR cross-device
      transports: [
        ...(passkey.transports as AuthenticatorTransportFuture[]),
        "hybrid",
      ] as AuthenticatorTransportFuture[],
    }));
  }

  // 2️⃣ Generar opciones de autenticación
  const options = await generateAuthenticationOptions({
    rpID: "leonobitech.com",
    timeout: 120000, // 2 minutos
    userVerification: "preferred", // Biometría preferida
    // Si hay passkeys específicos, enviarlos. Si no, undefined = modo "discoverable"
    allowCredentials:
      allowCredentials.length > 0 ? allowCredentials : undefined,
  });

  // 3️⃣ Guardar el challenge en Redis (expiración de 5 minutos)
  const challengeKey = `passkey:login:challenge:${options.challenge}`;
  const challengeData = {
    challenge: options.challenge,
    userId, // Puede ser undefined si no se proporcionó email
    expiresAt: Date.now() + 300000,
  };

  await redis.setEx(challengeKey, 300, JSON.stringify(challengeData));

  // 4️⃣ Retornar las opciones al frontend
  return options;
}
```

### Código Backend - Paso 2: Verificar Login y Crear Sesión

**Endpoint:** `POST /account/passkey/login/verify`

**Requiere autenticación:** ❌ NO (es un endpoint público de login)

```typescript
export async function verifyPasskeyAuthentication(
  credential: AuthenticationResponseJSON,
  meta: RequestMeta
) {
  // 1️⃣ Buscar el challenge en Redis
  // NOTA: Este código itera sobre todos los challenges (no óptimo, mejorar en producción)
  const allKeys = await redis.keys("passkey:login:challenge:*");
  let storedChallengeData: string | null = null;
  let foundChallengeKey: string | null = null;

  for (const key of allKeys) {
    const data = await redis.get(key);
    if (data) {
      storedChallengeData = data;
      foundChallengeKey = key;
      break;
    }
  }

  if (!storedChallengeData || !foundChallengeKey) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_NOT_FOUND_OR_EXPIRED
    );
  }

  const storedChallenge = JSON.parse(storedChallengeData);

  // 2️⃣ Verificar que el challenge no haya expirado
  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(foundChallengeKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CHALLENGE_EXPIRED
    );
  }

  // 3️⃣ Buscar el passkey en la base de datos usando el credentialId
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
    throw new HttpException(HTTP_CODE.NOT_FOUND, ERROR_CODE.INVALID_PASSKEY);
  }

  // 4️⃣ Verificar que la cuenta del usuario esté activa
  if (!passkey.user.isActive) {
    throw new HttpException(
      HTTP_CODE.FORBIDDEN,
      ERROR_CODE.USER_ACCOUNT_IS_DEACTIVATED
    );
  }

  // 5️⃣ Verificar criptográficamente la autenticación
  // La librería verifica:
  // - Que el challenge coincida
  // - Que el origin sea correcto
  // - Que la firma criptográfica sea válida usando la clave pública guardada
  // - Que el counter sea mayor al anterior (protección contra clonación)
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: "https://leonobitech.com",
    expectedRPID: "leonobitech.com",
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: passkey.counter,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new HttpException(HTTP_CODE.UNAUTHORIZED, ERROR_CODE.INVALID_PASSKEY);
  }

  // 6️⃣ Actualizar el contador del passkey
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  // 7️⃣ Eliminar el challenge de Redis (ya fue usado)
  await redis.del(foundChallengeKey);

  // 8️⃣ Encontrar o crear el dispositivo
  const device = await findOrCreateDevice(passkey.user.id, meta);

  // 9️⃣ Crear una nueva sesión en la base de datos
  const session = await prisma.session.create({
    data: {
      userId: passkey.user.id,
      deviceId: device.id,
      clientKey: "",
      expiresAt: thirtyDaysFromNow(),
    },
  });

  // 🔟 Generar el clientKey (fingerprint del dispositivo)
  const hashedPublicKey = await generateClientKeyFromMeta(
    meta,
    passkey.user.id,
    session.id
  );

  // 1️⃣1️⃣ Actualizar la sesión con el clientKey
  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  // 1️⃣2️⃣ Generar tokens JWT (access y refresh)
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

  // 1️⃣3️⃣ Registrar los tokens en la base de datos
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

  // 1️⃣4️⃣ Retornar los datos al controlador
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
  };
}
```

---

## 🔒 Conceptos Clave de Seguridad

### 1. Challenge (Desafío)

**¿Qué es?**

```typescript
const challenge = "random_base64_string_abc123...";
```

**¿Para qué sirve?**

- Prevenir **ataques de replay** (reutilización de credenciales antiguas)
- Es un **valor aleatorio** que se genera en cada intento
- Se guarda temporalmente en **Redis (5 min)**
- El navegador lo **firma** con la clave privada del usuario
- El servidor **verifica** la firma con la clave pública guardada

**Analogía:**

> Es como un ticket de supermercado con número único. Solo sirve para esa compra específica y expira después de usarlo.

---

### 2. Counter (Contador)

**¿Qué es?**

```typescript
counter: 0; // Primera vez
counter: 1; // Segundo uso
counter: 2; // Tercer uso
// ... incrementa en cada autenticación
```

**¿Para qué sirve?**

- Protección contra **clonación de passkeys**
- Si un atacante clona el passkey, el counter estará **desincronizado**
- El servidor **rechaza** si `counter <= counterGuardado`

**Ejemplo de ataque bloqueado:**

```
1. Usuario autentica: counter 0 → 1 ✓
2. Usuario autentica: counter 1 → 2 ✓
3. Atacante clona el passkey (con counter 1)
4. Usuario autentica: counter 2 → 3 ✓
5. Atacante intenta usar: counter 1 ✗ RECHAZADO (espera counter > 3)
```

---

### 3. ClientKey (Fingerprint)

**¿Qué es?**

```typescript
const clientKey = hash(ipAddress + userAgent + userId + sessionId);
```

**¿Para qué sirve?**

- Vincula el **token JWT al dispositivo específico**
- Si roban el token y lo usan desde otro dispositivo → **RECHAZADO**
- Se guarda en cookie HttpOnly **"clientKey"**

**Ejemplo:**

```typescript
// Usuario en iPhone
clientKey = hash("192.168.1.100" + "Safari/iOS" + userId + sessionId);
// = "abc123..."

// Atacante roba el token y lo usa en Windows
clientKey_atacante = hash("10.0.0.50" + "Chrome/Windows" + userId + sessionId);
// = "xyz789..." ← DIFERENTE

// Servidor compara: "abc123..." !== "xyz789..." → RECHAZADO ✗
```

---

### 4. Transports (Métodos de Comunicación)

**Tipos disponibles:**

```typescript
transports: ["internal", "hybrid", "usb", "nfc", "ble"];
```

| Transport    | Descripción                             | Ejemplo                                 |
| ------------ | --------------------------------------- | --------------------------------------- |
| **internal** | Biometría integrada en el dispositivo   | Face ID en iPhone, Touch ID en MacBook  |
| **hybrid**   | QR code para autenticación cross-device | Escanear QR con iPhone para login en PC |
| **usb**      | Llave de seguridad física por USB       | YubiKey conectada por cable             |
| **nfc**      | Llave de seguridad por NFC              | YubiKey tocada al teléfono              |
| **ble**      | Llave de seguridad por Bluetooth        | Llave Bluetooth emparejada              |

**¿Por qué incluimos 'hybrid'?**

```typescript
// Siempre agregamos 'hybrid' para permitir login cross-device
transports: Array.from(
  new Set([...(credential.response.transports || []), "hybrid"])
);

// Ejemplo de uso:
// 1. Usuario está en PC sin passkey
// 2. Escanea QR code con iPhone
// 3. Autentica con Face ID en iPhone
// 4. Login exitoso en PC ✓
```

---

## 🗄️ Estructura de Datos en Base de Datos

### Modelo Prisma: Passkey

```prisma
model Passkey {
  id           String   @id @default(uuid())
  userId       String
  deviceId     String
  credentialId String   @unique
  publicKey    String
  counter      Int      @default(0)
  name         String?
  transports   String[]
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([credentialId])
}
```

### Ejemplo de Datos Guardados

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123",
  "deviceId": "device_456",
  "credentialId": "AaFdkcmVkZW50aWFsSWQ...",
  "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "counter": 5,
  "name": "iPhone 15 de Felix",
  "transports": ["internal", "hybrid"],
  "createdAt": "2025-10-03T15:30:00.000Z",
  "lastUsedAt": "2025-10-03T20:45:00.000Z"
}
```

### Campos Importantes

| Campo            | Tipo               | Descripción                                    |
| ---------------- | ------------------ | ---------------------------------------------- |
| **credentialId** | String (base64url) | Identificador único del passkey (como un UUID) |
| **publicKey**    | String (base64url) | Clave pública para verificar firmas            |
| **counter**      | Integer            | Contador de usos (anti-clonación)              |
| **name**         | String             | Nombre amigable ("iPhone de Felix")            |
| **transports**   | Array              | Métodos de transporte soportados               |

---

### Flujo de Datos Completo

```
1. REGISTRO:
   ┌─────────────────────────────────────────┐
   │ credentialId: "abc123..."               │
   │ publicKey: "MFkwEwYHKoZI..." ← DB       │
   │ counter: 0                              │
   └─────────────────────────────────────────┘

2. LOGIN (1ra vez):
   ┌─────────────────────────────────────────┐
   │ Usuario autentica con Face ID           │
   │ Navegador firma con clave privada       │
   │ Servidor verifica con publicKey         │
   │ counter: 0 → 1 ✓                        │
   └─────────────────────────────────────────┘

3. LOGIN (2da vez):
   ┌─────────────────────────────────────────┐
   │ counter: 1 → 2 ✓                        │
   └─────────────────────────────────────────┘

4. ATAQUE (intento de clonar):
   ┌─────────────────────────────────────────┐
   │ Atacante usa counter: 1                 │
   │ Servidor espera counter > 2             │
   │ RECHAZADO ✗                             │
   └─────────────────────────────────────────┘
```

---

## 🎯 Ejemplo Práctico Completo

### Caso de Uso 1: Felix Agrega Passkey a su Cuenta

**Contexto:** Felix ya está logueado con email/password y quiere agregar Face ID.

#### Frontend

```typescript
// 1️⃣ Felix hace clic en "Agregar Face ID"
async function registerPasskey() {
  // Capturar metadata del dispositivo
  const meta = {
    ipAddress: await getClientIP(),
    deviceInfo: {
      device: "iPhone",
      os: "iOS 17",
      browser: "Safari",
    },
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: navigator.platform,
    screenResolution: `${screen.width}x${screen.height}`,
    label: "iPhone de Felix",
  };

  // Solicitar challenge al backend
  const response = await fetch("/api/passkey/register/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // Enviar cookies de sesión
    body: JSON.stringify({ meta }),
  });

  const { options } = await response.json();

  // 2️⃣ Crear passkey con Face ID
  const credential = await navigator.credentials.create({
    publicKey: options,
  });

  // 3️⃣ Enviar credencial al backend
  const verifyResponse = await fetch("/api/passkey/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      credential,
      name: "iPhone 15 de Felix",
      meta,
    }),
  });

  const { passkey } = await verifyResponse.json();

  // ✅ Passkey guardado!
  console.log("Passkey registrado:", passkey);
  alert("Face ID agregado exitosamente! 🎉");
}
```

#### Backend

```typescript
// Controlador
export const generateRegisterChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!; // Del middleware authenticate
    const { meta } = req.body;

    const options = await generatePasskeyRegistrationChallenge(userId, meta);

    res.status(200).json({
      message: "Registration challenge generated",
      options,
    });
  }
);

export const verifyRegister = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { credential, name, meta } = req.body;

    const passkey = await verifyPasskeyRegistration(
      userId,
      credential,
      name,
      meta
    );

    res.status(201).json({
      message: "Passkey registered successfully",
      passkey,
    });
  }
);
```

---

### Caso de Uso 2: Felix Hace Login con Face ID

**Contexto:** Felix NO tiene sesión activa y quiere iniciar sesión.

#### Frontend

```typescript
// 1️⃣ Felix hace clic en "Login con Face ID"
async function loginWithPasskey() {
  const email = "felix@leonobitech.com"; // Opcional

  const meta = {
    ipAddress: await getClientIP(),
    deviceInfo: detectDevice(),
    userAgent: navigator.userAgent,
    // ... resto de metadata
  };

  // Solicitar challenge al backend
  const response = await fetch("/api/passkey/login/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, meta }),
  });

  const { options } = await response.json();

  // 2️⃣ Autenticar con Face ID
  const credential = await navigator.credentials.get({
    publicKey: options,
  });

  // 3️⃣ Enviar credencial al backend
  const loginResponse = await fetch("/api/passkey/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // Recibir cookies
    body: JSON.stringify({ credential, meta }),
  });

  const { user, session } = await loginResponse.json();

  // ✅ Login exitoso!
  console.log("Usuario autenticado:", user);
  console.log("Sesión creada:", session);

  // Las cookies (accessKey, clientKey) ya fueron establecidas
  // Redirigir al dashboard
  window.location.href = "/dashboard";
}
```

#### Backend

```typescript
// Controlador
export const generateLoginChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const { email, meta } = req.body;

    const options = await generatePasskeyAuthenticationChallenge(email, meta);

    res.status(200).json({
      message: "Authentication challenge generated",
      options,
    });
  }
);

export const verifyLogin = catchErrors(async (req: Request, res: Response) => {
  const { credential, meta } = req.body;

  const result = await verifyPasskeyAuthentication(credential, meta);

  // Establecer cookies de autenticación
  setAuthCookies({
    res,
    accessKey: result.tokens.accessTokenId,
    clientKey: result.tokens.hashedPublicKey,
  });

  res.status(200).json({
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
```

---

## 📊 Resumen de Endpoints

| Endpoint                              | Método | Auth  | Descripción                             |
| ------------------------------------- | ------ | ----- | --------------------------------------- |
| `/account/passkey/register/challenge` | POST   | ✅ Sí | Genera challenge para registrar passkey |
| `/account/passkey/register/verify`    | POST   | ✅ Sí | Verifica y guarda passkey               |
| `/account/passkey/login/challenge`    | POST   | ❌ No | Genera challenge para login             |
| `/account/passkey/login/verify`       | POST   | ❌ No | Verifica login y crea sesión            |
| `/account/passkeys`                   | GET    | ✅ Sí | Lista passkeys del usuario              |
| `/account/passkeys/:id`               | DELETE | ✅ Sí | Elimina un passkey                      |

---

## 🔐 Consideraciones de Seguridad

### ✅ Implementadas

1. **Challenge temporal (5 min)** - Previene ataques de replay
2. **Counter anti-clonación** - Detecta passkeys clonados
3. **ClientKey (fingerprint)** - Vincula token al dispositivo
4. **Cookies HttpOnly** - Protege contra XSS
5. **Cookies Secure** - Solo HTTPS
6. **Cookies SameSite** - Protege contra CSRF
7. **Verificación de origin** - Solo acepta requests del dominio correcto
8. **Cuenta activa** - Verifica `user.isActive` antes de autenticar

### ⚠️ Mejoras Pendientes

1. **Rate limiting** - Limitar intentos de autenticación
2. **Optimizar búsqueda de challenge** - Usar hash map en lugar de iteración
3. **Logging de seguridad** - Registrar intentos fallidos
4. **Notificaciones** - Alertar al usuario de nuevos passkeys registrados
5. **Revocación de sesiones** - Al eliminar passkey, cerrar sesiones asociadas

---

## 🧪 Testing

### Flujo de Prueba Manual

```bash
# 1. Registrar passkey
curl -X POST http://localhost:3001/account/passkey/register/challenge \
  -H "Cookie: accessKey=..." \
  -H "Content-Type: application/json" \
  -d '{"meta": {...}}'

# 2. Login con passkey
curl -X POST http://localhost:3001/account/passkey/login/challenge \
  -H "Content-Type: application/json" \
  -d '{"email": "felix@leonobitech.com", "meta": {...}}'

# 3. Listar passkeys
curl -X GET http://localhost:3001/account/passkeys \
  -H "Cookie: accessKey=..."

# 4. Eliminar passkey
curl -X DELETE http://localhost:3001/account/passkeys/passkey_id \
  -H "Cookie: accessKey=..."
```

---

## 📚 Referencias

- **WebAuthn Spec**: https://www.w3.org/TR/webauthn-2/
- **SimpleWebAuthn Docs**: https://simplewebauthn.dev/
- **FIDO Alliance**: https://fidoalliance.org/
- **MDN Web Authentication API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API

---

## 👨‍💻 Autor

**Felix - LeonobiTech**

- Email: felix@leonobitech.com
- Website: https://leonobitech.com

---

_Documentación generada el 3 de octubre de 2025_
