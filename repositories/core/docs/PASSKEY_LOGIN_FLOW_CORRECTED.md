# 🔑 Flujo Correcto de Login con Passkey (Cross-Device)

## Escenario Real: Usuario en PC sin passkey, usa iPhone para autenticar

---

## 📊 Diferencia Clave: REGISTRO vs LOGIN

### 🆕 **REGISTRO** (Primera vez)
```
1. Backend genera challenge
2. Usuario crea passkey con huella
3. Dispositivo genera PAR DE CLAVES:
   - Clave PRIVADA → se queda en el dispositivo (nunca sale)
   - Clave PÚBLICA → se envía al backend
4. Backend GUARDA la clave pública en DB ✅
```

### 🔓 **LOGIN** (Veces siguientes)
```
1. Backend genera challenge
2. Usuario autentica con huella
3. Dispositivo FIRMA el challenge con la clave privada
4. Backend VERIFICA la firma usando la clave pública YA GUARDADA ✅
5. Backend NO guarda nada nuevo
```

---

## ✅ Flujo Correcto Paso a Paso

### **1️⃣ Usuario en PC hace clic en "Login con Passkey"**

```typescript
// Frontend (PC)
const response = await fetch('/api/passkey/login/challenge', {
  method: 'POST',
  body: JSON.stringify({
    email: 'felix@leonobitech.com'  // Opcional
  })
});

const { options } = await response.json();
// options = {
//   challenge: "abc123...",  ← Challenge aleatorio
//   rpId: "leonobitech.com",
//   allowCredentials: [      ← Passkeys del usuario
//     { id: "credId1", transports: ["hybrid"] },
//     { id: "credId2", transports: ["hybrid"] }
//   ]
// }
```

### **2️⃣ Backend genera challenge y lo guarda temporalmente**

```typescript
// Backend
export async function generatePasskeyAuthenticationChallenge(email: string) {
  // Buscar usuario por email
  const user = await prisma.user.findUnique({ where: { email } });

  // Obtener passkeys PREVIAMENTE REGISTRADOS
  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: {
      credentialId: true,  // IDs de passkeys existentes
      publicKey: true      // Claves públicas YA guardadas
    }
  });

  // Generar challenge
  const options = await generateAuthenticationOptions({
    rpID: "leonobitech.com",
    allowCredentials: passkeys.map(p => ({
      id: p.credentialId,
      transports: ["hybrid"]  // Permite QR cross-device
    }))
  });

  // Guardar challenge en Redis (5 min)
  await redis.setEx(
    `passkey:login:challenge:${options.challenge}`,
    300,
    JSON.stringify({
      challenge: options.challenge,
      userId: user.id
    })
  );

  return options;
}
```

### **3️⃣ Navegador (PC) muestra QR code**

```typescript
// Frontend (PC)
const credential = await navigator.credentials.get({
  publicKey: options
});

// El navegador:
// 1. Ve que no hay passkeys locales en el PC
// 2. Ve que allowCredentials tiene transport "hybrid"
// 3. Muestra QR code para escanear con otro dispositivo
```

### **4️⃣ Usuario escanea QR con iPhone**

```
┌─────────────────────────────────────┐
│          PC (Navegador)             │
│                                     │
│   ┌───────────────────┐             │
│   │  [QR CODE]        │             │
│   │  ███████  ███     │             │
│   │  ███  ███ ███     │             │
│   │  ███████  ███     │             │
│   └───────────────────┘             │
│                                     │
│  Escanea con tu iPhone              │
└─────────────────────────────────────┘
              │
              │ Usuario escanea QR
              ▼
┌─────────────────────────────────────┐
│         iPhone (Camera)             │
│                                     │
│  QR detectado!                      │
│  ¿Iniciar sesión en leonobitech?   │
│                                     │
│       [Continuar]  [Cancelar]       │
└─────────────────────────────────────┘
```

### **5️⃣ iPhone pide autenticación biométrica**

```
┌─────────────────────────────────────┐
│            iPhone                   │
│                                     │
│   leonobitech.com solicita          │
│   que inicies sesión                │
│                                     │
│         [Face ID Icon]              │
│                                     │
│   Usa Face ID para continuar        │
│                                     │
└─────────────────────────────────────┘
```

