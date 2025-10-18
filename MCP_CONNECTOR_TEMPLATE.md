# MCP Connector Template & Best Practices

Este documento sirve como referencia para crear nuevos conectores MCP siguiendo los estándares de Leonobitech.

---

## 📋 Valores Estándar para `.env`

### Variables de OAuth (REQUERIDAS)

```bash
# Server Configuration
PORT=8XXX  # Ver tabla de puertos abajo
PUBLIC_URL=https://[service-name].leonobitech.com

# OAuth Client
CLIENT_ID=[service-name]-mcp
CLIENT_SECRET=  # Generar con: openssl rand -base64 48
REDIRECT_URI=https://claude.ai/api/mcp/auth/callback  # ⚠️ IMPORTANTE: Con /callback (barra)
SCOPES=[service-name].app

# Logging
LOG_LEVEL=info

# Redis (EXACTOS - no cambiar)
REDIS_HOST=redis_core  # ⚠️ Nombre del servicio en docker-compose
REDIS_PORT=6379
REDIS_PASSWORD=fZi8rmyP72cx3JzFuTC6  # Del .env raíz del backend
REDIS_DB=X  # Ver tabla de DBs abajo

# JWT Configuration
ACCESS_TOKEN_TTL=300
AUTH_CODE_TTL=180
REFRESH_TOKEN_TTL=604800
JWKS_KID=[service-name]-key-1
JWT_ISSUER=https://[service-name].leonobitech.com
JWT_AUDIENCE=[service-name]-mcp

# CORS (copiar tal cual)
CORS_ORIGINS=https://claude.ai,https://app.claude.ai,https://desktop.claude.ai,https://[service-name].leonobitech.com
```

---

## 🔢 Tabla de Asignación de Recursos

### Puertos Asignados

| Servicio | Puerto | Estado |
|----------|--------|--------|
| chatgpt-oauth | 8100 | ✅ En uso |
| claude-oauth | 8100 | ✅ En uso |
| linkedin-mcp | 8200 | ✅ En uso |
| [próximo] | 8300 | 🟢 Disponible |

### Redis DBs Asignadas

| Servicio | Redis DB | Estado |
|----------|----------|--------|
| core (auth) | 2 | ✅ En uso |
| chatgpt-oauth | 3 | ✅ En uso |
| claude-oauth | 4 | ✅ En uso |
| linkedin-mcp | 5 | ✅ En uso |
| [próximo] | 6 | 🟢 Disponible |

---

## ⚠️ Errores Comunes a Evitar

### 1. ❌ REDIRECT_URI incorrecto
```bash
# ❌ INCORRECTO (sin barra)
REDIRECT_URI=https://claude.ai/api/mcp/auth_callback

# ✅ CORRECTO (con barra)
REDIRECT_URI=https://claude.ai/api/mcp/auth/callback
```

**Síntoma:** Claude Desktop no se conecta, error de OAuth

---

### 2. ❌ REDIS_HOST incorrecto
```bash
# ❌ INCORRECTO
REDIS_HOST=redis
REDIS_HOST=localhost

# ✅ CORRECTO (nombre del servicio en docker-compose)
REDIS_HOST=redis_core
```

**Síntoma:** Servicio unhealthy, logs muestran "Connection timeout" o "ENOTFOUND redis"

---

### 3. ❌ Redis DB duplicada
```bash
# ❌ INCORRECTO (DB ya usada por otro servicio)
REDIS_DB=2

# ✅ CORRECTO (verificar tabla de asignación)
REDIS_DB=6  # Siguiente disponible
```

**Síntoma:** Conflictos de tokens entre servicios, sesiones compartidas

---

### 4. ❌ Puerto duplicado
```bash
# ❌ INCORRECTO (puerto ya usado)
PORT=8200

# ✅ CORRECTO (verificar tabla de asignación)
PORT=8300  # Siguiente disponible
```

**Síntoma:** Docker no puede bind el puerto, servicio no inicia

---

## 🚀 Checklist para Nuevo Conector

### Fase 1: Configuración Local

- [ ] Copiar directorio base (ej: `cp -r claude-oauth nuevo-conector`)
- [ ] Actualizar `package.json`:
  - [ ] `name`: `@backend/[service-name]`
  - [ ] `description`
- [ ] Crear `.env` siguiendo el template de arriba
- [ ] Asignar puerto único (consultar tabla)
- [ ] Asignar Redis DB único (consultar tabla)
- [ ] **Verificar `REDIRECT_URI` tiene `/callback` con barra**
- [ ] **Verificar `REDIS_HOST=redis_core`**
- [ ] Generar llaves RSA: `npm run generate:keys`
- [ ] Compilar: `npm run build`
- [ ] Probar localmente (si tienes Redis local)

