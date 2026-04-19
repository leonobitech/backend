# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status**: Public showcase repository. This codebase is shared publicly for portfolio/reference purposes and **does not auto-deploy to any production environment**. All commands and setup instructions are intended for local development only.

---

## Repository Structure

This is a **monorepo** containing both frontend and backend services:

```
leonobitech/
├── frontend/          # Next.js 15 + React 19 + TypeScript
├── backend/           # Microservices monorepo with Docker Compose
│   └── repositories/
│       ├── core/      # Express + Prisma + Redis (auth microservice)
│       ├── n8n/       # Workflow automation
│       └── redis/     # Redis config & docs
└── .claude/           # Claude Code configuration & slash commands
```

---

## Development Commands

### Frontend (Next.js)

```bash
cd frontend
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # Run ESLint
```

### Backend Core Microservice

```bash
cd backend/repositories/core
npm run dev          # Start with tsx watch mode
npm run build        # Build with pkgroll (outputs to dist/)
npm run start        # Run production build
npx prisma studio    # Open Prisma Studio (DB GUI)
npx prisma generate  # Regenerate Prisma Client after schema changes
npm run generate:keys # Generate RSA key pair for JWT signing
```

### Backend Infrastructure (Docker Compose)

```bash
cd backend
make build           # Build specific service
make run             # Run locally with .env
make clean           # Remove Docker image
make reset           # Full clean & rebuild
make reset-test-redis # Test Redis in isolation

# Or using Docker Compose directly:
docker compose --env-file .env up -d --build  # Start all services
docker compose down -v --remove-orphans       # Stop & clean
```

---

## Architecture Overview

### Frontend Architecture

- **Framework**: Next.js 15 (App Router) with React 19 and TypeScript
- **State Management**:
  - `Zustand` for client-side state ([lib/store.ts](frontend/lib/store.ts))
  - React Context for session management ([app/context/SessionContext.tsx](frontend/app/context/SessionContext.tsx))
  - TanStack Query for server state & caching
- **Styling**: Tailwind CSS 4 with Radix UI primitives
- **3D Graphics**: Three.js via `@react-three/fiber` and `@react-three/drei` (see `CosmicBioCore` component)
- **Authentication**: Cookie-based sessions with JWT tokens stored in `accessKey` and `clientKey` cookies
- **Key Libraries**: Framer Motion (animations), React Hook Form + Zod (forms), Axios (HTTP client)

**Frontend Structure**:
- `app/` - Next.js App Router pages and API routes
- `components/` - Reusable UI components (organized by feature)
- `lib/` - Utility functions, API clients, and stores
- `hooks/` - Custom React hooks
- `types/` - TypeScript type definitions

### Backend Architecture (Core Microservice)

- **Framework**: Express 5 with TypeScript (ES modules)
- **Database**: PostgreSQL via Prisma ORM
- **Cache & Sessions**: Redis (logical DB 2 for tokens)
- **Authentication**:
  - RSA-signed JWT tokens (access + refresh)
  - Token lifecycle managed in Redis with automatic refresh
  - Client fingerprinting via `clientKey` (hashed metadata: IP, user agent, userId, sessionId)
  - Middleware: [src/middlewares/authenticate.ts](backend/repositories/core/src/middlewares/authenticate.ts)
  - Silent token refresh on expiration (automatic reissue)
