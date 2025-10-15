# Leonobitech Claude OAuth & MCP Connector

Servicio Node.js/TypeScript que implementa la autenticación OAuth 2.1 y los endpoints `.well-known` necesarios para integrar un servidor MCP remoto con **Claude Desktop**. Esta guía resume la arquitectura, variables de entorno, flujo OAuth y los pasos para probar la herramienta `ping` desde Claude.

## Arquitectura general

```
Claude Desktop (cliente OAuth/MCP)
   │
   │ 1. Descubrimiento: /.well-known/**
   │ 2. Registro dinámico: POST /oauth/register
   │ 3. Authorization Code + PKCE: GET /oauth/authorize
   │ 4. Token exchange: POST /oauth/token
   │ 5. Invocaciones MCP: POST /mcp/*
   ▼
Leonobitech Claude OAuth Service (este repo)
   ├── Authorization server (OAuth 2.1)
   ├── Resource server MCP protegido
   └── Public metadata (.well-known, JWKS, manifest Anthropic)
```

- **Authorization server**: endpoints `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth-protected-resource`.
- **Resource server MCP**: rutas bajo `/mcp` protegidas mediante `Bearer <access_token>`.
- **Discovery**: documentos públicos que Claude Desktop consulta (`/.well-known/anthropic/manifest.json`, `/.well-known/openapi.json`, `/.well-known/jwks.json`, etc.).
- **Almacenamiento**: Redis para authorization codes/refresh tokens; archivos `keys/*.pem` y `jwks.json` para firmar JWT (RS256).

## Estructura del proyecto

```
src/
 ├─ index.ts            # Bootstrap Express, logging, CORS y middlewares
 ├─ routes/
 │   ├─ oauth.ts        # Flujos OAuth 2.1 (authorize, token, refresh, register)
 │   ├─ mcp.ts          # Herramientas MCP protegidas (p.ej. /mcp/ping)
 │   ├─ well-known/     # Manifests Anthropic + OpenAPI + JWKS + metadata OAuth
 │   └─ health.ts       # Health check
 ├─ lib/
 │   ├─ auth.ts         # Verificación de tokens con JWKS + jose
 │   ├─ keys.ts         # Firma de access tokens JWT
 │   ├─ store.ts        # Persistencia en Redis (codes & refresh tokens)
 │   ├─ pkce.ts         # Utilidades PKCE
 │   └─ redis.ts        # Conexión y health de Redis
 └─ scripts/
     └─ generateKeys.ts # Genera llaves RSA + JWKS
```

## Configuración de entorno

1. Copia `.env.example` a `.env` y ajusta los valores:

```env
PORT=8100
PUBLIC_URL=https://claude-auth.leonobitech.com
CLIENT_ID=claude-mcp
CLIENT_SECRET=super-secret-change-me
REDIRECT_URI=https://claude.ai/api/mcp/auth_callback
SCOPES=claude.app
JWKS_KID=claude-key-1
JWT_ISSUER=https://claude-auth.leonobitech.com
JWT_AUDIENCE=claude-mcp
REDIS_HOST=redis_core
REDIS_PORT=6379
REDIS_PASSWORD=supersecretpassword123
REDIS_DB=4
ACCESS_TOKEN_TTL=300
AUTH_CODE_TTL=180
REFRESH_TOKEN_TTL=604800
LOG_LEVEL=info
```

> Nota: verifica en la documentación más reciente de Anthropic si el `REDIRECT_URI` cambia. Claude Desktop (>= 0.8.0) utiliza `https://claude.ai/api/mcp/auth_callback`.

2. Instala dependencias y genera las llaves:

```bash
npm install
npm run generate:keys
```

3. Ejecuta el servicio:

```bash
npm run dev          # desarrollo (tsx watch)
npm run build        # compila a dist/
npm start            # modo producción (usa dist/index.mjs)
```

## Flujo OAuth 2.1 adaptado a Claude

1. **Discovery**  
   Claude Desktop consulta:
   - `/.well-known/anthropic/manifest.json`
   - `/.well-known/openapi.json`
   - `/.well-known/jwks.json`
   - `/.well-known/oauth-protected-resource`
   - `/.well-known/oauth-authorization-server`

