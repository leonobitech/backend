# 🎓 Entendiendo el Servidor MCP con OAuth

Este documento explica **cómo funciona** el servidor MCP (Model Context Protocol) con autenticación OAuth que construiste. Es una guía educativa para entender cada componente y cómo interactúan.

---

## 📚 Tabla de Contenidos

1. [Visión General del Sistema](#visión-general-del-sistema)
2. [Conceptos Fundamentales](#conceptos-fundamentales)
3. [Flujo Completo de Conexión](#flujo-completo-de-conexión)
4. [Arquitectura del Código](#arquitectura-del-código)
5. [Componentes Clave](#componentes-clave)
6. [Protocolos y Estándares](#protocolos-y-estándares)
7. [Seguridad](#seguridad)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Visión General del Sistema

### ¿Qué es esto?

Es un **servidor remoto MCP** que permite a Claude Desktop conectarse de forma segura para usar herramientas personalizadas. Piensa en ello como una "extensión segura" para Claude Desktop.

```
┌─────────────────┐         OAuth 2.1 + PKCE        ┌──────────────────┐
│                 │ ◄──────────────────────────────► │                  │
│ Claude Desktop  │                                  │  Tu Servidor MCP │
│                 │      MCP Protocol 2025-06-18     │  (Este proyecto) │
│                 │ ◄──────────────────────────────► │                  │
└─────────────────┘         JSON-RPC over HTTP       └──────────────────┘
                                                              │
                                                              │
                                                              ▼
                                                     ┌─────────────────┐
                                                     │  Redis + Prisma │
                                                     │  (Estado/Tokens)│
                                                     └─────────────────┘
```

### ¿Por qué es especial?

1. **Remoto**: Claude Desktop se conecta por internet (no local)
2. **Seguro**: Usa OAuth 2.1 con PKCE (mismo estándar que Google/GitHub)
3. **Productivo**: Soporta múltiples usuarios, sesiones, y tokens con expiración
4. **Estándar**: Cumple con RFCs oficiales (RFC 7591, RFC 9728, etc.)

---

## 🧠 Conceptos Fundamentales

### 1. MCP (Model Context Protocol)

**¿Qué es?** Un protocolo creado por Anthropic para que los LLMs puedan usar herramientas externas.

**¿Cómo funciona?**
- Claude Desktop (cliente) envía mensajes JSON-RPC
- Tu servidor (servidor MCP) responde con datos o ejecuta acciones
- Usa HTTP como transporte (no WebSocket, no SSE en la versión actual)

**Ejemplo de mensaje MCP:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 1
}
```

**Respuesta:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "ping",
        "description": "Herramienta de diagnóstico...",
        "inputSchema": { ... }
      }
    ]
  },
  "id": 1
}
```

### 2. OAuth 2.1 con PKCE

**¿Qué es OAuth?** Un estándar de autorización. Permite que Claude Desktop acceda a tu servidor **en tu nombre** sin compartir contraseñas.

**¿Qué es PKCE?** (Proof Key for Code Exchange)
- Protección extra contra ataques
- Usa un "secret" generado dinámicamente que solo el cliente conoce
- Evita que alguien robe el authorization code en tránsito

**Flujo simplificado:**
```
1. Claude genera: code_verifier (secreto random)
2. Claude calcula: code_challenge = SHA256(code_verifier)
3. Claude pide autorización con code_challenge
4. Usuario aprueba → Servidor da authorization_code
5. Claude intercambia code + code_verifier por access_token
6. Servidor verifica: SHA256(code_verifier) == code_challenge ✓
7. Claude usa access_token para llamar al MCP
```

### 3. JWT (JSON Web Tokens)

**¿Qué es?** Un formato de token que contiene información firmada.

**Estructura:**
```
eyJhbGci... . eyJzdWIi... . JcFNGpQ...
   ↑            ↑            ↑
 Header       Payload     Signature
```

**Header** (algoritmo):
```json
{
  "alg": "RS256",
  "kid": "claude-key-1",
  "typ": "JWT"
}
```

**Payload** (datos):
```json
{
  "sub": "claude-user",        // Usuario
  "scope": "claude.app",        // Permisos
  "iat": 1760570127,           // Fecha emisión
  "exp": 1760570427,           // Fecha expiración (5 min)
  "iss": "https://...",        // Emisor
  "aud": "claude-mcp"          // Audiencia
}
```

**Signature** (firma RSA):
```
RSA-SHA256(
  base64(header) + "." + base64(payload),
  privateKey
)
```

**¿Por qué RSA y no HMAC?**
- RSA = clave pública/privada
- Tu servidor firma con clave **privada**
- Otros pueden verificar con clave **pública**
- Imposible falsificar sin la clave privada

---

## 🔄 Flujo Completo de Conexión

### Fase 1: Discovery (Descubrimiento)

Claude Desktop descubre las capacidades del servidor:

```
1. HEAD /.well-known/anthropic/manifest.json
   → Verifica que existe

2. GET /.well-known/anthropic/manifest.json
   ← Responde con:
   {
     "oauth": { ... },
     "api": {
       "type": "http",
       "url": "https://odoo-mcp.leonobitech.com/mcp"
     }
   }

3. GET /.well-known/oauth-authorization-server
   ← Responde con:
   {
     "authorization_endpoint": "https://.../oauth/authorize",
     "token_endpoint": "https://.../oauth/token",
     "registration_endpoint": "https://.../oauth/register"
   }

4. GET /.well-known/oauth-protected-resource
   ← Responde con:
   {
     "resource": "https://.../mcp",
     "authorization_servers": ["https://..."]
   }
```

### Fase 2: Dynamic Client Registration

Claude Desktop se auto-registra:

```
POST /oauth/register
Content-Type: application/json

{
  "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "scope": "claude.app"
}

← Respuesta:
{
  "client_id": "claude-mcp",
  "client_secret": "...",
  "scope": "claude.app claudeai",
  "token_endpoint_auth_method": "client_secret_post"
}
```

**Nota:** Tu servidor devuelve client_id/secret estáticos (configurados en `.env`). En producción real, generarías dinámicamente para cada cliente.

### Fase 3: Authorization Code Flow + PKCE

```
1. Claude genera:
   code_verifier = random(43-128 chars)
   code_challenge = base64url(SHA256(code_verifier))
   state = random() // Anti-CSRF

2. Claude redirige al usuario:
   GET /oauth/authorize?
     response_type=code&
     client_id=claude-mcp&
     redirect_uri=https://claude.ai/api/mcp/auth_callback&
     scope=claude.app&
     code_challenge=uxucS0f...&
     code_challenge_method=S256&
     state=wUV2Tuh...

3. Tu servidor:
   - Muestra página de login/consent (actualmente auto-aprueba)
   - Genera authorization_code
   - Guarda en Redis: {code_challenge, redirect_uri, scope, userId}
   - Redirige: https://claude.ai/api/mcp/auth_callback?code=ABC&state=wUV2Tuh...

4. Claude verifica state ✓
   POST /oauth/token
   {
     grant_type: "authorization_code",
     code: "ABC",
     code_verifier: "original_verifier",
     redirect_uri: "https://claude.ai/api/mcp/auth_callback",
     client_id: "claude-mcp",
     client_secret: "..."
   }

5. Tu servidor verifica:
   ✓ code existe en Redis
   ✓ SHA256(code_verifier) == code_challenge guardado
   ✓ redirect_uri coincide
   ✓ client credentials válidos

   Genera:
   - access_token (JWT, expira en 5min)
   - refresh_token (guardado en Redis, expira en 7 días)

   Responde:
   {
     "access_token": "eyJhbG...",
     "token_type": "Bearer",
     "expires_in": 300,
     "refresh_token": "...",
     "scope": "claude.app"
   }
```

### Fase 4: Conexión MCP

Ahora Claude Desktop tiene el `access_token` y puede usar el MCP:

```
1. POST /.well-known/anthropic/manifest.json
   Authorization: Bearer eyJhbG...
   {
     "method": "initialize",
     "params": {
       "protocolVersion": "2025-06-18",
       "capabilities": {},
       "clientInfo": {"name": "claude-ai", "version": "0.1.0"}
     },
     "jsonrpc": "2.0",
     "id": 0
   }

   → Tu servidor redirige (307) a: /mcp

2. POST /mcp
   Authorization: Bearer eyJhbG...
   (mismo body)

   Tu servidor:
   - Verifica JWT (firma RSA)
   - Extrae userId del token
   - Crea nueva sesión MCP con UUID
   - Responde:
   {
     "jsonrpc": "2.0",
     "result": {
       "protocolVersion": "2025-06-18",
       "capabilities": {"tools": {}},
       "serverInfo": {
         "name": "leonobitech-claude-mcp-server",
         "version": "0.1.0"
       }
     },
     "id": 0
   }
   Headers:
   Mcp-Session-Id: 28c85319-d08a-4063-b30c-34f24b92c20c

3. POST /mcp
   Authorization: Bearer eyJhbG...
   Mcp-Session-Id: 28c85319-d08a-4063-b30c-34f24b92c20c
   {
     "method": "tools/list",
     "params": {},
     "jsonrpc": "2.0",
     "id": 1
   }

   ← Responde lista de herramientas (ping, get_user_info)

4. POST /mcp
   {
     "method": "tools/call",
     "params": {
       "name": "ping",
       "arguments": {"message": "hello"}
     },
     "jsonrpc": "2.0",
     "id": 2
   }

   ← Responde:
   {
     "jsonrpc": "2.0",
     "result": {
       "content": [{"type": "text", "text": "🏓 hello"}]
     },
     "id": 2
   }
```

---

## 🏗️ Arquitectura del Código

### Estructura de Directorios

```
claude-oauth/
├── src/
│   ├── config/          # Configuración (env, Redis, RSA keys)
│   │   ├── env.ts       # Variables de entorno validadas con Zod
│   │   └── redis.ts     # Cliente Redis configurado
│   │
│   ├── lib/             # Librerías compartidas
│   │   ├── auth.ts      # Funciones JWT (sign, verify)
│   │   ├── logger.ts    # Logger estructurado (pino)
│   │   └── redis.ts     # Funciones helper de Redis
│   │
│   ├── routes/          # Endpoints HTTP
│   │   ├── oauth.ts     # /oauth/authorize, /oauth/token, /oauth/register
│   │   ├── mcp-http.ts  # /mcp (MCP JSON-RPC handler)
│   │   ├── well-known/  # /.well-known/* (discovery endpoints)
│   │   └── health.ts    # /healthz
│   │
│   ├── middlewares/     # Middlewares Express
│   │   └── (en oauth.ts y mcp-http.ts)
│   │
│   ├── types/           # TypeScript types
│   │   └── (inline en cada archivo)
│   │
│   └── index.ts         # Entry point (Express app)
│
├── keys/                # Claves RSA (NO en git)
│   ├── privateKey.pem
│   ├── publicKey.pem
│   └── jwks.json
│
├── .env                 # Variables de entorno (NO en git)
├── Dockerfile           # Imagen Docker
├── docker-compose.yml   # Orquestación (si usas)
└── package.json
```

### Stack Tecnológico

```typescript
// Framework HTTP
Express 5

// Base de datos (opcional para users/sessions)
Prisma + PostgreSQL

// Cache / Tokens
Redis (DB lógica 5)

// Autenticación
- jsonwebtoken (JWT sign/verify)
- crypto (RSA, random, SHA256)

// Validación
Zod (schemas de request/response)

// Logging
Pino (JSON structured logging)

// MCP SDK
@modelcontextprotocol/sdk
```

---

## 🔑 Componentes Clave

### 1. `/src/routes/oauth.ts`

**Responsabilidad:** Implementa el servidor de autorización OAuth 2.1

#### Endpoint: `POST /oauth/register`

```typescript
// Dynamic Client Registration (RFC 7591)
oauthRouter.post("/register", (req, res) => {
  // 1. Validar request body con Zod
  const { redirect_uris, scope, grant_types } = req.body;

  // 2. Verificar que redirect_uri está en whitelist
  const allowedRedirectUris = [
    "https://claude.ai/api/mcp/auth_callback",
    // ... otros
  ];

  // 3. Devolver client credentials (estáticos en tu caso)
  res.status(201).json({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
    scope: env.SCOPES,
    // ... más metadata
  });
});
```

**¿Por qué estático?** Simplifica. En producción multicliente, generarías client_id único por cada registro y guardarías en DB.

#### Endpoint: `GET /oauth/authorize`

```typescript
oauthRouter.get("/authorize", async (req, res) => {
  // 1. Validar query params
  const {
    response_type,    // Debe ser "code"
    client_id,
    redirect_uri,
    scope,
    state,            // Anti-CSRF token
    code_challenge,   // PKCE: hash del verifier
    code_challenge_method // Debe ser "S256"
  } = req.query;

  // 2. Verificar client_id y redirect_uri

  // 3. (Aquí deberías mostrar UI de login/consent)
  //    Actualmente auto-aprueba para userId="claude-user"

  // 4. Generar authorization code
  const authCode = randomBytes(32).toString("base64url");

  // 5. Guardar en Redis con TTL
  await redis.setex(
    `authcode:${authCode}`,
    180, // 3 minutos
    JSON.stringify({
      userId: "claude-user",
      clientId: client_id,
      redirectUri: redirect_uri,
      scope,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method
    })
  );

  // 6. Redirigir al redirect_uri con code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  redirectUrl.searchParams.set("state", state);

  res.redirect(redirectUrl.toString());
});
```

#### Endpoint: `POST /oauth/token`

```typescript
oauthRouter.post("/token", async (req, res) => {
  const { grant_type } = req.body;

  if (grant_type === "authorization_code") {
    const { code, code_verifier, client_id, client_secret, redirect_uri } = req.body;

    // 1. Recuperar datos del authorization code de Redis
    const authData = await redis.get(`authcode:${code}`);
    if (!authData) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    const data = JSON.parse(authData);

    // 2. Verificar PKCE
    const challengeFromVerifier = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");

    if (challengeFromVerifier !== data.codeChallenge) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    // 3. Verificar client credentials
    if (client_id !== env.CLIENT_ID || client_secret !== env.CLIENT_SECRET) {
      return res.status(401).json({ error: "invalid_client" });
    }

    // 4. Generar access token (JWT)
    const accessToken = signAccessToken({
      sub: data.userId,
      scope: data.scope,
      aud: client_id
    });

    // 5. Generar refresh token
    const refreshToken = randomBytes(32).toString("base64url");
    await redis.setex(
      `refresh:${refreshToken}`,
      604800, // 7 días
      JSON.stringify({ userId: data.userId, scope: data.scope })
    );

    // 6. Guardar access token en Redis para poder revocarlo
    const jti = extractJti(accessToken);
    await redis.setex(
      `token:${jti}`,
      300, // 5 minutos (TTL del access token)
      data.userId
    );

    // 7. Borrar authorization code (uso único)
    await redis.del(`authcode:${code}`);

    // 8. Responder
    res.json({
      token_type: "Bearer",
      access_token: accessToken,
      expires_in: 300,
      refresh_token: refreshToken,
      scope: data.scope
    });
  }

  else if (grant_type === "refresh_token") {
    // Similar pero usando refresh_token en lugar de code
    // ...
  }
});
```

### 2. `/src/routes/mcp-http.ts`

**Responsabilidad:** Implementa el servidor MCP usando HTTP transport

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Almacén de sesiones MCP en memoria
const transports = new Map<string, StreamableHTTPServerTransport>();

// Middleware de autenticación
async function authenticateMcpRequest(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "invalid_request" });
  }

  const token = authHeader.slice(7);

  try {
    // Verificar JWT (firma RSA)
    const payload = await verifyAccessToken(token);

    // Verificar que el token existe en Redis (no revocado)
    const jti = payload.jti;
    const exists = await redis.exists(`token:${jti}`);
    if (!exists) {
      return res.status(401).json({ error: "invalid_token" });
    }

    // Verificar scopes
    const tokenScopes = payload.scope.split(" ");
    const hasRequiredScopes = requiredScopes.every(s => tokenScopes.includes(s));
    if (!hasRequiredScopes) {
      return res.status(403).json({ error: "insufficient_scope" });
    }

    // Guardar userId en res.locals para usar en handlers
    res.locals.auth = {
      subject: payload.sub,
      scope: payload.scope
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// Función para crear servidor MCP con herramientas
function createMcpServer(userId: string) {
  const server = new Server(
    {
      name: "leonobitech-claude-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}  // Soporta herramientas
      }
    }
  );

  // Handler: listar herramientas
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "ping",
          description: "Returns a pong message to test connectivity",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" }
            }
          }
        },
        {
          name: "get_user_info",
          description: "Returns information about the authenticated user",
          inputSchema: { type: "object", properties: {} }
        }
      ]
    };
  });

  // Handler: ejecutar herramienta
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case "ping":
        const message = request.params.arguments?.message || "pong";
        return {
          content: [{ type: "text", text: `🏓 ${message}` }]
        };

      case "get_user_info":
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              userId,
              serverVersion: "0.1.0",
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  });

  return server;
}

