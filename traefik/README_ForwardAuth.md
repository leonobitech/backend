# 🛡️ Autenticación Avanzada con ForwardAuth (Traefik + Core)

Este documento describe cómo implementamos un sistema de autenticación robusto para proteger las interfaces administrativas de servicios como **n8n** y **Odoo**, utilizando **Traefik como reverse proxy**, **cookies httpOnly**, y un **microservicio "core"** que valida tokens mediante Express + middlewares propios (`authenticate`, `authorize`).

---

## 📐 Arquitectura

```
[ Usuario ]
     |
     |  1. Accede a n8n.leonobitech.com u odoo.leonobitech.com
     |
     v
[ Traefik ]
     |
     |  2. Redirige a core.leonobitech.com/security/verify-admin (ForwardAuth)
     |
     v
[ Core Service ]
     |-- Verifica cookies: accessKey + clientKey
     |-- Middleware `authenticate`: valida el JWT en Redis
     |-- Middleware `authorize`: requiere rol Admin
     |-- Responde 200 OK si todo es válido
     |
     v
[ n8n / odoo UI ]
```

---

## 🛡️ Middleware ForwardAuth en Traefik

### Ejemplo para `n8n_main`:

```yaml
- "traefik.http.middlewares.forward-auth-n8n.forwardauth.address=https://core.leonobitech.com/security/verify-admin"
- "traefik.http.middlewares.forward-auth-n8n.forwardauth.trustForwardHeader=true"
- "traefik.http.middlewares.forward-auth-n8n.forwardauth.authResponseHeaders=X-User-Id,X-User-Role"
```

Luego se aplica al router:

```yaml
- "traefik.http.routers.n8n_ui.middlewares=forward-auth-n8n@docker,n8n-secure@docker"
```

---

## 🔐 Endpoint `/security/verify-admin`

Archivo: `src/routes/security.routes.ts`

```ts
securityRoutes.get(
  "/verify-admin",
  (req, res, next) => {
    const accessKey = req.cookies?.accessKey;
    const clientKey = req.cookies?.clientKey;

    if (!accessKey || !clientKey) {
      res.status(401).send("Unauthorized");
      return; // ⛔ Defensa temprana
    }

    next(); // Pasa a middlewares siguientes
  },
  authenticate,              // ✅ Verifica JWT desde Redis
  authorize(UserRole.Admin), // ✅ Verifica que sea admin
  (req, res) => {
    res.status(200).send("✅ OK");
  }
);
```

---

## 🔍 Seguridad adicional aplicada

- ✅ Middleware `requestMeta`: IP, UserAgent y Device para trazabilidad
- ✅ Cookies `accessKey` y `clientKey` httpOnly
- ✅ Redis con TTL para access tokens
- ✅ Base de datos (MongoDB) para sesiones y refresh tokens
- ✅ CSP headers estrictos en Traefik por servicio
- ✅ `block-trackers@docker`: middleware anti rastreo
- ✅ Logs de seguridad y eventos críticos

---

## 🚨 Notas importantes

- El endpoint `/security/verify-admin` **no debe retornar 200** si las cookies no existen.
- El frontend debe controlar la visibilidad de los enlaces a n8n u odoo evaluando si el usuario es admin (con `/admin/info`).
- No es necesario usar Traefik `basicAuth` para estas interfaces si ya está en uso este ForwardAuth.

---

## 🧪 Pruebas recomendadas

- 🔐 Probar acceso sin sesión: debe redirigir (401)
- ✅ Probar con sesión de admin: debe dejar acceder
- ❌ Probar con sesión de usuario no admin: debe bloquear
- 📦 Verificar logs de seguridad (`loggerSecurityEvent`) si se detectan cookies inválidas

---

## 🧭 Futuras mejoras

- [ ] Firma de cookies para evitar manipulación
- [ ] Integración con `loggerAudit` en accesos críticos
- [ ] Caching de verificación para evitar múltiples hits al core por página

---

## 🧠 Créditos

Sistema desarrollado por [Leonobitech](https://www.leonobitech.com), con diseño modular, seguro y preparado para escalar 🚀
