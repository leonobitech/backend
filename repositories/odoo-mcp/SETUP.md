# odoo-mcp - Production Setup Guide

Complete setup guide for deploying odoo-mcp with real authentication.

## Overview

odoo-mcp is a **production-ready** MCP (Model Context Protocol) server that provides secure access to Odoo CRM from Claude Desktop and n8n. It features:

- ✅ **Real Authentication**: User registration with email/password
- ✅ **Odoo Credential Validation**: Validates Odoo API credentials during registration
- ✅ **Encrypted Credential Storage**: AES-256-GCM encryption for Odoo credentials in database
- ✅ **Session Management**: Device fingerprinting, IP validation, automatic session expiration
- ✅ **OAuth 2.1 + PKCE**: Compliant OAuth flow with consent management
- ✅ **Security Event Logging**: Complete audit trail of authentication events
- ✅ **Rate Limiting**: Protection against brute force attacks
- ✅ **GDPR Compliant**: User consent tracking and data retention policies

---

## Prerequisites

- Node.js >= 22.20.0
- PostgreSQL database
- Redis server
- Odoo instance with API access

---

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Security Secrets

```bash
npm run generate:secrets
```

This will output:
- `ENCRYPTION_KEY` - For encrypting Odoo credentials in database (64 hex chars)
- `SESSION_COOKIE_SECRET` - For signing session cookies (64 hex chars)
- `CLIENT_SECRET` - For OAuth2 client authentication (64 hex chars)

**⚠️ SAVE THESE SECURELY! They are required for .env**

### 3. Generate RSA Keys for JWT

```bash
npm run generate:keys
```

This creates:
- `keys/privateKey.pem` - For signing JWT tokens
- `keys/publicKey.pem` - For verifying JWT tokens
- `keys/jwks.json` - Public key set for Claude Desktop

---

## Configuration

### 4. Create .env File

Copy from `.env.example` and fill in all values:

```bash
cp .env.example .env
```

#### Required Environment Variables

```env
# Server
NODE_ENV=production
PORT=8100
PUBLIC_URL=https://odoo-mcp.leonobitech.com

# OAuth 2.1
CLIENT_ID=odoo-mcp
CLIENT_SECRET=<from generate:secrets>
REDIRECT_URI=https://claude.ai/api/mcp/auth/callback
SCOPES=odoo:read odoo:write

# JWT
JWKS_KID=odoo-mcp-key-1
JWT_ISSUER=https://odoo-mcp.leonobitech.com
JWT_AUDIENCE=odoo-mcp
ACCESS_TOKEN_TTL=300
AUTH_CODE_TTL=180
REFRESH_TOKEN_TTL=604800

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/odoo_mcp?schema=public

# Redis
REDIS_HOST=redis_core
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=1

# Session
SESSION_TTL=604800
SESSION_COOKIE_NAME=odoo_mcp_session
SESSION_COOKIE_SECRET=<from generate:secrets>

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=5

# Encryption
ENCRYPTION_KEY=<from generate:secrets>

# CORS
CORS_ORIGINS=https://claude.ai,https://app.claude.ai,https://desktop.claude.ai,https://odoo-mcp.leonobitech.com

# Logging
LOG_LEVEL=info
```

---

## Database Setup

### 5. Push Prisma Schema to Database

```bash
npm run db:push
```

This creates all tables:
- `users` - User accounts with encrypted Odoo credentials
- `sessions` - Active user sessions with device fingerprinting
- `oauth_consents` - OAuth consent tracking (GDPR compliant)
- `security_events` - Audit log of authentication events

### 6. Verify Database Schema

```bash
npm run db:studio
```

Opens Prisma Studio at http://localhost:5555 to browse your database.

---

## Running the Server

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

---

## Authentication Flow

### For Claude Desktop

1. **User registers** at `/auth/register`:
   ```json
   POST /auth/register
   {
     "email": "user@example.com",
     "password": "SecurePassword123!",
     "name": "John Doe",
     "odoo": {
       "url": "https://your-odoo.com",
       "db": "production",
       "username": "admin",
       "apiKey": "your-odoo-api-key"
     }
   }
   ```

2. **Server validates** Odoo credentials by calling Odoo XML-RPC API