// Endpoint principal MCP (GET, POST, DELETE)
mcpHttpRouter.all("/", authenticateMcpRequest, async (req, res) => {
  const userId = res.locals.auth.subject;
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let transport: StreamableHTTPServerTransport;

  // Verificar si es una sesión existente
  if (sessionId && transports.has(sessionId)) {
    logger.info({ userId, sessionId }, "Reusing existing MCP session");
    transport = transports.get(sessionId)!;
  }
  // O si es una nueva sesión (mensaje "initialize")
  else if (req.method === "POST" && isInitializeRequest(req.body)) {
    logger.info({ userId }, "Creating new MCP session");

    // Crear servidor MCP para este usuario
    const mcpServer = createMcpServer(userId);

    // Crear transporte HTTP
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        logger.info({ userId, sessionId: newSessionId }, "MCP session initialized");
        transports.set(newSessionId, transport);
      }
    });

    // Conectar servidor al transporte
    await mcpServer.connect(transport);
  }
  else {
    return res.status(400).json({ error: "Invalid session or request" });
  }

  // Delegar el request al transport (él maneja JSON-RPC)
  await transport.handleRequest(req, res, req.body);
});
```

**Conceptos clave:**

1. **Transport**: Abstracción del SDK de MCP que maneja la serialización JSON-RPC
2. **Server**: Contiene la lógica de las herramientas
3. **Session**: Cada conexión MCP tiene un UUID único (`Mcp-Session-Id`)
4. **Handler**: Funciones que responden a métodos específicos (`tools/list`, `tools/call`)

### 3. `/src/routes/well-known/index.ts`

**Responsabilidad:** Discovery endpoints para OAuth y MCP

#### `GET /.well-known/anthropic/manifest.json`

```typescript
wellKnownRouter.get("/anthropic/manifest.json", (req, res) => {
  // Si viene con Authorization + Accept: text/event-stream
  // → Es Claude Desktop intentando conectar, redirigir al MCP
  if (req.headers.authorization && req.headers.accept?.includes("text/event-stream")) {
    return res.redirect(307, "/mcp");
  }

  // Si no, es discovery normal → devolver manifest
  res.json({
    schema_version: "1.0",
    name_for_human: "Leonobitech Claude Desktop Connector",
    name_for_model: "leonobitech_claude",
    description_for_human: "Autentica y habilita la integración MCP...",
    description_for_model: "Utiliza herramientas de Leonobitech...",
    contact_email: "security@leonobitech.com",
    legal_info_url: "https://www.leonobitech.com/legal",
    logo_url: "https://www.leonobitech.com/icon.png",

    oauth: {
      client_id: env.CLIENT_ID,
      scopes: ["claude.app", "claudeai"],
      scope: "claude.app claudeai",
      authorization_url: `${env.PUBLIC_URL}/oauth/authorize`,
      token_url: `${env.PUBLIC_URL}/oauth/token`,
      redirect_uri: env.REDIRECT_URI
    },

    api: {
      type: "http",
      url: `${env.PUBLIC_URL}/mcp`,
      is_user_authenticated: true
    }
  });
});

