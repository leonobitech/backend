# ChatGPT OAuth Service

Servicio Node.js/TypeScript que provee los endpoints OAuth2, JWKS y manifest necesarios para integrar la app MCP dentro de ChatGPT.

## Características
- Authorization Code + PKCE (`/oauth/authorize`, `/oauth/token`)
- Tokens JWT firmados con claves RSA publicadas en `/.well-known/jwks.json`
- Manifest `.well-known/ai-plugin.json` y especificación `openapi.json`
- Almacenamiento temporal de authorization codes, refresh tokens y nonces en Redis (DB configurable)
- Hardened Express server con Helmet, CORS y health check

## Scripts

```bash
npm run dev     # Desarrollo con recarga
npm run build   # Compila a dist/ usando pkgroll
npm start       # Ejecuta versión compilada
npm run generate:keys  # Genera par RSA (actualiza keys/jwks.json)
```

## Variables de entorno

Ver `.env.example` para la lista completa (PORT, PUBLIC_URL, CLIENT_ID, Redis, TTLs, etc.). Copia este archivo a `.env` y ajusta los valores antes de ejecutar.

## Docker

El `Dockerfile` expone el servicio en el puerto `8100`. Se integrará con Traefik para TLS y dominio `auth.leonobitech.com`.
