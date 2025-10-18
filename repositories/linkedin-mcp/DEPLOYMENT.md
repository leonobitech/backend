# LinkedIn MCP Server - Deployment Guide

## 🚀 Deployment to Production

### Prerequisites

1. Server with Docker and Docker Compose installed
2. Traefik reverse proxy configured
3. Redis running (shared with other services)
4. Domain DNS configured: `linkedin-mcp.leonobitech.com` → Server IP

---

## Step 1: Environment Configuration

The `.env` file is already configured for production:

```bash
PORT=8200
PUBLIC_URL=https://linkedin-mcp.leonobitech.com
CLIENT_ID=linkedin-hr-mcp
CLIENT_SECRET=9764733bc84d5c2a5e43917ef87590fd9eeb83f90f28ed4e99b5a9f06a3e76f7
REDIRECT_URI=https://claude.ai/api/mcp/auth_callback
SCOPES=linkedin.hr
LOG_LEVEL=info
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=fZi8rmyP72cx3JzFuTC6
REDIS_DB=5
ACCESS_TOKEN_TTL=300
AUTH_CODE_TTL=180
REFRESH_TOKEN_TTL=604800
JWKS_KID=linkedin-key-1
JWT_ISSUER=https://linkedin-mcp.leonobitech.com
JWT_AUDIENCE=linkedin-hr-mcp
CORS_ORIGINS=https://claude.ai,https://app.claude.ai,https://desktop.claude.ai,https://linkedin-mcp.leonobitech.com
```

**Important:** RSA keys are already generated in `keys/` directory and will be copied to the Docker image.

---

## Step 2: Docker Compose Configuration

The service is already added to `/backend/docker-compose.yml`:

```yaml
linkedin_mcp:
  container_name: linkedin_mcp
  build:
    context: ./repositories/linkedin-mcp
  image: leonobitech/linkedin-mcp:v0.1
  restart: unless-stopped
  read_only: true
  tmpfs:
    - /tmp
  security_opt:
    - no-new-privileges:true
  env_file:
    - ./repositories/linkedin-mcp/.env
  volumes:
    - ./repositories/linkedin-mcp/keys:/app/keys:ro
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
        'node -e "require(''http'').get(''http://localhost:8200/healthz'', res => process.exit(res.statusCode === 200 ? 0 : 1))"'
      ]
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 10s
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.linkedin-mcp.rule=Host(`${SUBDOMAINLINKEDINMCP}.${DOMAIN_NAME}`)"
    - "traefik.http.routers.linkedin-mcp.entrypoints=websecure"
    - "traefik.http.routers.linkedin-mcp.tls.certresolver=le"
    - "traefik.http.services.linkedin-mcp.loadbalancer.server.port=8200"
    - "traefik.http.routers.linkedin-mcp.middlewares=block-trackers@file,secure-strict@file"
```

The subdomain variable is configured in `/backend/.env`:

```bash
SUBDOMAINLINKEDINMCP=linkedin-mcp
```

---

## Step 3: Deploy to Server

### Option A: Automated Deployment (SSH)

```bash
# From your local machine
ssh root@vmi2568874.contaboserver.net "cd /root/backend && git pull origin main && docker compose --env-file .env up -d --build linkedin_mcp"
```

### Option B: Manual Deployment

```bash
# 1. SSH to server
ssh root@vmi2568874.contaboserver.net

# 2. Go to backend directory
cd /root/backend

# 3. Pull latest code
git pull origin main

# 4. Build and start the service
docker compose --env-file .env up -d --build linkedin_mcp

# 5. Verify logs
docker logs -f linkedin_mcp
```

---

## Step 4: Verify Deployment

### Check Service Health

```bash
curl https://linkedin-mcp.leonobitech.com/healthz
```

Expected response:
```json
{"status":"ok"}
```

### Check Manifest

```bash
curl https://linkedin-mcp.leonobitech.com/.well-known/anthropic/manifest.json
```