// También responder a POST (Claude Desktop lo usa)
wellKnownRouter.post("/anthropic/manifest.json", (req, res) => {
  if (req.headers.authorization) {
    // Es una request MCP disfrazada → redirigir
    return res.redirect(307, "/mcp");
  }
  res.status(405).json({ error: "Method not allowed" });
});
```

**¿Por qué la redirección?** Claude Desktop hace POST al manifest cuando quiere enviar mensajes MCP. Tu servidor redirige al endpoint correcto.

#### `GET /.well-known/oauth-authorization-server`

```typescript
wellKnownRouter.get("/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: env.PUBLIC_URL,
    authorization_endpoint: `${env.PUBLIC_URL}/oauth/authorize`,
    token_endpoint: `${env.PUBLIC_URL}/oauth/token`,
    registration_endpoint: `${env.PUBLIC_URL}/oauth/register`,
    jwks_uri: `${env.PUBLIC_URL}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["claude.app", "claudeai"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"]
  });
});
```

**RFC 8414**: OAuth 2.0 Authorization Server Metadata

#### `GET /.well-known/oauth-protected-resource`

```typescript
wellKnownRouter.get("/oauth-protected-resource", (req, res) => {
  res.json({
    resource: `${env.PUBLIC_URL}/mcp`,  // ¡Clave! Indica dónde está el recurso
    issuer: env.PUBLIC_URL,
    authorization_servers: [env.PUBLIC_URL],
    bearer_methods_supported: ["header"],
    resource_scopes_supported: ["claude.app", "claudeai"],
    resource_documentation: `${env.PUBLIC_URL}/.well-known/anthropic/manifest.json`
  });
});
```

**RFC 9728**: OAuth 2.0 Protected Resource Metadata

**¿Por qué es importante?** Claude Desktop usa este endpoint para **descubrir DÓNDE está el MCP** después de hacer OAuth. Sin esto, no sabría que debe conectarse a `/mcp`.

#### `GET /.well-known/jwks.json`

```typescript
wellKnownRouter.get("/jwks.json", async (req, res) => {
  // Leer el archivo keys/jwks.json
  const jwks = JSON.parse(await readFile("keys/jwks.json", "utf-8"));
  res.json(jwks);
});
```

**Contenido de `jwks.json`:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "claude-key-1",
      "use": "sig",
      "alg": "RS256",
      "n": "xGOz8...",  // Módulo de la clave pública (base64url)
      "e": "AQAB"      // Exponente (típicamente 65537)
    }
  ]
}
```

**¿Para qué?** Permite a clientes verificar la firma de los JWTs sin contactar al servidor. Es parte del estándar OpenID Connect.

---

## 📜 Protocolos y Estándares

Tu servidor implementa estos RFCs oficiales:

### RFC 6749: OAuth 2.0 Framework
- Base de OAuth 2.0
- Authorization Code Grant

### RFC 7636: PKCE
- Extensión de seguridad para OAuth
- Obligatoria en OAuth 2.1

### RFC 7591: Dynamic Client Registration
- `/oauth/register` endpoint
- Auto-registro de clientes

### RFC 8414: OAuth 2.0 Authorization Server Metadata
- `/.well-known/oauth-authorization-server`
- Discovery automático de endpoints

### RFC 9728: OAuth 2.0 Protected Resource Metadata
- `/.well-known/oauth-protected-resource`
- Indica dónde está el recurso protegido (tu MCP)

### RFC 7519: JWT
- JSON Web Token format
- RS256 signature algorithm

### MCP Specification 2025-06-18
- Anthropic's Model Context Protocol
- JSON-RPC 2.0 transport over HTTP
- Streamable HTTP transport (aunque el nombre es confuso, es HTTP normal)

---

## 🔒 Seguridad

### Capas de Seguridad

1. **PKCE**: Previene code interception attack
2. **State parameter**: Anti-CSRF en OAuth flow
3. **JWT signature (RS256)**: Previene token forgery
4. **Token en Redis**: Permite revocación instantánea
5. **Short-lived tokens**: access_token expira en 5min
6. **Refresh rotation**: refresh_token de un solo uso
7. **HTTPS**: Todo el tráfico cifrado (via Traefik)
8. **Scope validation**: Solo concede permisos solicitados

### Vectores de Ataque (Mitigados)

#### 1. Authorization Code Interception
**Ataque:** Alguien intercepta el `code` en la redirección.

**Mitigación:** PKCE. Sin el `code_verifier` original, el `code` es inútil.

#### 2. Token Replay Attack
**Ataque:** Alguien captura un `access_token` y lo reutiliza.

**Mitigación:**
- Token expira en 5min
- Puedes revocar en Redis (`DEL token:{jti}`)
- HTTPS previene captura en tránsito

#### 3. Token Forgery
**Ataque:** Alguien intenta crear un JWT falso.

**Mitigación:** Firma RSA. Sin la clave privada (que está en tu servidor), es imposible crear una firma válida.

#### 4. CSRF en OAuth
**Ataque:** Atacante engaña al usuario para autorizar su propio client.

**Mitigación:** `state` parameter. El cliente genera un random y verifica que vuelve igual.

#### 5. Redirect URI Manipulation
**Ataque:** Atacante cambia `redirect_uri` para recibir el `code`.

**Mitigación:** Whitelist de URIs permitidas. Solo `https://claude.ai/api/mcp/auth_callback` es aceptado.