- **Security**:
  - API key protection via `apiKeyGuard` middleware for sensitive routes
  - Traefik reverse proxy with automatic HTTPS (Let's Encrypt)
  - CORS configured for frontend origin
  - Cookie security: HttpOnly, Secure, SameSite
- **Email**: Resend for transactional emails
- **Validation**: Zod schemas for request/response validation
- **Logging**: Custom structured logging with security event tracking

**Backend Structure**:
- `src/config/` - Configuration (env, Redis, Prisma, RSA keys)
- `src/routes/` - Express route definitions (account, session, user, admin, security)
- `src/controllers/` - Request handlers
- `src/middlewares/` - Authentication, authorization, error handling, request metadata
- `src/services/` - Business logic layer
- `src/utils/` - Utilities (JWT, cookies, logging, validation)
- `src/types/` - TypeScript types and Express type extensions
- `src/constants/` - Error codes, HTTP codes, user roles, audiences

### Key Backend Flows

1. **Authentication Flow**:
   - User registers/logs in → backend generates RSA-signed access + refresh tokens
   - Tokens stored in Redis with TTL
   - `accessKey` (hashed JTI) and `clientKey` (device fingerprint) set as HttpOnly cookies
   - `authenticate` middleware verifies token signature, checks Redis, validates client fingerprint
   - On token expiration: automatic silent refresh if refresh token valid

2. **Session Management**:
   - Sessions stored in Prisma DB with metadata (IP, user agent, device)
   - Redis caches active access tokens for fast lookup
   - `/account/sessions` endpoint for listing/revoking sessions

3. **Reverse Proxy Integration** (reference only):
   - Backend can be exposed behind a reverse proxy (e.g., Traefik) via subdomain routing
   - `/security/verify-admin` endpoint supports ForwardAuth-style protection for downstream admin services

### Infrastructure (Local Dev — Docker Compose)

The included `docker-compose.yml` is intended for **local development**:

- **Traefik**: Reverse proxy with automatic SSL cert management (optional, for local subdomain testing)
- **Core**: Authentication microservice (Express)
- **n8n**: Workflow automation with webhook queue
- **Redis**: Token cache (DB 2) + shared cache for microservices
- **PostgreSQL**: Prisma-managed database (external, not included in compose)

All services communicate via Docker networks. No production deployment is configured in this repo.

---

## Important Patterns & Conventions

### Frontend

- **Session Management**: Always use `useSession()` hook to access user/session state
- **API Calls**: Use functions in `lib/api/` with consistent error handling
- **Forms**: Use React Hook Form + Zod resolver pattern
- **Animations**: Prefer Framer Motion with `useReducedMotion()` for accessibility
- **File References**: Use clickable markdown links like `[filename.ts](path/to/filename.ts)` or `[filename.ts:42](path/to/filename.ts#L42)`

### Backend

- **Error Handling**: Wrap async handlers with `catchErrors()` utility
- **Custom Errors**: Throw `HttpException` with error code from `@constants/errorCode`
- **Localization**: Pass `lang` parameter to `getErrorMessage()` for i18n error messages
- **Token Operations**: Use utilities in `utils/auth/tokenRedis.ts` for Redis token management
- **Logging**: Use `logger.*` for general logs, `loggerEvent()` for structured events, `loggerSecurityEvent()` for security alerts
- **Request Metadata**: Always available as `req.meta` after `requestMeta` middleware
- **Authentication**: `req.userId`, `req.sessionId`, `req.role`, `req.user` available after `authenticate` middleware

### Commit Message Standards

All commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) with detailed body:

```
<type>(<scope>): <description>

<emoji> Detail item 1
<emoji> Detail item 2
<emoji> Detail item 3

🚀 Powered by Claude Opus 4.6
```

**Types & Emojis:**
| Type | Emoji | Description |
|------|-------|-------------|
| `feat` | ✨ | New feature or functionality |
| `fix` | 🐛 | Bug fix |
| `docs` | 📝 | Documentation changes |
| `style` | 💄 | Code style (formatting, no logic change) |
| `refactor` | ♻️ | Code refactoring |
| `perf` | ⚡ | Performance improvement |
| `test` | ✅ | Adding or updating tests |
| `build` | 📦 | Build system or dependencies |
| `ci` | 👷 | CI/CD configuration |
| `chore` | 🔧 | Maintenance tasks |
| `revert` | ⏪ | Reverts a previous commit |
| `security` | 🔒 | Security improvements |
| `wip` | 🚧 | Work in progress |

**Additional Emojis for Body Items:**
| Emoji | Usage |
|-------|-------|
| ➕ | Added something |
| ➖ | Removed something |
| 🔄 | Updated/changed something |
| 🗑️ | Deleted/cleaned up |
| 🎨 | UI/styling changes |
| 🏗️ | Architecture changes |
| 📱 | Responsive/mobile changes |
| 🌐 | i18n/localization |
| 🔐 | Auth related |
| 💾 | Database changes |
| 🚀 | Deployment related |

