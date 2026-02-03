# CLAUDE.md — Redis

Cache y almacenamiento de sesiones/tokens.

---

## Overview

**Status**: En produccion
**Stack**: Redis (Docker)

---

## Bases de datos logicas

| DB | Uso |
|----|-----|
| 2 | Tokens de autenticacion (Core microservice) |

---

## Uso por servicio

- **Core**: Access tokens con TTL, lookup rapido para authenticate middleware
- **n8n**: Cache compartido (si aplica)

---

## TODO

- [ ] Documentar todas las DBs logicas en uso
- [ ] Documentar TTLs y politicas de expiracion
- [ ] Documentar configuracion Docker y persistencia
