# Leonobitech ChatGPT OAuth & MCP Connector

Servicio Node.js/TypeScript que implementa la capa de autenticación OAuth 2.1 y discovery para un conector MCP compatible con ChatGPT. Esta guía explica la arquitectura, los endpoints expuestos, cómo ejecutar el proyecto y cómo validar el flujo Authorization Code + PKCE paso a paso (incluyendo pruebas con Postman).

## Tabla de contenido

1. [Introducción](#introducción)
2. [Arquitectura general](#arquitectura-general)
3. [Estructura del proyecto](#estructura-del-proyecto)
4. [Configuración de entorno](#configuración-de-entorno)
5. [Flujo OAuth 2.1 para MCP](#flujo-oauth-21-para-mcp)
6. [Endpoints principales](#endpoints-principales)
7. [Validación manual con Postman](#validación-manual-con-postman)
8. [Integración con ChatGPT](#integración-con-chatgpt)
9. [Buenas prácticas y siguientes pasos](#buenas-prácticas-y-siguientes-pasos)
10. [Glosario](#glosario)
11. [Solución de problemas](#solución-de-problemas)
12. [Checklist de despliegue](#checklist-de-despliegue)
13. [Referencias](#referencias)

## Introducción

Este repositorio contiene el servicio `chatgpt-oauth`, encargado de:

- Publicar la metadata `.well-known` que ChatGPT usa para descubrir el conector MCP.
- Exponer un servidor OAuth 2.1 con flujo Authorization Code + PKCE, refresh tokens y registro dinámico.
- Firmar y validar tokens JWT (RS256) que deben acompañar cada llamada a herramientas MCP.
- Servir endpoints MCP (`/mcp/*`) protegidos por OAuth.

Es la capa remota de autenticación necesaria para conectar un servidor MCP (Model Context Protocol) con ChatGPT, siguiendo las guías más recientes del Apps SDK.

## Arquitectura general

```
ChatGPT (cliente OAuth/MCP)
   │
   │ 1. Discovery: https://chatgpt-auth.leonobitech.com/.well-known/**
   │ 2. Registro dinámico: POST /oauth/register
   │ 3. Authorization Code + PKCE: GET /oauth/authorize
   │ 4. Token exchange: POST /oauth/token
   │ 5. Invocación MCP: POST /mcp/...
   │    (Authorization: Bearer <access_token>)
   ▼
Leonobitech Auth Server (este repo)
   ├── Resource server MCP (Express /mcp)
   ├── Authorization server (OAuth 2.1)
   └── Public discovery metadata (.well-known, JWKS)
```

- **Authorization server**: endpoints `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth-protected-resource`.
- **Resource server MCP**: rutas protegidas bajo `/mcp` que verifican el access token.
- **Discovery**: documentos `.well-known` consumidos por ChatGPT para configurar el conector.
- **Almacenamiento**: Redis para authorization codes, refresh tokens y nonces; archivos `keys/*.pem` y `jwks.json` para firmas JWT.

## Estructura del proyecto

```
src/
 ├─ index.ts            # Bootstrap de Express y middlewares (helmet, cors, logging)
 ├─ routes/
 │   ├─ oauth.ts        # Flujos OAuth 2.1 (authorize, token, refresh, register)
 │   ├─ mcp.ts          # Herramientas MCP protegidas (p.ej. /mcp/ping)
 │   ├─ well-known/
 │   │   └─ index.ts    # Manifest MCP, OpenAPI, JWKS, oauth-protected-resource, etc.
 │   └─ health.ts       # Health check
 ├─ lib/
 │   ├─ auth.ts         # Verificación de tokens (JWKS + jose)
 │   ├─ keys.ts         # Firma de access tokens
 │   ├─ store.ts        # Gestión de authorization codes y refresh tokens (Redis)
 │   ├─ pkce.ts         # Utilidades PKCE
 │   └─ redis.ts        # Conexión y health check Redis
 └─ scripts/
     └─ generateKeys.ts # Genera par RSA y JWKS

keys/
 ├─ private.pem
 ├─ public.pem
 └─ jwks.json
```

## Configuración de entorno

1. Copia `.env.example` a `.env` y ajusta:

```env
PORT=8100
PUBLIC_URL=https://chatgpt-auth.leonobitech.com
CLIENT_ID=chatgpt-mcp
CLIENT_SECRET=...
REDIRECT_URI=https://chat.openai.com/aip/oauth/callback
SCOPES=chatgpt.app
JWT_ISSUER=https://chatgpt-auth.leonobitech.com
JWT_AUDIENCE=chatgpt-mcp
REDIS_HOST=redis_core
REDIS_DB=4
# ... TTLs y otras opciones
```

2. Genera las llaves RSA y JWKS:

```bash
npm install
npm run generate:keys
```

3. Ejecuta el servicio:

```bash
npm run dev          # desarrollo (tsx watch)
npm run build        # compila a dist/
npm start            # producción (usa dist/index.mjs)
```

4. Docker / Traefik:
   - `Dockerfile` expone el puerto 8100 (modo read-only + healthcheck).
   - `docker-compose.yml` (monorepo backend) define el servicio `chatgpt_oauth` con healthcheck que consulta `/healthz` cada 15s.

## Flujo OAuth 2.1 para MCP

1. **Discovery**: ChatGPT resuelve `/.well-known/openapi.json`, `/.well-known/ai-plugin.json`, `/.well-known/jwks.json`, `/.well-known/oauth-protected-resource`, `/.well-known/openid-configuration`.

2. **Registro dinámico**:

   - `POST /oauth/register` (application/json)
   - Valida `redirect_uris`, `scopes`, `grant_types`, `token_endpoint_auth_method`.
   - Responde `201` con `client_id`, `client_secret`, `grant_types`, `response_types`, metadatos y `client_secret_expires_at`.

3. **Authorization Code + PKCE**:

   - `GET /oauth/authorize` requiere `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state` (opcional), `code_challenge`, `code_challenge_method`.
   - Verifica `client_id`, `redirect_uri`, `scopes` y PKCE. Emite authorization code y redirige a `redirect_uri` con `code` y `state`.

4. **Token exchange** (`POST /oauth/token`):

   - `grant_type=authorization_code` con `code`, `redirect_uri`, `client_id`, `code_verifier`.
   - Devuelve `access_token` (JWT RS256), `refresh_token`, `scope`, `expires_in`.

5. **Refresh tokens**:

   - `grant_type=refresh_token` con `refresh_token`, `client_id`.
   - Revoca el refresh antiguo y emite uno nuevo.

6. **Invocación MCP**:
   - `POST /mcp/ping` (y futuras herramientas) requieren `Authorization: Bearer <token>`.
   - Middleware en `mcp.ts` verifica firma, issuer (`JWT_ISSUER`), audience (`JWT_AUDIENCE`) y que el scope incluya `chatgpt.app`.
   - Ante errores, responde `401` o `403` con cabecera `WWW-Authenticate` apuntando a `/.well-known/oauth-protected-resource`.

## Endpoints principales

| Ruta                                    | Método | Descripción                         | Autenticación                |
| --------------------------------------- | ------ | ----------------------------------- | ---------------------------- |
| `/healthz`                              | GET    | Health check                        | Libre                        |
| `/.well-known/ai-plugin.json`           | GET    | Manifest MCP/Plugin                 | Libre                        |
| `/.well-known/openapi.json`             | GET    | OpenAPI 3.0.1 (MCP + OAuth)         | Libre                        |
| `/.well-known/jwks.json`                | GET    | JWKS público RS256                  | Libre                        |
| `/.well-known/oauth-protected-resource` | GET    | Metadata de scopes y issuer         | Libre                        |
| `/.well-known/openid-configuration`     | GET    | Discovery OIDC                      | Libre                        |
| `/oauth/authorize`                      | GET    | Authorization Code + PKCE           | Redirige                     |
| `/oauth/token`                          | POST   | Intercambio code↔token y refresh    | `client_id` + PKCE           |
| `/oauth/register`                       | POST   | Registro dinámico (client metadata) | Libre                        |
| `/mcp/ping`                             | POST   | Tool `ping` MCP (ejemplo)           | Bearer token (`chatgpt.app`) |

## Validación manual con Postman

### 1. Authorization Code

1. Configura variables:
   - `AUTH_BASE=https://chatgpt-auth.leonobitech.com`
   - `CLIENT_ID`, `CLIENT_SECRET`
   - `REDIRECT_URI=https://chat.openai.com/aip/oauth/callback`
   - `SCOPE=chatgpt.app`
2. Genera `code_verifier` y `code_challenge` (por ejemplo, con script PKCE en pre-request).
3. Ejecuta la petición de autorización:

```
GET {{AUTH_BASE}}/oauth/authorize
  ?response_type=code
  &client_id={{CLIENT_ID}}
  &redirect_uri={{REDIRECT_URI}}
  &scope={{SCOPE}}
  &state=postman-demo
  &code_challenge={{CODE_CHALLENGE}}
  &code_challenge_method=S256
```

4. Sigue la redirección hasta capturar el `code` (Postman permite abrir la URL en navegador y copiar el código de la query).

### 2. Intercambio por tokens

```
POST {{AUTH_BASE}}/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
code={{AUTH_CODE}}
redirect_uri={{REDIRECT_URI}}
client_id={{CLIENT_ID}}
code_verifier={{CODE_VERIFIER}}
```

- Respuesta (200):

```json
{
  "token_type": "Bearer",
  "access_token": "...",
  "expires_in": 300,
  "refresh_token": "...",
  "scope": "chatgpt.app"
}
```

### 3. Ping MCP protegido

```
POST {{AUTH_BASE}}/mcp/ping
Authorization: Bearer {{ACCESS_TOKEN}}
Content-Type: application/json

{}
```

- Respuesta (200): `{"result":"pong"}`
- Sin token → `401` + `WWW-Authenticate: Bearer ... error="invalid_request"`
- Scope insuficiente → `403` + `error="insufficient_scope"`

### 4. Refresh token

```
POST {{AUTH_BASE}}/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
refresh_token={{REFRESH_TOKEN}}
client_id={{CLIENT_ID}}
```

- Devuelve nuevo par `access_token`/`refresh_token`.

### Error común

- `invalid_scope`: revisa que `scope` incluya `chatgpt.app`.
- `invalid_redirect_uri`: debe coincidir exactamente con `REDIRECT_URI` en `.env`.
- `invalid_client_metadata`: en `/oauth/register`, revisa `redirect_uris`, `token_endpoint_auth_method`.

## Integración con ChatGPT

1. Obtén acceso al modo developer o usa un ChatGPT Workspace (Teams/Business/Enterprise). El backend de OpenAI responde con `{"detail":"Must use workspace account..."}` si la cuenta no tiene permisos.
2. En ChatGPT → Settings → Connectors → New Connector.
3. MCP Server URL: `https://chatgpt-auth.leonobitech.com/.well-known/openapi.json`.
4. ChatGPT realizará:
   - Descarga del OpenAPI y manifest.
   - `POST /oauth/register` para obtener `client_id/client_secret`.
   - Cuando el usuario use el conector, lanzará el flujo OAuth con PKCE y almacenará tokens.
5. Observa los logs:
   - `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/mcp/ping`.
   - Errores 401/403 indican tokens ausentes/expirados; ChatGPT debería relanzar el flujo.

## Buenas prácticas y siguientes pasos

- **Tokens**: rota claves RSA periódicamente. Usa `keys/` solo para desarrollo; en producción, almacena en un secret manager.
- **Scopes**: actualmente `chatgpt.app` es único; si agregas nuevas herramientas, define scopes granulares y amplica la validación.
- **Monitorización**: loguea correlación `sub` + `client_id` para trazabilidad. Configura alertas ante error rates altos en `/oauth/token` o `/mcp/*`.
- **Ampliar herramientas MCP**: añade más routes en `mcp.ts` (o crea un servidor MCP dedicado). En cada tool, verifica tokens y scopes según corresponda.
- **Persistencia**: planifica la gestión de refresh tokens en Redis (TTL, revocación manual, limpieza).
- **Rate limiting / anti-abuso**: considera middleware o integración con un gateway (Traefik, Cloudflare) para limitar peticiones por IP/cliente.

## Glosario

| Término                         | Descripción                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **MCP**                         | Model Context Protocol: especificación para conectar herramientas externas a ChatGPT.                                 |
| **PKCE**                        | Proof Key for Code Exchange: refuerza Authorization Code contra interception.                                         |
| **JWKS**                        | JSON Web Key Set: lista de claves públicas usadas para verificar JWT.                                                 |
| **Authorization Code**          | Código temporal emitido tras login/consent, intercambiado por tokens.                                                 |
| **Refresh Token**               | Credencial de larga duración para obtener nuevos access tokens sin repetir login.                                     |
| **Dynamic Client Registration** | Proceso por el cual un cliente (ChatGPT) solicita `client_id`/`client_secret` al authorization server en tiempo real. |

## Solución de problemas

| Mensaje / Código                                             | Causa probable                                     | Acción sugerida                                                      |
| ------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| `{"detail":"Must use workspace account for this operation"}` | Cuenta ChatGPT sin permisos de developer/workspace | Cambia al workspace habilitado o solicita acceso a OpenAI.           |
| `invalid_scope` (401/400)                                    | Scope faltante o mal escrito                       | Asegura que `scope=chatgpt.app` y coincide con `.env`.               |
| `invalid_redirect_uri`                                       | `redirect_uri` distinto al configurado             | Verifica `REDIRECT_URI` en `.env` y en la petición OAuth.            |
| `invalid_client_metadata` en `/oauth/register`               | Payload no cumple el esquema                       | Revisa `redirect_uris`, `grant_types`, `token_endpoint_auth_method`. |
| `invalid_token` / `insufficient_scope` en `/mcp/*`           | Token expirado o sin scope requerido               | Solicita refresh token o repite el flujo OAuth.                      |
| Redis errores                                                | No hay conexión a Redis                            | Confirma host/puerto/credenciales y que el contenedor esté en línea. |

## Checklist de despliegue

- [ ] Generar nuevas claves RSA (`npm run generate:keys`) y asegurar que `jwks.json` esté actualizado.
- [ ] Configurar variables `.env` con la URL pública (TLS válido) y credenciales definitivas.
- [ ] Revisar que Redis esté disponible y protegido.
- [ ] Habilitar reverse proxy (Traefik) con TLS y rewrites adecuados.
- [ ] Probar el flujo completo con Postman (authorize → token → refresh → ping).
- [ ] Publicar `/.well-known/openapi.json` y `/.well-known/ai-plugin.json` sin caché.
- [ ] Verificar logs de salud (`/healthz`, `/oauth/register`, `/oauth/token`, `/mcp/ping`).
- [ ] Documentar `client_id/client_secret` entregados al workspace (si no se usa registro dinámico).
- [ ] Preparar plan de rotación de claves y tokens si se compromete alguna credencial.

## Referencias

- [Model Context Protocol (MCP) – OpenAI](https://developers.openai.com/apps-sdk/concepts/mcp-server)
- [Apps SDK Authentication Guide](https://developers.openai.com/apps-sdk/build/auth) _(beta)_
- [OAuth 2.1 (draft)](https://oauth.net/2.1/)
- [RFC 7636 – PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [JOSE / JWT – jose package](https://github.com/panva/jose)
- [Pizzaz demo app (Apps SDK examples)](https://developers.openai.com/apps-sdk/build/examples)
