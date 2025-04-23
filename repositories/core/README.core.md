# 🧠 Leonobitech Core Microservice

This is the **core microservice** of the Leonobitech backend architecture.  
It encapsulates the primary business logic and handles secure API interactions, session validation, and token-based authentication across the system.

---

## 🧩 Responsibilities

- Business logic orchestration  
- Session & token validation (JWE + Redis TTL)  
- Secure authentication handshake  
- Device fingerprint tracking  
- Request metadata processing (IP, platform, etc.)

---

## 📁 Project Structure

```
backend/                        # Root of the backend monorepo
├── docker-compose.yml          # Global orchestration: Traefik + services
├── .env                        # Global environment config (domain, cert email, etc.)
│
├── traefik/                    # Reverse proxy (Traefik)
│   ├── traefik.yml             # Static Traefik configuration
│   └── acme.json               # SSL certificates (generated automatically)
│
└── repositories/               # Folder for microservices and infrastructure
    ├── core/                   # 🧠 Core microservice (auth, session, security logic)
    │   ├── Dockerfile          # Multi-stage Dockerfile for production
    │   ├── .env                # Local environment config (gitignored)
    │   ├── keys/               # PEM keypair for signing/encryption
    │   └── src/
    │       └── index.mjs       # Express ESM entrypoint
    │
    └── redis/                  # ⚡ Redis service used by core (token caching)
        ├── .env                # Configuration (password, logical DBs)
        └── REDIS_DB_USAGE.md   # Logical DB usage mapping (core, rate-limit, etc.)
```

---

## 🚀 Makefile Commands

All commands are executed from the root of the `backend/` repo.

### 🔨 Build the container

```bash
make build SERVICE=core
```

Builds `leonobitech/core:latest`.

---

### ♻️ Rebuild without cache

```bash
make rebuild SERVICE=core
```

---

### 🧪 Run the container

```bash
make run SERVICE=core PORT=8000
```

- Uses `repositories/core/.env`
- Maps to `localhost:8000`
- Automatically replaces old containers if running

➡️ Test via: [http://localhost:8000/health](http://localhost:8000/health)

---

### 🛑 Stop and clean

```bash
make clean SERVICE=core
```

Or manually:

```bash
docker stop core
docker rm core
```

---

## ⚙️ Environment Variables

Configure the `.env` inside:

```
/repositories/core/.env
```

Use `.env.example` as a starting point.

Example:

```env
PORT=8000
API_ORIGIN=https://core.leonobitech.com
APP_ORIGIN=https://www.leonobitech.com
```

---

## 🌐 Domains & Routing (via Traefik)

| Subdomain                  | Service     | Description                    |
|---------------------------|-------------|--------------------------------|
| `core.leonobitech.com`    | `core`      | Main business/auth microservice |
| `redis` (internal only)   | `redis_core`| Redis cache used by core       |

All services are automatically routed and secured via TLS using **Traefik**.

---

## 🔐 Security Practices

- `.env` files are **not committed**; use `.env.example` templates
- Redis DBs are **isolated** per service
- All traffic routed through HTTPS via Traefik
- JWT keys and secrets stored securely under `core/keys/`

---

## 🛠️ Requirements

- Docker & Docker Compose  
- `make` utility (optional)  
- Node.js 18+ for local development  
- Redis running (Docker or external)  
- Traefik configured and running as reverse proxy

---

## 📘 Internal Docs

- [Core Microservice README](./repositories/core/README.core.md)

## 📘 Redis Cache (TTL-based)

- [Redis DB Usage](./repositories/redis/REDIS_DB_USAGE.md) for logical database assignment.

---

## 👥 Maintainers

Developed with 💻 by the **Leonobitech** team  
[https://www.leonobitech.com](https://www.leonobitech.com)

---

> Need help? Open an issue or ping us on Discord.