**¿Qué pasa internamente?**
```typescript
// En el iPhone (navegador o sistema operativo)

1. Usuario coloca cara frente a cámara
2. Face ID verifica identidad
3. Sistema DESBLOQUEA acceso a la CLAVE PRIVADA
   (guardada en Secure Enclave)
4. Sistema FIRMA el challenge con la clave privada:

   signature = sign(challenge, privateKey)

5. Sistema envía al PC:
   {
     credentialId: "abc123...",
     signature: "xyz789...",     ← Firma del challenge
     clientDataJSON: {...},
     authenticatorData: {...}
   }
```

### **6️⃣ PC envía credencial firmada al backend**

```typescript
// Frontend (PC) recibe la credencial del iPhone vía Bluetooth/QR
const credential = {
  id: "abc123...",              // ID del passkey
  response: {
    signature: "xyz789...",      // ← FIRMA del challenge (con clave privada)
    clientDataJSON: "...",
    authenticatorData: "..."
  }
};

// Enviar al backend
await fetch('/api/passkey/login/verify', {
  method: 'POST',
  body: JSON.stringify({ credential })
});
```

### **7️⃣ Backend VERIFICA la firma (NO guarda nada)**

```typescript
// Backend
export async function verifyPasskeyAuthentication(credential: AuthenticationResponseJSON) {
  // 1. Recuperar challenge de Redis
  const storedChallenge = await redis.get(`passkey:login:challenge:...`);

  // 2. Buscar passkey en DB por credentialId
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: credential.id },
    select: {
      publicKey: true,  // ← Clave pública GUARDADA PREVIAMENTE
      counter: true,
      userId: true
    }
  });

  // 3. VERIFICAR firma usando la clave pública guardada
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),  // ← Clave guardada
      counter: passkey.counter
    }
  });

  // La librería hace internamente:
  // verify(signature, challenge, publicKey)
  // Devuelve: { verified: true/false }

  if (!verification.verified) {
    throw new Error("Firma inválida");
  }

  // 4. Actualizar counter (anti-clonación)
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date()
    }
  });

  // 5. Crear sesión y tokens JWT
  const session = await createSession(passkey.userId);
  const tokens = await generateTokens(passkey.userId, session.id);

  return { user, session, tokens };
}
```

---

## 🔐 **Criptografía: ¿Qué se Firma y Cómo se Verifica?**

### **Proceso de Firma (en el iPhone)**

```typescript
// DENTRO del dispositivo (Secure Enclave)

// 1. Usuario autentica con Face ID
// 2. Sistema accede a la clave privada
const privateKey = getPrivateKeyFromSecureEnclave(credentialId);

// 3. Sistema construye los datos a firmar
const dataToSign = {
  challenge: "abc123...",           // Del backend
  origin: "https://leonobitech.com",
  rpId: "leonobitech.com",
  counter: 5                        // Incrementado
};

// 4. Sistema firma con la clave privada
const signature = crypto.sign(dataToSign, privateKey);
// signature = "xyz789..."

// 5. Sistema envía al backend:
{
  credentialId: "...",
  signature: "xyz789...",  // ← Esta firma
  clientDataJSON: JSON.stringify({ challenge, origin }),
  authenticatorData: Buffer.from([...])
}
```

### **Proceso de Verificación (en el Backend)**

```typescript
// EN EL BACKEND

// 1. Obtener la clave pública de la base de datos
const passkey = await prisma.passkey.findUnique({
  where: { credentialId: credential.id }
});

const publicKey = Buffer.from(passkey.publicKey, 'base64url');
// publicKey guardada durante el REGISTRO

// 2. Reconstruir los datos que fueron firmados
const dataToVerify = {
  challenge: storedChallenge,
  origin: "https://leonobitech.com",
  rpId: "leonobitech.com",
  counter: credential.counter
};

// 3. Verificar firma usando criptografía asimétrica
const isValid = crypto.verify(
  dataToVerify,           // Datos originales
  credential.signature,   // Firma recibida
  publicKey              // Clave pública guardada
);

// Si isValid === true → El usuario es quien dice ser ✓
// Si isValid === false → Alguien intentó falsificar la firma ✗
```