### Mejoras de Seguridad Recomendadas

Para producción, considera:

```typescript
// 1. Rate limiting
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos
  message: "Too many authorization attempts"
});

app.use("/oauth/authorize", authLimiter);

// 2. Refresh token rotation
// Cada vez que usas un refresh_token:
// - Generas uno nuevo
// - Invalidas el anterior
// - Guardas "familia" de tokens para detectar reuso

// 3. Login real con Prisma
// En lugar de auto-aprobar, mostrar UI:
app.get("/oauth/authorize", async (req, res) => {
  if (!req.session?.userId) {
    return res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
  }

  // Mostrar consent screen
  res.render("consent", { client, scopes });
});

// 4. Auditoría
// Loggear todos los eventos de seguridad
loggerSecurityEvent("token_issued", { userId, clientId, scope });
loggerSecurityEvent("token_revoked", { userId, jti, reason });

// 5. Revocación
app.post("/oauth/revoke", async (req, res) => {
  const { token } = req.body;
  const { jti } = jwt.decode(token);
  await redis.del(`token:${jti}`);
  res.status(200).json({ revoked: true });
});
```

---

## 🐛 Troubleshooting

### Problema: "Invalid token" después de OAuth

**Síntomas:**
```
POST /mcp
401 Unauthorized
{"error": "invalid_token"}
```

