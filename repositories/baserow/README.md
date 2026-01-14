
# 🧩 Baserow Modular Architecture with Traefik & Media Server

This setup provides a modular and production-ready deployment of Baserow, leveraging Traefik as a reverse proxy and NGINX as a static media file distributor. It is ideal for scalable, secure, and maintainable infrastructure.

---

## 📌 Architecture Overview

### 🧠 Backend Architecture

![Backend Architecture](https://github.com/leonobitech/backend/blob/main/repositories/baserow/baserow_architecture.png)

**Services:**
- **`backend`**: Main Django backend running on Gunicorn. Handles all business logic and API endpoints.
- **`baserow_celery`**: Handles background async tasks (e.g., database operations, exports).
- **`celery_export_worker`**: Dedicated worker for heavy exports.
- **`baserow_celery_beat`**: Periodic scheduler (cron-like tasks).
- **`baserow-media`**: NGINX container responsible for serving `/media` files like uploads.
- All services mount the same shared volume: `baserow_media`

---

### 🖼️ Frontend + Reverse Proxy Architecture

![Frontend + Proxy Architecture](https://github.com/leonobitech/backend/blob/main/repositories/baserow/baserow_frontend_architecture.png)

**Services:**
- **`baserow`**: The Nuxt-based frontend that serves the Baserow dashboard on port 3000.
- **`traefik`**: Acts as a secure reverse proxy, SSL terminator, and ForwardAuth gatekeeper.
- **`baserow-media`**: Serves uploaded files via `/media`, isolated from the frontend logic.

---

## 🔐 Why Modular over Monolithic?

| Feature               | Monolithic Image              | Modular Architecture         |
|-----------------------|--------------------------------|------------------------------|
| 🔧 Flexibility         | ❌ Harder to customize          | ✅ Full control of services  |
| 🧠 Service Isolation   | ❌ All-in-one logic             | ✅ Fine-grained scalability |
| 📦 Image Size          | ✅ Smaller footprint            | ❌ More disk space           |
| 🔄 Upgrade Path        | ❌ One-shot upgrades            | ✅ Independent upgrades      |
| 🛠️ Debugging           | ❌ All logs mixed               | ✅ Clean per-service logs    |

---

## 🌐 Required Environment Variables

Set in `.env` file shared across services:

```env
PUBLIC_BACKEND_URL=https://br.leonobitech.com
PUBLIC_WEB_FRONTEND_URL=https://br.leonobitech.com
MEDIA_URL=https://br.leonobitech.com/media/
BASEROW_EXTRA_ALLOWED_HOSTS=br.leonobitech.com
```

---

## 🚀 Usage

```bash
docker compose up -d
```

This command will:
- Start backend API
- Spawn Celery & Beat workers
- Serve frontend via Nuxt
- Proxy all traffic through Traefik
- Serve media files from NGINX

---

## 🤖 Traefik ForwardAuth

Requests to protected services pass through this label:

```yml
- "traefik.http.middlewares.forward-auth-baserow.forwardauth.address=https://core.leonobitech.com/security/verify-admin"
```

Make sure your Core Auth service validates cookies like `accessKey`, `clientKey`, and `clientMeta`.

---

## 🔓 Permisos de Archivos Subidos (FILE_UPLOAD_PERMISSIONS)

Baserow (Django) ignora la variable `UMASK` al crear archivos subidos. Por defecto crea archivos con permisos `600` (solo lectura del owner), lo que impide que nginx pueda servirlos.

**Solución:** Agregar `FILE_UPLOAD_PERMISSIONS=0o644` en los servicios que manejan uploads:
- `baserow_backend`
- `baserow_celery`
- `baserow_celery_export_worker`
- `baserow_celery_beat`

**Sintomas del problema:**
- Upload retorna 200 OK con URL valida
- El archivo existe en `/baserow/media/user_files/`
- Acceder a la URL retorna 403 Forbidden

**Verificacion:**
```bash
# Verificar permisos de archivos recientes
docker exec baserow_backend ls -la /baserow/media/user_files/ | tail -10

# Los archivos deben tener -rw-r--r-- (644), no -rw------- (600)
```

---

## 👀 Contribute

This system is ideal for multi-tenant SaaS, microservices-based CRM backends, and secure app distribution platforms. Pull requests welcome!

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)