2. **Registro dinámico** (`POST /oauth/register`)  
   Verifica `redirect_uris`, scopes y métodos de autenticación. Retorna `client_id`/`client_secret` estáticos si coincide el redirect.

3. **Authorization Code + PKCE** (`GET /oauth/authorize`)  
   Requiere `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method`.  
   En esta versión se omite la UI de login/consent y se emite un `authorization_code` para el sujeto `claude-user` o el `login_hint`.

4. **Token exchange** (`POST /oauth/token`)  
   Intercambia `code` + `code_verifier` por:
   ```json
   {
     "token_type": "Bearer",
     "access_token": "<JWT RS256>",
     "expires_in": 300,
     "refresh_token": "<uuid>",
     "scope": "claude.app"
   }
   ```
   También soporta `grant_type=refresh_token`.

5. **Invocación MCP** (`POST /mcp/ping`)  
   Protegido por middleware que valida firma, issuer/audience y que el scope incluya `claude.app`. Los errores responden con `WWW-Authenticate` apuntando a `/.well-known/oauth-protected-resource`.

## Endpoints principales

| Ruta                                           | Método | Descripción                                      | Autenticación               |
| ---------------------------------------------- | ------ | ------------------------------------------------ | --------------------------- |
| `/healthz`                                     | GET    | Health check                                     | Libre                       |
| `/.well-known/anthropic/manifest.json`         | GET    | Manifest específico para Claude Desktop          | Libre                       |
| `/.well-known/ai-plugin.json`                  | GET    | Manifest genérico MCP (fallback)                 | Libre                       |
| `/.well-known/openapi.json`                    | GET    | OpenAPI 3.0.1                                    | Libre                       |
| `/.well-known/jwks.json`                       | GET    | JWKS público RS256                               | Libre                       |
| `/.well-known/oauth-protected-resource`        | GET    | Metadata (issuer + scopes)                       | Libre                       |
| `/.well-known/oauth-authorization-server`      | GET    | Metadata OAuth server                            | Libre                       |
| `/oauth/authorize`                             | GET    | Authorization Code + PKCE                        | Redirección                 |
| `/oauth/token`                                 | POST   | Intercambio code↔token y refresh                 | `client_id` + PKCE          |
| `/oauth/register`                              | POST   | Registro dinámico de clientes                    | Libre                       |
| `/mcp/ping`                                    | POST   | Tool de prueba que responde `{ "result": "pong" }` o `{ "result": "pong: <mensaje>" }`| Bearer (`scope=claude.app`) |

## Integración con Claude Desktop

### Configuración Rápida

Ver la guía completa en [CLAUDE_DESKTOP_SETUP.md](./CLAUDE_DESKTOP_SETUP.md).

1. Edita tu archivo de configuración de Claude Desktop:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Agrega la configuración del servidor MCP:

```json
{
  "mcpServers": {
    "leonobitech": {
      "url": "https://claude-auth.leonobitech.com/mcp/sse",
      "transport": {
        "type": "sse",
        "url": "https://claude-auth.leonobitech.com/mcp/sse",
        "messageUrl": "https://claude-auth.leonobitech.com/mcp/message"
      },
      "oauth": {
        "authorizationUrl": "https://claude-auth.leonobitech.com/oauth/authorize",
        "tokenUrl": "https://claude-auth.leonobitech.com/oauth/token",
        "clientId": "claude-mcp",
        "clientSecret": "tu-client-secret",
        "scope": "claude.app"
      }
    }
  }
}
```

3. Reinicia Claude Desktop
4. Prueba: "Usa la herramienta ping para enviar un mensaje de prueba"