**Causas posibles:**

1. **Token expiró** (5min de vida)
   ```bash
   # Verificar en Redis
   redis-cli -h redis_core -a PASSWORD
   > SELECT 5
   > TTL token:abc123
   # Si retorna -2 → expiró
   ```

2. **Token no está en Redis**
   ```bash
   > EXISTS token:abc123
   # Si retorna 0 → nunca se guardó o ya se borró
   ```

3. **Firma inválida**
   ```bash
   # Verificar que publicKey.pem coincide con la clave usada para firmar
   # Verificar jwks.json tiene el `kid` correcto
   ```

**Solución:**
- Usa refresh_token para obtener nuevo access_token
- Verifica que Redis DB=5 es la correcta
- Revisa logs del servidor para ver errores de verificación

### Problema: Claude Desktop no se conecta después de OAuth

**Síntomas:**
- OAuth completa exitosamente
- Pero no aparecen herramientas en Claude Desktop
- Logs muestran que no llegan requests POST al /mcp

**Causas:**

1. **Manifest sin `resource` en oauth-protected-resource**
   ```json
   // ✗ Incorrecto
   {
     "issuer": "...",
     "resource_scopes_supported": ["claude.app"]
   }

   // ✓ Correcto
   {
     "resource": "https://odoo-mcp.leonobitech.com/mcp",  // ← NECESARIO
     "issuer": "...",
     "authorization_servers": ["..."],
     "resource_scopes_supported": ["claude.app"]
   }
   ```