---

## ⚠️ **Errores Comunes de Concepto**

### ❌ **Error 1: "El backend compara public keys"**
```typescript
// INCORRECTO
if (receivedPublicKey === storedPublicKey) { ... }
```

**✅ Correcto:**
```typescript
// El backend VERIFICA la firma con la public key guardada
const isValid = crypto.verify(signature, challenge, storedPublicKey);
```

---

### ❌ **Error 2: "Se envía la public key en el login"**
```typescript
// INCORRECTO
const credential = {
  publicKey: "...",  // ❌ Nunca se envía
  signature: "..."
};
```

**✅ Correcto:**
```typescript
const credential = {
  credentialId: "abc123",  // ✅ ID para buscar la public key en DB
  signature: "xyz789"      // ✅ Firma del challenge
};
```

---

### ❌ **Error 3: "El backend guarda la public key en el login"**
```typescript
// INCORRECTO (esto es REGISTRO, no LOGIN)
await prisma.passkey.create({
  publicKey: credential.publicKey  // ❌
});
```

**✅ Correcto:**
```typescript
// LOGIN: Solo LEER la public key guardada
const passkey = await prisma.passkey.findUnique({
  where: { credentialId: credential.id },
  select: { publicKey: true }  // ✅ Leer, no escribir
});
```

---

## 📊 **Tabla Comparativa: REGISTRO vs LOGIN**

| Aspecto | REGISTRO | LOGIN |
|---------|----------|-------|
| **Public Key** | Se CREA y se GUARDA en DB | Se LEE de DB (ya existe) |
| **Private Key** | Se CREA y NUNCA sale del dispositivo | Se USA para firmar |
| **Challenge** | Se verifica durante registro | Se verifica durante login |
| **Resultado** | Passkey guardado en DB | Sesión creada |

---

## 🎯 **Resumen: ¿Qué Hace la Implementación Actual?**

### ✅ **CORRECTO en el código actual:**

1. **Login NO guarda public key nueva**
   ```typescript
   // En verifyPasskeyAuthentication
   const passkey = await prisma.passkey.findUnique({ ... });  // ✅ BUSCA
   // NO hace: prisma.passkey.create()  ✅
   ```

2. **Usa public key guardada para verificar**
   ```typescript
   const verification = await verifyAuthenticationResponse({
     credential: {
       publicKey: Buffer.from(passkey.publicKey, 'base64url')  // ✅ De DB
     }
   });
   ```

3. **Solo actualiza counter**
   ```typescript
   await prisma.passkey.update({
     data: { counter: newCounter }  // ✅ Solo counter
   });
   ```

---

## 🔍 **Conclusión: ¿Tu Flujo es Correcto?**

### Tu descripción tenía **2 errores conceptuales:**

1. ❌ **"El challenge regresa firmado con una public key"**
   - ✅ **Correcto:** El challenge regresa firmado con la **clave privada**

2. ❌ **"El backend guarda la public key al login"**
   - ✅ **Correcto:** La public key **ya está guardada** (del registro). El backend solo la **usa para verificar**.

---

## 📚 **Flujo Completo Resumido**

```
REGISTRO (Primera vez):
1. Usuario crea passkey → Dispositivo genera claves
2. Dispositivo envía PUBLIC KEY → Backend GUARDA en DB

LOGIN (Veces siguientes):
1. Backend genera challenge
2. Dispositivo FIRMA challenge con PRIVATE KEY
3. Backend VERIFICA firma con PUBLIC KEY (de DB)
4. Si válido → Crear sesión ✓
```

---

## 🎓 **Analogía Simple**

**REGISTRO** = Dar tu firma oficial al banco
- El banco guarda una copia de tu firma

**LOGIN** = Firmar un cheque
- El banco COMPARA tu firma en el cheque con la que tiene guardada
- NO guarda una firma nueva cada vez

---

¿Te quedó claro ahora la diferencia? La confusión es **super común** porque el proceso es similar, pero la diferencia clave es:
- **REGISTRO**: Guardar la clave pública
- **LOGIN**: Usar la clave pública guardada para verificar

La implementación actual **SÍ está correcta** según el estándar WebAuthn. 🎯