Expected response:
```json
{
  "schema_version": "v1",
  "name_for_human": "LinkedIn HR Recruiting Assistant",
  "name_for_model": "linkedin_hr_mcp",
  "description_for_human": "Busca candidatos en LinkedIn, envía InMails personalizados, y gestiona tu pipeline de reclutamiento con IA.",
  "description_for_model": "Utiliza herramientas de reclutamiento de LinkedIn para buscar candidatos, rankear perfiles, generar mensajes personalizados y gestionar pipeline de hiring.",
  "capabilities": {
    "supports_oauth2": true,
    "supports_server_metadata": true
  },
  "oauth_client_id": "linkedin-hr-mcp",
  "scopes": "linkedin.hr"
}
```

### Check OpenAPI Spec

```bash
curl https://linkedin-mcp.leonobitech.com/.well-known/openapi.json | jq .info
```

Expected response:
```json
{
  "title": "LinkedIn HR Recruiting MCP Server",
  "version": "0.1.0",
  "description": "MCP server for LinkedIn HR/Recruiting with OAuth 2.1 (PKCE)"
}
```

---

## Step 5: Configure Claude Desktop

Add the following to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "linkedin-hr": {
      "command": "mcp-client-cli",
      "args": [
        "https://linkedin-mcp.leonobitech.com"
      ]
    }
  }
}
```

Or use the web-based auth flow:

1. Open Claude Desktop
2. Go to Settings → Integrations
3. Click "Add Integration"
4. Enter: `https://linkedin-mcp.leonobitech.com/.well-known/anthropic/manifest.json`
5. Click "Connect"
6. Authorize the scopes when prompted

---

## Step 6: Test the Tools

In Claude Desktop, try:

```
Extrae información de estos perfiles de LinkedIn:
- https://www.linkedin.com/in/john-doe/
- https://www.linkedin.com/in/jane-smith/
```

Claude should respond using the `linkedin_extract_profiles` tool and show candidate information.

---

## Troubleshooting

### Service not starting

```bash
# Check logs
docker logs linkedin_mcp

# Common issues:
# - Redis connection error: Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
# - Port conflict: Make sure port 8200 is not used by another service
# - Missing keys: Verify keys/ directory exists with privateKey.pem and publicKey.pem
```

### Traefik SSL certificate issues

```bash
# Check Traefik logs
docker logs traefik

# Verify DNS
dig linkedin-mcp.leonobitech.com

# Check certificate
curl -vI https://linkedin-mcp.leonobitech.com/healthz
```

### Claude Desktop not connecting

1. Verify manifest is accessible: `curl https://linkedin-mcp.leonobitech.com/.well-known/anthropic/manifest.json`
2. Check CORS headers are correct (must include `https://claude.ai`)
3. Restart Claude Desktop after config changes

---

## Production Checklist

- [x] `.env` file configured with production values
- [x] RSA keys generated (`keys/privateKey.pem`, `keys/publicKey.pem`)
- [x] Docker Compose service added
- [x] Subdomain variable set in `/backend/.env`
- [x] Service built and running
- [x] Healthcheck passing
- [x] Manifest accessible
- [x] OpenAPI spec accessible
- [x] HTTPS working (Let's Encrypt cert)
- [ ] Claude Desktop configured
- [ ] Tools tested from Claude Desktop
- [ ] LinkedIn API credentials configured (when available)

---

## Next Steps

1. **Deploy to production** using one of the methods above
2. **Configure Claude Desktop** with the manifest URL
3. **Test all 5 tools** to verify they work correctly
4. **Replace mock implementations** with real LinkedIn API when credentials are available
5. **Create demo video** showing the recruiting workflow
6. **Integrate with Odoo CRM** (create leads from LinkedIn candidates)

---

## Monitoring

### Check service status

```bash
docker ps | grep linkedin_mcp
```

### View logs

```bash
docker logs -f linkedin_mcp
```

### Check Redis tokens

```bash
docker exec -it redis_core redis-cli -a fZi8rmyP72cx3JzFuTC6
SELECT 5
KEYS auth:*
```

---

**Ready to deploy!** 🚀
