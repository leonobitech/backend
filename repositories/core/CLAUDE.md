# CLAUDE.md — Core Microservice

Microservicio de autenticacion y sesiones para Leonobitech.

---

## Overview

**Status**: En produccion
**Stack**: Express 5 + TypeScript + Prisma + PostgreSQL + Redis
**URL**: https://core.leonobitech.com
**Puerto**: 3001

---

## Estructura

```
core/
├── src/
│   ├── config/         # Env, Redis, Prisma, RSA keys
│   ├── routes/         # account, session, user, admin, security
│   ├── controllers/    # Request handlers
│   ├── middlewares/     # authenticate, apiKeyGuard, requestMeta
│   ├── services/       # Business logic
│   ├── utils/          # JWT, cookies, logging, validation
│   ├── types/          # TypeScript types
│   └── constants/      # Error codes, HTTP codes, roles
├── prisma/             # Schema & migrations
└── dist/               # Build output (pkgroll)
```

---

## Funcionalidades

- Autenticacion RSA-signed JWT (access + refresh tokens)
- Sesiones en Redis (DB 2) con TTL
- Client fingerprinting (clientKey)
- Silent token refresh automatico
- API key guard para rutas sensibles
- Traefik ForwardAuth para proteger admin services (n8n, Odoo)
- Email transaccional via Resend

---

## TODO

- [ ] Documentar endpoints disponibles
- [ ] Documentar flujo de autenticacion completo
- [ ] Documentar middleware chain
- [ ] Documentar esquema Prisma