### Endpoints para Claude Desktop

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/mcp/sse` | GET | Conexión SSE principal (mantiene conexión abierta) |
| `/mcp/message` | POST | Recibe mensajes JSON-RPC del cliente MCP |
| `/mcp/ping` | POST | Tool de prueba (legacy endpoint) |

**Herramientas MCP disponibles:**
- `ping`: Prueba de conectividad (devuelve mensaje echo)
- `get_user_info`: Información del usuario autenticado

### Flujo de Conexión

1. Claude Desktop lee la configuración y detecta el servidor MCP
2. Inicia el flujo OAuth (abre navegador si es primera vez)
3. Usuario autoriza en `/oauth/authorize`
4. Claude obtiene el `access_token`
5. Se conecta a `/mcp/sse` con el token como header `Authorization: Bearer <token>`
6. Mantiene la conexión SSE abierta para recibir eventos
7. Envía mensajes JSON-RPC a `/mcp/message` cuando invoca herramientas

### Hola Mundo

En Claude Desktop, escribe:

```
Usa la herramienta ping para enviarme "Hola Mundo desde MCP!"
```

Claude responderá: `🏓 Hola Mundo desde MCP!`

Si ves errores 401/403 en el panel de herramientas, revisa el scope (`claude.app`) y la configuración de issuer/audience en `.env`.

## Validación manual con cURL/Postman

1. Genera `code_verifier` y `code_challenge` (S256).  
   Puedes apoyarte en cualquier script PKCE (por ejemplo, `openssl rand -base64 32` + un hash SHA256 codificado en Base64URL).
2. Autoriza:

```
GET {{PUBLIC_URL}}/oauth/authorize
  ?response_type=code
  &client_id={{CLIENT_ID}}
  &redirect_uri={{REDIRECT_URI}}
  &scope=claude.app
  &state=desktop-demo
  &code_challenge={{CODE_CHALLENGE}}
  &code_challenge_method=S256
```

3. Intercambia el `code`:

```
POST {{PUBLIC_URL}}/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
code={{AUTH_CODE}}
redirect_uri={{REDIRECT_URI}}
client_id={{CLIENT_ID}}
code_verifier={{CODE_VERIFIER}}
```

4. Invoca la herramienta:

```
POST {{PUBLIC_URL}}/mcp/ping
Authorization: Bearer {{ACCESS_TOKEN}}
Content-Type: application/json

{ "message": "hola claude" }
```

Deberías recibir `{ "result": "pong" }` (o `pong: hola claude` si envías el campo `message`).

## Diferencias clave vs conector ChatGPT

- **Manifest**: se expone `/.well-known/anthropic/manifest.json` con la estructura que Claude Desktop espera; mantenemos `/.well-known/ai-plugin.json` como fallback.
- **Scopes**: valor por defecto `claude.app`. Cambia según el contrato que definas para tus herramientas.
- **Redirect URI**: `https://claude.ai/api/mcp/auth_callback` (ChatGPT usa `https://chat.openai.com/aip/oauth/callback`).
- **CORS**: habilitado para `https://claude.ai`, `https://app.claude.ai` y `https://desktop.claude.ai`.
- **Sujetos por defecto**: `claude-user` cuando no se especifica `login_hint`.

## Buenas prácticas y siguientes pasos

- Implementa una pantalla real de login/consent y captura métricas de auditoría.
- Emite scopes granulares por herramienta y valida cada uno en `mcp.ts`.
- Añade tests end-to-end que simulen el flujo OAuth + invocación MCP (puedes usar `supertest` y un Redis en memoria).
- Automatiza la rotación de llaves (`keys/*.pem`) y publica JWKS versionados (`kid` distinto por rotación).

## Troubleshooting rápido

| Error / Síntoma                                            | Causa probable                                   | Solución                                                      |
| ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| `invalid_redirect_uri` al autorizar                         | `REDIRECT_URI` no coincide con la petición       | Ajusta `.env` y reinicia el servicio                          |
| `invalid_scope`                                            | Scope faltante o distinto a `claude.app`         | Asegura que `scope=claude.app` en authorize/token             |
| `invalid_token` al invocar `/mcp/ping`                     | Token expirado o firma incorrecta                | Refresca el token; revisa `JWT_ISSUER` y llaves RSA           |
| Claude Desktop muestra “Tool failed with 403”              | Falta scope `claude.app` o audience incorrecto   | Verifica `JWT_AUDIENCE` y la validación en `mcp.ts`           |
| Claude Desktop no detecta el conector                      | Manifest inaccesible                             | Comprueba HTTPS y cabeceras CORS; revisa logs de Traefik       |

## Referencias

- [Model Context Protocol – Anthropic](https://docs.anthropic.com) *(verifica la sección “Remote MCP connectors”)*  
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10)  
- [JOSE / JWT (RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519)