3. **Server stores**:
   - Password hash (bcrypt with 12 rounds)
   - Odoo credentials (AES-256-GCM encrypted)
   - Creates session with device fingerprint

4. **OAuth flow**:
   - Claude Desktop requests `/oauth/authorize`
   - User redirected to `/auth/login` (if not authenticated)
   - After login, redirected to `/oauth/consent`
   - User grants/denies access
   - Authorization code issued
   - Claude exchanges code for JWT access token

5. **MCP calls**:
   - Claude sends JWT in Authorization header
   - Server validates JWT signature + expiration
   - Loads user's encrypted Odoo credentials
   - Decrypts and uses credentials to call Odoo API
   - Returns data to Claude

### For n8n

Similar flow, but n8n can store credentials in its own vault and send them in the OAuth flow.

---

## Security Features

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Rate Limiting

- **Registration**: 3 attempts per hour per IP
- **Login**: 5 failed attempts per 15 minutes per IP
- Exceeded limits trigger security events

### Device Fingerprinting

Session tied to:
- IP address
- User-Agent
- userId

If device changes mid-session → session revoked + security event logged.

### Security Events Logged

- `user.registered` - New user account created
- `user.login.success` - Successful login
- `user.login.failed` - Failed login attempt
- `user.logout` - User logged out
- `oauth.consent.granted` - User granted OAuth access
- `oauth.consent.denied` - User denied OAuth access
- `oauth.token.issued` - Access token issued
- `session.created` - New session created
- `session.revoked` - Session revoked
- `session.device_changed` - Suspicious device change detected
- `security.rate_limit_exceeded` - Rate limit hit

All events stored in `security_events` table with timestamp, IP, user agent.

---

## API Endpoints

### Authentication

- `POST /auth/register` - Register new user with Odoo credentials
- `POST /auth/login` - Login with email/password
- `POST /auth/logout` - Logout and revoke session
- `GET /auth/me` - Get current user info

### OAuth 2.1

- `GET /oauth/authorize` - OAuth authorization endpoint (requires authentication)
- `POST /oauth/token` - Token exchange endpoint
- `POST /oauth/register` - Dynamic client registration

### OAuth Consent

- `GET /oauth/consent` - Show consent screen
- `POST /oauth/consent` - Grant or deny consent
- `GET /oauth/consent/list` - List user's active consents
- `DELETE /oauth/consent/:clientId` - Revoke consent

### MCP

- `POST /mcp` - MCP protocol endpoint (SSE or HTTP)

### Health

- `GET /healthz` - Health check endpoint

---

## Maintenance

### Clean Up Old Sessions

Add a cron job to clean up expired sessions:

```typescript
import { cleanupExpiredSessions } from "@/services/session.service";

// Run daily
setInterval(async () => {
  await cleanupExpiredSessions();
}, 24 * 60 * 60 * 1000);
```

### Clean Up Old Security Events

```typescript
import { cleanupOldSecurityEvents } from "@/services/security-event.service";

// Retain for 90 days, clean up monthly
setInterval(async () => {
  await cleanupOldSecurityEvents(90);
}, 30 * 24 * 60 * 60 * 1000);
```

---

## Troubleshooting

### Database Connection Failed

- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database user permissions

### Redis Connection Failed

- Verify `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Ensure Redis is running
- Check Redis auth is enabled if password is set

### Odoo Credential Validation Failed

- Verify Odoo URL is reachable
- Check Odoo database name
- Confirm Odoo API key is valid
- Test XML-RPC connection manually

### Session Validation Failed

- Check `ENCRYPTION_KEY` matches across restarts
- Verify `SESSION_COOKIE_SECRET` is consistent
- Clear browser cookies and retry

---

## Production Checklist

- [ ] All secrets generated and stored securely
- [ ] RSA keys generated (`keys/` directory)
- [ ] `.env` configured with production values
- [ ] Database schema pushed (`npm run db:push`)
- [ ] Redis password enabled
- [ ] HTTPS enabled (Traefik/nginx)
- [ ] `NODE_ENV=production` set
- [ ] CORS origins configured correctly
- [ ] Rate limiting enabled
- [ ] Security event logging working
- [ ] Database backups configured
- [ ] Monitoring/alerting set up

---

## Support

For issues or questions, contact: felix@leonobitech.com
