# 🔐 Leonobitech Backend – SECURITY.md

Este archivo documenta las medidas de seguridad aplicadas en la infraestructura backend de Leonobitech, incluyendo proxy inverso, microservicios y manejo de cookies.

---

## 🧭 Arquitectura General – Leonobitech Backend

```text
                                       🌐 Internet (Clientes / Servicios externos)
                                                  │
                                                  ▼
                                    ┌─────────────────────────────┐
                                    │        Traefik Proxy        │
                                    │   (traefik.leonobitech.com) ├──────────────┐
                                    │  - auth-traefik             │              │
                                    │  - block-trackers           │              ▼
                                    │  - traefik-secure (headers) │     ┌─────────────────────┐
                                    └─────────────────────────────┘     │  n8n_main (UI)      │
                                                                        │ n8n.leonobitech.com │
                                                                        │ Middlewares:        │
                                                                        │ - auth-n8n          │
                                                                        │ - n8n-secure        │
                                                                        │ - block-trackers    │
                                                                        └───────┬─────────────┘
                                                                                │
                             ┌────[ UI Login, Configuración Workflows ]─────────┘
                             │
                             │
                             │
                             │ 🛡️ Headers + CSP
                             ▼
              ┌──────────────────────────────┐
              │    core.leonobitech.com      │
              │   (API de autenticación)     │
              │   Middlewares:               │
              │   - core-secure              │
              │   - block-trackers           │
              └──────────────┬───────────────┘
                             │
                             │ uses
                             ▼
              ┌──────────────────────────────┐
              │        redis_core            │
              │    (Tokens, sesiones)        │
              └──────────────────────────────┘


        ┌──────────────────────────────────────────────┐
        │  n8n_webhook_1                               │
        │  n8n.leonobitech.com/webhook                 │
        │  Middleware: n8n-webhook-secure (headers)    │
        │  🚫 Sin CSP ni bloqueo → compatible external │
        └─────────────────────┬────────────────────────┘
                              │
                              ▼
                 🌍 WhatsApp, MercadoPago, etc.
```
---

## 🔒 Reverse Proxy: Traefik

### ✅ HTTPS Obligatorio
- Todos los servicios exponen sólo el entrypoint `websecure` (puerto 443)
- Redirección automática de `http` → `https`

### ✅ Certificados Automáticos
- Let's Encrypt (ACME)
- Email definido en `${SSL_EMAIL}`
- Almacenados en `acme.json`

### ✅ Seguridad por servicio

| Servicio               | Middleware de seguridad       | Middleware anti-tracking        |
|------------------------|-------------------------------|---------------------------------|
| `core.leonobitech.com` | `core-secure@docker`          | `block-trackers@docker`         |
| `n8n.leonobitech.com`  | `n8n-secure@docker`           | `block-trackers@docker`         |
| `n8n_webhook_1`        | `n8n-webhook-secure@docker`   | ❌ (No se aplica CSP)           |
| `n8n_worker_1`         | ❌ No expuesto públicamente   | ❌                              |
| `traefik` dashboard    | `auth-traefik@docker`         | `block-trackers@docker`         |

---

## 🧱 Middlewares definidos

### `core-secure`, `n8n-secure`, `n8n-webhook-secure`

Aplican headers de seguridad:

- `Strict-Transport-Security` (315360000 segundos)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block` (obsoleto pero útil)
- `SSLHost: ${DOMAIN_NAME}`

### `block-trackers`

- Aplica política CSP restrictiva:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';
```

- Agrega header `X-Blocked-By: Traefik`

---

## 🧠 Express Middleware: `monitorCookies.ts`

Detecta cookies espías en requests entrantes (`ph_phc_`, `rl_`, `_ga`, etc) y:
- 🔐 Las bloquea con `403 Forbidden`
- 🧾 Registra el evento en logs mediante `loggerAudit()`
- [🧠 Express Middleware](./repositories/core/src/middlewares/monitorCookies.ts)

---

## 🍪 Cookies propias

Todas las cookies (`accessKey`, `clientKey`) están configuradas con:

- `HttpOnly: true`
- `Secure: true`
- `SameSite: Strict`
- Expiración definida según el caso (15min a 1h)

Seteadas y limpiadas usando el helper centralizado:
- [🍪 Cookies](./repositories/core/src/utils/auth/cookies.ts)

---

## 📦 Servicios internos

- `n8n_worker_1` no está expuesto al exterior
- Redis y otros servicios internos están en red privada `leonobitech-net`

---

## 📌 Recomendaciones futuras

- Integrar `loggerSecurityEvent` para trazabilidad de intentos sospechosos
- Activar firewall a nivel VPS (UFW) para cerrar puertos no usados
- Monitoreo activo con fail2ban o crowdsec
- Revisar accesos SSH y proteger con 2FA

---
> Última actualización: 2025-05-02

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)


