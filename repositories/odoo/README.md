
# 🐘 Odoo en Docker - Configuración Pro

Este README documenta la estructura de carpetas, configuraciones clave y prácticas de seguridad implementadas en tu servicio **Odoo** dentro del proyecto Docker.

---

## 📁 Estructura de carpetas

```
repositories/odoo/
├── config/
│   └── odoo.conf               # Archivo de configuración principal de Odoo (read-only)
├── addons/                     # Carpeta para tus módulos personalizados (bind mount)
│   └── ...                     # Tus addons viven aquí (modificable)
├── odoo_data/                  # Persistencia de datos críticos de Odoo (bind mount)
│   ├── filestore/              # Archivos binarios de Odoo (adjuntos, imágenes)
│   ├── sessions/ (tmpfs)       # Sesiones en memoria (tmpfs, no persiste)
│   ├── logs/
│   └── ...                     # Otros datos de Odoo
└── README.md                   # Este archivo
```

---

## 🚀 Configuración de Docker Compose

- **Bind Mounts:**
  - `config/odoo.conf` → `/etc/odoo/odoo.conf` (read-only)
  - `addons/` → `/mnt/extra-addons` (puedes añadir/modificar tus módulos aquí)
  - `odoo_data/` → `/var/lib/odoo` (persistencia de datos Odoo)

- **tmpfs (RAM):**
  - `/tmp` y `/var/lib/odoo/sessions` montados como `tmpfs` para mayor seguridad y rendimiento.

- **Seguridad:**
  - `read_only: true` en el contenedor Odoo (excepto los bind mounts específicos).
  - ForwardAuth configurado en Traefik para proteger el subdominio `odoo.leonobitech.com`:
    ```
    traefik.http.middlewares.forward-auth-odoo.forwardauth.address=https://core.leonobitech.com/security/verify-admin
    ```
  - Headers de seguridad (CSP, STS, XSS, Referrer Policy) activos.

- **Traefik:**
  - Proxy inverso con certificados TLS (`Let's Encrypt`).
  - Middleware de seguridad aplicado:
    - `odoo-secure` (headers + CSP)
    - `forward-auth-odoo` (autenticación)

---

## 🔐 Seguridad implementada

- 🔒 **ForwardAuth con Core:** Verifica que el usuario esté autenticado como administrador.
- 🔒 **Headers CSP y seguridad en Traefik:**
  - Content Security Policy (`CSP`) estricta.
  - HTTP Strict Transport Security (`HSTS`).
  - Protección contra sniffing, clickjacking y XSS.
- 🔒 **Sesiones seguras en tmpfs:** Evita que las sesiones persistan en disco.
- 🔒 **read_only:** El contenedor Odoo es inmutable salvo las carpetas necesarias (filestore, addons, config).

---

## 🧩 Cómo añadir nuevos addons

1. Coloca tus módulos personalizados en `repositories/odoo/addons/`.
2. Reinicia el servicio Odoo:
   ```bash
   docker compose restart odoo
   ```

---

## 🧹 Buenas prácticas

✅ No modifiques datos directamente dentro de `/var/lib/odoo` en el contenedor.  
✅ Los datos persistentes (bases de datos) están en PostgreSQL.  
✅ Los archivos binarios (filestore) se guardan en `odoo_data/filestore/`.  
✅ Las sesiones están en RAM (`tmpfs`), por lo que no persisten entre reinicios (esto es normal y seguro).  
✅ La configuración (`odoo.conf`) es read-only para evitar errores accidentales.  

---

## 📝 Créditos

- 🛠️ Configurado y ajustado por Leonobitech Team
- 🤝 Con ayuda de ChatGPT para documentación y ajustes.

---

## 📂 Última actualización

**Fecha:** 2025-05-27  
**Versión:** Odoo 18.0

---

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)

¡Listo para producción! 🚀