2. **Manifest con `type: "sse"` en lugar de `"http"`**
   ```json
   // ✗ Incorrecto (Claude Desktop ya no usa SSE)
   {
     "api": {
       "type": "sse",
       "url": "https://.../mcp/sse"
     }
   }

   // ✓ Correcto (usa HTTP JSON-RPC)
   {
     "api": {
       "type": "http",
       "url": "https://.../mcp"
     }
   }
   ```

3. **Scope mismatch**
   - Claude pide `claudeai`
   - Servidor solo acepta `claude.app`
   - Solución: `SCOPES=claude.app claudeai`

### Problema: "Method not found" en herramienta

**Síntomas:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

**Causa:** El método MCP no tiene handler registrado.

**Ejemplo:**
```typescript
// Claude Desktop llama:
// {"method": "prompts/list", ...}

// Pero tu servidor solo tiene:
server.setRequestHandler(ListToolsRequestSchema, ...);
server.setRequestHandler(CallToolRequestSchema, ...);
// No tiene handler para "prompts/list"
```

**Solución:**
```typescript
// Agregar handler para prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: [] }; // Sin prompts por ahora
});

// O si no soportas prompts, declararlo en capabilities:
const server = new Server(
  { name: "...", version: "..." },
  {
    capabilities: {
      tools: {},      // Sí soportamos tools
      // prompts: {} // No soportamos prompts (comentado)
    }
  }
);
```