### Fase 2: Docker Compose

- [ ] Agregar servicio a `docker-compose.yml`:
  ```yaml
  [service-name]:
    container_name: [service-name]
    build:
      context: ./repositories/[service-name]
    image: leonobitech/[service-name]:v0.1
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    env_file:
      - ./repositories/[service-name]/.env
    volumes:
      - ./repositories/[service-name]/keys:/app/keys:ro
    networks:
      - leonobitech-net
    depends_on:
      redis_core:
        condition: service_healthy
      traefik:
        condition: service_started
    healthcheck:
      test:
        [
          "CMD-SHELL",
          'node -e "require(''http'').get(''http://localhost:8XXX/healthz'', res => process.exit(res.statusCode === 200 ? 0 : 1))"'
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 10s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.[service-name].rule=Host(`${SUBDOMAIN[SERVICE]}.${DOMAIN_NAME}`)"
      - "traefik.http.routers.[service-name].entrypoints=websecure"
      - "traefik.http.routers.[service-name].tls.certresolver=le"
      - "traefik.http.services.[service-name].loadbalancer.server.port=8XXX"
      - "traefik.http.routers.[service-name].middlewares=block-trackers@file,secure-strict@file"
  ```

- [ ] Agregar variable de subdominio en `/backend/.env`:
  ```bash
  SUBDOMAIN[SERVICE]=[service-name]
  ```

### Fase 3: Git & Deploy

- [ ] Commit y push:
  ```bash
  git add .
  git commit -m "feat: add [service-name] MCP connector"
  git push origin main
  ```

### Fase 4: Setup en VPS (MANUAL - una sola vez)

- [ ] SSH al VPS: `ssh root@vmi2568874.contaboserver.net`
- [ ] Ir al directorio: `cd /root/backend/repositories/[service-name]`
- [ ] Copiar `.env` de producción (con credenciales reales)
- [ ] **Verificar `REDIRECT_URI` tiene `/callback` con barra**
- [ ] **Verificar `REDIS_HOST=redis_core`**
- [ ] Instalar dependencias: `npm install`
- [ ] Generar llaves: `npm run generate:keys`
- [ ] Volver a raíz: `cd /root/backend`
- [ ] El CI/CD debería hacer el deployment automático después del push

### Fase 5: Verificación Post-Deploy

- [ ] Verificar servicio healthy:
  ```bash
  curl https://[service-name].leonobitech.com/healthz
  # Debe retornar: HTTP/2 200
  ```

- [ ] Verificar manifest:
  ```bash
  curl https://[service-name].leonobitech.com/.well-known/anthropic/manifest.json | jq .
  ```

- [ ] Verificar redirect_uri correcto:
  ```bash
  curl -s https://[service-name].leonobitech.com/.well-known/anthropic/manifest.json | jq '.oauth.redirect_uri'
  # Debe retornar: "https://claude.ai/api/mcp/auth/callback"
  ```

- [ ] Verificar OpenAPI:
  ```bash
  curl https://[service-name].leonobitech.com/.well-known/openapi.json | jq .info
  ```

- [ ] Verificar logs en VPS:
  ```bash
  docker logs -f [service-name]
  # Debe mostrar: "Redis connection established"
  # NO debe mostrar: "Connection timeout" o "ENOTFOUND"
  ```

### Fase 6: Claude Desktop

- [ ] Configurar en Claude Desktop:
  ```
  https://[service-name].leonobitech.com/.well-known/anthropic/manifest.json
  ```

- [ ] Autorizar OAuth cuando Claude Desktop lo pida
- [ ] Probar herramientas desde Claude Desktop

---

## 📚 Referencias

### Ejemplos Funcionales

- **claude-oauth** (Odoo CRM): `/backend/repositories/claude-oauth/`
- **linkedin-mcp** (HR Recruiting): `/backend/repositories/linkedin-mcp/`

### Documentación

- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [OAuth 2.1 with PKCE](https://oauth.net/2.1/)
- [Traefik Labels Reference](https://doc.traefik.io/traefik/routing/providers/docker/)

---

## 🐛 Troubleshooting Rápido

### Servicio unhealthy
1. Verificar `REDIS_HOST=redis_core`
2. Verificar `REDIS_PASSWORD` coincide con `/backend/.env`
3. Ver logs: `docker logs [service-name]`

### Claude Desktop no conecta
1. Verificar `REDIRECT_URI` tiene `/callback` con barra
2. Verificar manifest accesible vía HTTPS
3. Verificar certificado SSL activo

### Error 526 Cloudflare
1. Servicio está unhealthy (ver arriba)
2. SSL no generado aún (esperar 2-3 minutos)

---

**Última actualización:** 2025-10-18
**Mantenido por:** Claude Code + Felix
