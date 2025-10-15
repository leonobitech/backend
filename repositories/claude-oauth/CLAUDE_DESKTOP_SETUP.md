# Configuración de Claude Desktop con OAuth MCP

Esta guía te ayudará a conectar tu servidor MCP con OAuth a Claude Desktop para hacer un "Hola Mundo" completo.

## Prerrequisitos

1. **Claude Desktop instalado** (disponible en [claude.ai/download](https://claude.ai/download))
2. **Servidor desplegado** con URL HTTPS válida (ej: `https://claude-auth.leonobitech.com`)
3. **Redis corriendo** en el servidor
4. **Llaves RSA generadas** (`npm run generate:keys`)

## Arquitectura del Flujo

```
Claude Desktop (MCP Client)
   │
   │ 1. Lee claude_desktop_config.json
   │ 2. Inicia flujo OAuth (abre navegador)
   │ 3. Usuario autoriza en /oauth/authorize
   │ 4. Claude obtiene access_token
   │ 5. Conecta a /mcp/sse con token
   │ 6. Mantiene conexión SSE activa
   │ 7. Invoca herramientas MCP
   │
   ▼
Leonobitech Auth Server
   ├── /oauth/* (Authorization Server)
   ├── /.well-known/* (Discovery + JWKS)
   └── /mcp/sse (MCP Server con SSE transport)
```

---

## Paso 1: Configurar Claude Desktop

### Ubicación del archivo de configuración

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

### Contenido de `claude_desktop_config.json`

Crea o edita el archivo con este contenido:

```json
{
  "mcpServers": {
    "leonobitech": {
      "url": "https://claude-auth.leonobitech.com/mcp/sse",
      "transport": {
        "type": "sse",
        "url": "https://claude-auth.leonobitech.com/mcp/sse",
        "message_url": "https://claude-auth.leonobitech.com/mcp/message"
      },
      "oauth": {
        "authorizationUrl": "https://claude-auth.leonobitech.com/oauth/authorize",
        "tokenUrl": "https://claude-auth.leonobitech.com/oauth/token",
        "clientId": "claude-mcp",
        "clientSecret": "sd21qCA7S2KRSVzP1XkL0UiwWTeUoFKNS7WhGd4i1Uxg=",
        "scope": "claude.app"
      }
    }
  }
}
```

**Importante:** Reemplaza los valores con los de tu `.env`:
- `clientId`: El valor de `CLIENT_ID` (claude-mcp)
- `clientSecret`: El valor de `CLIENT_SECRET`
- URLs: Usa tu dominio configurado en `PUBLIC_URL` (claude-auth.leonobitech.com)
- `scope`: El valor de `SCOPES` (claude.app)

---

## Paso 2: Iniciar el Servidor

### Desarrollo Local

```bash
cd backend/repositories/claude-oauth

# Asegúrate de tener las variables de entorno
cat .env

# Genera las llaves si no existen
npm run generate:keys

# Inicia el servidor
npm run dev
```

### Producción (Docker)

```bash
cd backend

# Construir y levantar el contenedor
docker compose up -d --build claude_oauth

# Ver logs
docker compose logs -f claude_oauth
```

### Verificar que el servidor está corriendo

```bash
# Health check
curl https://claude-auth.leonobitech.com/healthz

# JWKS público
curl https://claude-auth.leonobitech.com/.well-known/jwks.json

# OpenAPI spec
curl https://claude-auth.leonobitech.com/.well-known/openapi.json
```

---

## Paso 3: Conectar desde Claude Desktop

1. **Cierra Claude Desktop completamente** si está abierto
2. **Abre Claude Desktop**
3. Claude detectará la nueva configuración MCP
4. Deberías ver un ícono o indicador de que hay un servidor MCP disponible
5. **Intenta usar una herramienta**:
   - En el chat, escribe: "Usa la herramienta ping para probar la conexión"
   - O: "¿Qué herramientas MCP tienes disponibles?"

### Primera vez: Flujo OAuth

La primera vez que Claude intente usar el servidor MCP:

1. **Se abrirá tu navegador** en la URL de autorización
2. **Verás una redirección** a `https://claude-auth.leonobitech.com/oauth/authorize`
3. **El servidor emitirá un código** y redirigirá de vuelta
4. **Claude intercambiará el código por tokens** automáticamente
5. **Claude se conectará** al endpoint SSE con el access token

### Observar los logs del servidor

```bash
# Ver logs en tiempo real
docker compose logs -f claude_oauth

# O si estás en dev:
# Los logs aparecerán en la consola donde corriste npm run dev
```

Deberías ver líneas como:
```
incoming request { method: 'GET', url: '/oauth/authorize', ... }
Issued authorization code { subject: 'claude-user', ... }
Access token issued via authorization_code
MCP SSE connection established { userId: 'claude-user' }
MCP server connected to SSE transport
```

---

## Paso 4: Hacer tu primer "Hola Mundo"

Una vez conectado, prueba estas herramientas:

### 1. Ping Tool

En Claude Desktop, escribe:

```
Usa la herramienta ping para enviarme un "Hola Mundo"
```

Claude debería:
1. Detectar que tienes la herramienta `ping` disponible
2. Invocarla con el parámetro `message: "Hola Mundo"`
3. Recibir la respuesta: `🏓 Hola Mundo`
4. Mostrarte el resultado

### 2. Get User Info

```
¿Qué información tienes sobre el usuario autenticado?
```

Claude invocará `get_user_info` y te mostrará:
```json
{
  "userId": "claude-user",
  "serverVersion": "0.1.0",
  "timestamp": "2025-10-15T..."
}
```

---

## Solución de Problemas

### Error: "Cannot connect to MCP server"

**Causas posibles:**
1. El servidor no está corriendo
2. La URL en `claude_desktop_config.json` es incorrecta
3. Problemas de red/firewall

**Solución:**
```bash
# Verifica que el servidor responda
curl https://claude-auth.leonobitech.com/healthz

# Verifica logs del servidor
docker compose logs claude_oauth | tail -50
```

### Error: "OAuth authorization failed"

**Causas posibles:**
1. `clientId` o `clientSecret` incorrectos
2. Scope inválido
3. Token expirado

**Solución:**
- Verifica que los valores en `claude_desktop_config.json` coincidan con tu `.env`
- Revisa los logs del servidor para ver el error exacto
- Intenta eliminar y volver a agregar la configuración MCP

### Error: "Invalid token" o "insufficient_scope"

**Causas posibles:**
1. Token expirado (TTL: 300s por defecto)
2. Scope `claude.app` no presente

**Solución:**
- Claude debería refrescar el token automáticamente
- Si persiste, reinicia Claude Desktop
- Verifica que `SCOPES=claude.app` en tu `.env`

### Claude no ve las herramientas MCP

**Causas posibles:**
1. Configuración JSON mal formateada
2. Claude Desktop no reiniciado después de cambios
3. Error en la conexión SSE

**Solución:**
```bash
# Valida el JSON (macOS/Linux)
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .

# O usa un validador online: jsonlint.com
```

### Ver logs de Claude Desktop

**macOS:**
```bash
# Logs de aplicación
tail -f ~/Library/Logs/Claude/main.log

# Console.app → busca "Claude"
```

**Windows:**
```
%APPDATA%\Claude\logs\main.log
```

---

## Verificación Manual con cURL

Si quieres probar el flujo completo sin Claude Desktop:

### 1. Registro dinámico (opcional)

```bash
curl -X POST https://claude-auth.leonobitech.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "scope": "claude.app",
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

### 2. Generar PKCE challenge

```bash
# code_verifier (43-128 caracteres aleatorios)
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=' | tr '+/' '-_')

# code_challenge (SHA256 del verifier en base64url)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '+/' '-_')

echo "Verifier: $CODE_VERIFIER"
echo "Challenge: $CODE_CHALLENGE"
```

### 3. Authorization Code

Abre en tu navegador (reemplaza `CODE_CHALLENGE`):

```
https://claude-auth.leonobitech.com/oauth/authorize?response_type=code&client_id=claude-mcp&redirect_uri=https://claude.ai/api/mcp/auth_callback&scope=claude.app&state=test123&code_challenge=PASTE_CODE_CHALLENGE_HERE&code_challenge_method=S256
```

Copia el `code` de la URL de redirección.

### 4. Token Exchange

```bash
curl -X POST https://claude-auth.leonobitech.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=PASTE_CODE_HERE" \
  -d "redirect_uri=https://claude.ai/api/mcp/auth_callback" \
  -d "client_id=claude-mcp" \
  -d "code_verifier=$CODE_VERIFIER"
```

Guarda el `access_token`.

### 5. Probar herramienta MCP (legacy endpoint)

```bash
curl -X POST https://claude-auth.leonobitech.com/mcp/ping \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Respuesta esperada:
```json
{"result":"pong"}
```

---

## Próximos Pasos

### Agregar más herramientas MCP

Edita [src/routes/mcp-sse.ts](src/routes/mcp-sse.ts) y agrega nuevas herramientas en:

1. **ListToolsRequestSchema handler** (línea ~73):
```typescript
{
  name: "mi_nueva_tool",
  description: "Descripción de la herramienta",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "..." }
    },
    required: ["param1"]
  }
}
```

2. **CallToolRequestSchema handler** (línea ~102):
```typescript
case "mi_nueva_tool": {
  const param1 = request.params.arguments?.param1 as string;
  // Tu lógica aquí
  return {
    content: [{ type: "text", text: "Resultado" }]
  };
}
```

### Integrar con tu backend existente

Puedes conectar el servidor MCP con tu backend `core`:

```typescript
import { prisma } from "@/lib/prisma"; // Si compartes la instancia
import { redis } from "@/lib/redis";

case "get_user_sessions": {
  const userId = res.locals.auth.subject;
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
  return {
    content: [{
      type: "text",
      text: JSON.stringify(sessions, null, 2)
    }]
  };
}
```

### Seguridad en producción

- [ ] Rotar `CLIENT_SECRET` periódicamente
- [ ] Implementar rate limiting (usa `express-rate-limit`)
- [ ] Monitorear logs de seguridad
- [ ] Configurar alerts para tokens inválidos/expirados
- [ ] Implementar revocación manual de tokens
- [ ] Restringir CORS a dominios específicos

---

## Referencias

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/mcp)
- [OAuth 2.1 Draft](https://oauth.net/2.1/)
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)

---

## Soporte

Si encuentras problemas:

1. Revisa los logs del servidor
2. Valida tu configuración JSON
3. Verifica que Redis esté corriendo
4. Prueba el flujo OAuth manualmente con cURL
5. Abre un issue en el repositorio

**Email:** felix@leonobitech.com
**Website:** https://leonobitech.com