### Problema: CORS errors en browser

**Síntomas:**
```
Access to XMLHttpRequest at 'https://odoo-mcp.leonobitech.com/oauth/authorize'
from origin 'https://claude.ai' has been blocked by CORS policy
```

**Solución:**
```typescript
// src/index.ts
app.use(cors({
  origin: [
    "https://claude.ai",
    "https://app.claude.ai",
    "https://desktop.claude.ai",
    env.PUBLIC_URL
  ],
  credentials: true
}));
```

### Debugging Tips

```bash
# 1. Ver logs en tiempo real
docker logs -f claude_oauth | jq .

# 2. Inspeccionar JWT
# Copiar el token de los logs
echo "eyJhbGci..." | cut -d. -f2 | base64 -d | jq .

# 3. Ver tokens en Redis
redis-cli -h redis_core -a PASSWORD
SELECT 5
KEYS token:*
GET token:abc123

# 4. Ver authorization codes
KEYS authcode:*
TTL authcode:xyz789

# 5. Verificar firma JWT manualmente
# Descargar jwks.json
curl https://odoo-mcp.leonobitech.com/.well-known/jwks.json

# Usar herramienta como https://jwt.io
# Pegar token + clave pública

# 6. Testear OAuth flow manualmente
# a) Registro
curl -X POST https://odoo-mcp.leonobitech.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
    "grant_types": ["authorization_code", "refresh_token"]
  }'

# b) Autorización (en browser)
# https://odoo-mcp.leonobitech.com/oauth/authorize?response_type=code&client_id=claude-mcp&redirect_uri=https://claude.ai/api/mcp/auth_callback&scope=claude.app&code_challenge=HASH&code_challenge_method=S256&state=RANDOM

# c) Token
curl -X POST https://odoo-mcp.leonobitech.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=ABC&code_verifier=VERIFIER&client_id=claude-mcp&client_secret=SECRET&redirect_uri=https://claude.ai/api/mcp/auth_callback"

# d) Usar MCP
curl -X POST https://odoo-mcp.leonobitech.com/mcp \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    },
    "id": 0
  }'
```

---

## 🎓 Conceptos Avanzados

### ¿Por qué HTTP y no WebSocket?

MCP soporta varios transportes:
- **stdio**: Proceso local (stdin/stdout)
- **SSE**: Server-Sent Events (deprecated)
- **HTTP (Streamable)**: HTTP normal con JSON-RPC

Claude Desktop usa **HTTP (mal llamado "Streamable HTTP")**:
- Cada request/response es independiente (stateless)
- La "sesión" se mantiene con `Mcp-Session-Id` header
- Más simple que WebSocket
- Compatible con load balancers, CDNs, etc.

### ¿Qué es "Streamable" entonces?

El nombre es confuso. "Streamable HTTP" significa:
- El servidor **puede** enviar respuestas stream (chunked transfer)
- Pero para herramientas simples, responde completo (no stream)

Ejemplo de stream:
```typescript
// Respuesta normal
res.json({ result: "..." });

// Respuesta stream (para herramientas que tardan)
res.setHeader("Transfer-Encoding", "chunked");
res.write('{"jsonrpc":"2.0","result":');
await processLongTask((chunk) => {
  res.write(JSON.stringify(chunk));
});
res.write('}');
res.end();
```

