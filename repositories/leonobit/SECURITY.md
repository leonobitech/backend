# SECURITY.md

## Objetivo
Este documento describe cómo está asegurado el stack **Leonobit** (Next.js + Traefik + Axum) y qué prácticas seguir para mantenerlo protegido, especialmente para el canal de **señalización WebRTC** vía WebSocket.

---

## Modelo de amenazas (resumen)
- **Acceso no autenticado** a `/ws/offer`.
- **Robo/replay** de tickets de WebSocket.
- **DoS** por handshakes o mensajes WS excesivos.
- **XSS/CSP**: fuga por `connect-src` o orígenes inseguros.
- **Fuga de secretos** (JWT secret, API keys).
- **CSRF** contra endpoints internos.
- **Interferencia con Upgrade** (middlewares/proxies rompiendo WS).

---

## Autenticación & Autorización
### Flujo doble-cerrojo (recomendado y aplicado)
1. **Login en Core** → cookies `Secure; SameSite=None; Domain=.leonobitech.com`.
2. **Next.js `/api/ws-ticket`** valida sesión contra `BACKEND_URL` (Core) y genera **JWT efímero (≤60s)**.
3. **Axum WS** valida:
   - `Origin == https://www.leonobitech.com`
   - **JWT** (`iss=leonobit`, `aud=ws`, `exp`)
   - (Opcional) **anti-replay** con `jti` en Redis.

**Nota:** El router WS en Traefik **no** usa forwardAuth para no romper `Upgrade`. La seguridad se aplica en `/api/ws-ticket` (Next) + validación de JWT (Axum).

---

## WebSocket (señalización)
- **Endpoint:** `wss://leonobit.leonobitech.com/ws/offer`
- **Protecciones en Axum:**
  - Validar `Origin` estrictamente.
  - Decodificar JWT (`HS256/RS256`), validar `exp`, `iss=leonobit`, `aud=ws`.
  - (Opcional) **Redis getdel** de `jti` (`TTL ≈ 90s`) para **one-time**.
  - `WebSocketConfig`: `max_message_size` y `max_frame_size` (ej. 64 KiB).
  - **Throttling** por conexión (p. ej. ≤30 mensajes/seg).
  - Cierre por **inactividad**/errores de backpressure.

---

## Traefik
### Routers
- **HTTP general (con auth)**
  - `Host(leonobit.${DOMAIN_NAME})`
  - Middlewares: `core-auth@file, secure-relaxed@file`
- **WS dedicado (sin auth)**
  - `Host(leonobit.${DOMAIN_NAME}) && PathPrefix(/ws/)`
  - **Sin middlewares** (no romper `Upgrade`)
  - `priority=100` para ganar al general
  - **Rate-limit** suave (handshake):
    - `average=50`, `burst=100`

### CSP (Traefik middlewares)
- Asegurar que los frontends tras Traefik permitan `connect-src wss://leonobit.leonobitech.com` **sin** abrir `wss://*`.
- Vercel (Next) tiene **su propia CSP** en `next.config` (ya incluye `wss://leonobit...`).

---

## Next.js (Frontend)
- **/ws-test** protegido por login (middleware en Next o guard de página).
- **/api/ws-ticket**:
  - Valida sesión contra Core con `accessKey/clientKey` y `x-core-access-key`.
  - Emite **JWT 60s** (`sub`, `tid`, `aud=ws`, `iss=leonobit`, `jti`).
  - `Cache-Control: no-store`.
- **CSP**: `connect-src` incluye `wss://leonobit.leonobitech.com`.

---

## Secretos y configuración
| Variable              | Dónde        | Descripción |
|----------------------|--------------|-------------|
| `BACKEND_URL`        | Next (Vercel)| URL del Core para validar sesión (`/admin/leonobit` o equivalente). |
| `CORE_API_KEY`       | Next (Vercel)| API key interna para Core. |
| `WS_JWT_SECRET`      | Next (Vercel)| Clave para firmar JWT corto (≥32 chars). Rotación recomendada. |
| `CORS_ORIGIN`        | Axum         | Origen permitido (prod: `https://www.leonobitech.com`). |
| `DOMAIN_NAME`        | Traefik      | Dominio base para routers. |

**Buenas prácticas**
- Rotar `WS_JWT_SECRET` periódicamente (ideal usar KMS/JWKS si se migra a RS256).
- Nunca commitear secretos; usar envs/secret stores.

---

## Rate limiting & Anti-abuso
- **Traefik**: rate-limit en router WS (handshake).
- **Axum**: throttling por conexión y límites por tenant:
  - conexiones simultáneas,
  - mensajes/min,
  - bytes/min.
- **Cloudflare** (opcional): WAF/Bot Fight para frenar picos en la capa perimetral.

---

## Logs, auditoría y monitoreo
- `tracing` en Axum (IDs de conexión, eventos WS, cierres).
- Métricas (Prometheus/Grafana) de:
  - handshakes/min, conexiones activas,
  - RTT promedio reportado por cliente,
  - errores de validación JWT.
- **Correlación**: propagar `X-Request-ID` desde frontend → Core → Axum.

---

## Dependencias y parches
- **Rust** y **Node** en versiones LTS soportadas.
- Renovar dependencias con auditoría (`cargo audit`, `npm audit`) periódicamente.
- Revisar `tungstenite/axum` y `jsonwebtoken` ante CVEs.

---

## Despliegue seguro
- Traefik en `websecure` con TLS y HSTS.
- Contenedores:
  - `read_only: true`, `no-new-privileges`, `cap_drop: ALL`,
  - `user: "10001:10001"`,
  - `tmpfs` para `/tmp` y `/run`.
- Healthcheck a `/health`.

---

## Desarrollo local
- Axum: `export CORS_ORIGIN="https://www.leonobitech.com"` y `cargo run`.
- Test WS local: `ws://localhost:8000/ws/offer` (sin Traefik).
- Next.js: `NEXT_PUBLIC_WS_URL` para apuntar al WS que corresponda.

---

## Vulnerability Disclosure
Si encuentras un problema de seguridad:
- Escribe a **security@leonobitech.com** con pasos de reproducción.
- No publiques detalles hasta que esté mitigado y parcheado.
- Reconocemos responsables y coordinamos divulgación.

---

## Checklist de verificación (previo a release)
- [ ] `/ws/offer` **NO** tiene middlewares en Traefik.
- [ ] CSP del Frontend incluye `wss://leonobit.leonobitech.com`.
- [ ] `/api/ws-ticket` devuelve JWT con `exp≤60s`, `iss`, `aud`, `jti`.
- [ ] Axum valida `Origin`, `JWT` y cierra por abuso/inactividad.
- [ ] Rate-limit en router WS activo (Traefik).
- [ ] Secrets presentes y rotación documentada.
- [ ] Logs y métricas activas; alertas básicas configuradas.
