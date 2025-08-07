# 🧠 Leonobitech Backend Monorepo

This is the **official backend monorepo** for the Leonobitech platform.

It follows a **modular microservices architecture**, powered by:
- ⚡ **Traefik** as reverse proxy with automatic HTTPS via Let's Encrypt
- 🔐 **core** microservice (authentication, sessions, token issuance)
- 🧠 **n8n** microservice (workflow automation, webhook processing)
- 🚀 **Redis** as secure token cache with logical DBs
- 🐳 Full **Docker Compose** support for local and production deployment

---

## 📁 Project Structure

```txt
backend/                        # Project root
├── docker-compose.yml          # Production-ready Docker Compose with Traefik
├── .env                        # Global env config (domain, email SSL, etc.)
├── Makefile                    # Developer-friendly CLI tasks
├── traefik/                    # Traefik config
│   ├── traefik.yml             # Static configuration
│   └── acme.json               # SSL cert storage (auto-generated)
└── repositories/               # All microservices live here
    ├── core/                   # 🧠 Main backend microservice (auth/session)
    ├── n8n/                    # ⚙️ Workflow automation (queue, webhooks, workers)
    └── redis/                  # 🔌 Redis config (.env + usage docs)
```

---

## 🚀 Getting Started (Dev & Prod)

### 1. Clone the repo

```bash
git clone https://github.com/leonobitech/backend.git
cd backend
```

### 2. Update the environment

Copy and edit `.env`:

```bash
cp .env.example .env
```

And update:

```env
DOMAIN_NAME=yourdomain.com
SSL_EMAIL=you@example.com
```

---

## 🐳 Running with Docker Compose

### 🔥 Build & launch all services

```bash
docker compose --env-file .env up -d --build
```

### 🧼 Stop & clean everything

```bash
docker compose down -v --remove-orphans
```

### 🧪 Test Redis separately

```bash
make reset-test-redis
```

---

## 🛠️ Makefile Commands

```bash
make build            # Build a single service
make run              # Run locally (maps .env & ports)
make clean            # Remove image
make reset            # Full clean & rebuild
make reset-test-redis # Reset + test Redis in isolation
```

---

## 🔐 Subdomain Routing (Traefik)

Each service is mapped to a subdomain:

| Service | URL                              |
|---------|----------------------------------|
| core    | https://core.leonobitech.com     |
| n8n     | https://n8n.leonobitech.com      |
| redis   | internal only                    |
| traefik | https://traefik.leonobitech.com (optional) |

---

## 📦 Features

- ✅ Modular microservices under `/repositories`
- 🔐 Authentication & Session Management (core)
- ⚙️ Scalable workflow automation with n8n (workers, webhook queues)
- ♻️ Token lifecycle via Redis (DB 2)
- ☁️ HTTPS with Let's Encrypt (Traefik)
- 🧪 Health checks per service
- 🧹 Docker cleanup scripts
- ⚙️ Production-grade settings

---

## ✨ Maintained by:

**Leonobitech Dev Team**  
https://www.leonobitech.com  
Made with 🧠, 🥷, and Docker love 🐳