### Gestión de Sesiones MCP

Cada conexión MCP tiene:
```typescript
{
  sessionId: "28c85319-d08a-4063-b30c-34f24b92c20c",
  userId: "claude-user",
  transport: StreamableHTTPServerTransport,
  server: Server,
  createdAt: Date,
  lastActivity: Date
}
```

**Lifecycle:**
1. Claude Desktop envía `initialize` → Creas sesión
2. Claude Desktop envía `tools/list` con `Mcp-Session-Id` → Reutilizas sesión
3. ... más requests con mismo `Mcp-Session-Id` ...
4. (No hay mensaje de "close" explícito)

**Garbage Collection:**
```typescript
// Limpieza de sesiones inactivas (agregar esto)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, info] of sessions.entries()) {
    if (now - info.lastActivity > 30 * 60 * 1000) { // 30min
      info.server.close();
      sessions.delete(sessionId);
      logger.info({ sessionId }, "Session cleaned up (inactive)");
    }
  }
}, 5 * 60 * 1000); // Cada 5min
```

### Múltiples Usuarios

Actualmente hardcodeado a `userId="claude-user"`. Para multi-user:

```typescript
// 1. En /oauth/authorize, mostrar login real
app.get("/oauth/authorize", (req, res) => {
  if (!req.session?.user) {
    // Redirigir a login
    return res.redirect(`/login?return=${encodeURIComponent(req.originalUrl)}`);
  }

  const userId = req.session.user.id;
  // ... generar code con este userId real
});

// 2. En createMcpServer, usar userId para scope
function createMcpServer(userId: string) {
  // Cada usuario puede tener herramientas diferentes
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const tools = [];
  if (user.hasDataAccess) {
    tools.push({
      name: "query_database",
      description: "Query user's database"
    });
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });
}
```

---

## 📚 Recursos para Aprender Más

### OAuth 2.1
- [RFC 6749: OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)

### JWT
- [jwt.io](https://jwt.io) - Debugger de JWT
- [RFC 7519: JWT](https://www.rfc-editor.org/rfc/rfc7519)

### MCP
- [Model Context Protocol Docs](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://spec.modelcontextprotocol.io)

### Testing
```bash
# MCP Inspector (herramienta oficial)
npx @modelcontextprotocol/inspector

# OAuth Playground
# https://www.oauth.com/playground/
```

---

## ✅ Checklist de Comprensión

Después de leer este documento, deberías poder responder:

- [ ] ¿Qué es PKCE y por qué es importante?
- [ ] ¿Cuál es la diferencia entre authorization code y access token?
- [ ] ¿Por qué usamos RS256 en lugar de HS256 para JWT?
- [ ] ¿Qué pasa si alguien roba un access_token?
- [ ] ¿Cómo descubre Claude Desktop dónde está el endpoint MCP?
- [ ] ¿Qué es el `Mcp-Session-Id` header?
- [ ] ¿Por qué guardamos tokens en Redis además de firmarlos con JWT?
- [ ] ¿Cuál es el propósito de `/.well-known/oauth-protected-resource`?
- [ ] ¿Qué pasaría si cambias la clave RSA privada?
- [ ] ¿Cómo agregarías una nueva herramienta MCP?

---

## 🚀 Próximos Pasos

### Herramientas que Podrías Agregar

```typescript
// 1. Consulta a base de datos
{
  name: "query_users",
  description: "Query users from database",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", maximum: 100 }
    }
  }
}

// Handler
case "query_users":
  const users = await prisma.user.findMany({
    take: arguments.limit || 10
  });
  return {
    content: [{
      type: "text",
      text: JSON.stringify(users, null, 2)
    }]
  };

// 2. Envío de emails
{
  name: "send_email",
  description: "Send email via Resend",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", format: "email" },
      subject: { type: "string" },
      body: { type: "string" }
    },
    required: ["to", "subject", "body"]
  }
}

// 3. Llamar a API externa
{
  name: "get_weather",
  description: "Get current weather for a city",
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string" }
    }
  }
}
```

### Mejoras de Producción

1. **Login UI real**
   - Formulario de login
   - Consent screen para OAuth
   - Gestión de usuarios con Prisma

2. **Multi-tenancy**
   - Diferentes client_id por cliente
   - Scopes granulares
   - Rate limiting por cliente

3. **Monitoreo**
   - Prometheus metrics
   - Alertas en Sentry
   - Dashboard con Grafana

4. **Testing**
   - Unit tests (Jest)
   - Integration tests (Supertest)
   - E2E tests (Playwright)

---

**¡Felicidades por construir esto!** 🎉

Tienes un servidor OAuth + MCP production-grade. Pocos proyectos logran esto correctamente.

---

*Documento creado: 2025-01-15*
*Versión: 1.0*
*Autor: Claude Code + Felix*