**Scopes:**
`frontend` | `backend` | `auth` | `api` | `ui` | `db` | `seo` | `deps` | `infra` | `security`

**Rules:**
1. Title: lowercase type/scope, imperative mood, max 72 chars
2. Body: bullet items with relevant emojis explaining changes
3. NEVER include `Co-Authored-By` footer in commits

**Examples:**

```bash
feat(auth): add passkey authentication support

✨ Add WebAuthn registration flow
✨ Add WebAuthn login challenge/verify endpoints
🔐 Store credentials securely in user model
📝 Add passkey setup documentation

🚀 Powered by Claude Opus 4.6
```

```bash
fix(api): handle 401 gracefully for unauthenticated users

🐛 Return 200 with null instead of 401 for session check
🔄 Update fetchSessionSecure to handle new response
➖ Remove unnecessary error throwing on auth failure

🚀 Powered by Claude Opus 4.6
```

```bash
refactor(frontend): update to Tailwind v4 syntax

♻️ Replace bg-gradient-to-r with bg-linear-to-r
♻️ Replace flex-grow with grow
♻️ Replace max-w-[240px] with max-w-60
🎨 Update shadow syntax to use CSS variables

🚀 Powered by Claude Opus 4.6
```

```bash
chore(deps): update npm packages

📦 Update 101 packages to latest versions
✅ Verify build passes with updates
🔧 Regenerate package-lock.json

🚀 Powered by Claude Opus 4.6
```

**Breaking Changes:**
```bash
feat(api)!: change authentication response format

⚠️ BREAKING CHANGE
🔄 /api/auth/session now returns { user, session }
➖ Removed nested { data: { user, session } } wrapper
📝 Update client code to use new format

🚀 Powered by Claude Opus 4.6
```

### Security Considerations

- **Never commit**: `.env` files, RSA keys (`privateKey.pem`, `publicKey.pem`), `acme.json`
- **Token storage**: Access tokens in Redis only, refresh tokens in DB
- **Client key validation**: Always verify `clientKey` matches device metadata to prevent token theft
- **Rate limiting**: Not yet implemented (consider adding for production)
- **CORS**: Configured in [src/index.ts:56](backend/repositories/core/src/index.ts#L56) - update `APP_ORIGIN` env var for your local frontend origin

---

## Testing

Currently no automated test suite defined. To add tests:

```bash
# Backend
cd backend/repositories/core
npm test  # Currently exits with code 0

# Frontend
cd frontend
npm test  # Not configured yet
```

---

## Environment Setup

### Frontend

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Backend (Core)

Required environment variables (see `.env.example`):

```env
# Server
NODE_ENV=development
PORT=3001
API_ORIGIN=http://localhost:3001
APP_ORIGIN=http://localhost:3000

# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=2

# Auth
RSA_PRIVATE_KEY_PATH=/path/to/privateKey.pem
RSA_PUBLIC_KEY_PATH=/path/to/publicKey.pem
X_API_KEY=your-api-key

# Email
RESEND_API_KEY=re_...
```

Generate RSA keys: `npm run generate:keys`

### Backend (Docker)

Root `.env` for Docker Compose (only needed if running Traefik locally with custom domains):

```env
DOMAIN_NAME=localhost
SSL_EMAIL=dev@example.com
```

---

## Custom Slash Commands

Use these shortcuts in Claude Code:

- `/dev-frontend` - Start Next.js dev server
- `/dev-backend` - Start backend in watch mode
- `/check-deps` - Check for outdated npm packages
- `/prisma-status` - Check Prisma migrations status
- `/build-all` - Build both frontend and backend
- `/project-overview` - Get full project summary

---

## Contact & Resources

- **Website**: https://leonobitech.com
- **Email**: felix@leonobitech.com
- **Frontend README**: [frontend/README.md](frontend/README.md)
- **Backend README**: [backend/README.md](backend/README.md)
