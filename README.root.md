# 🧱 Leonobitech Backend – Production-Ready Architecture

This is the official monorepo for the **Leonobitech Backend**, built for modularity, performance, and security using Docker Compose and Traefik.  
Designed for real-world deployments with automatic HTTPS, service isolation, Redis caching, and a clean CI/CD-ready structure.

---

## 📦 Overview

```
backend/
├── .env                            # Global config (SSL email for certs)
├── docker-compose.prod.yml         # Production-ready orchestration
│
├── traefik/
│   ├── traefik.yml                 # Static configuration for Traefik
│   └── acme.json                   # Let's Encrypt certificates (chmod 600)
│
└── repositories/
    ├── core/                       # 🧠 Main business logic & auth microservice
    │   ├── .env.example
    │   ├── Dockerfile
    │   ├── .dockerignore
    │   ├── README.core.md
    │   ├── keys/                   # PEM keypair (ignored in Git)
    │   └── src/index.mjs
    │
    └── redis/                      # ⚡ Redis instance for token caching
        ├── .env
        └── REDIS_DB_USAGE.md
```

---

## 🚀 docker-compose.prod.yml

This file orchestrates the following services:

### 🔐 core

```yaml
core:
  container_name: core
  build:
    context: ./repositories/core
  image: leonobitech/core:latest
  restart: unless-stopped
  env_file:
    - ./repositories/core/.env
  volumes:
    - ./repositories/core/keys:/app/keys:ro
  networks:
    - leonobitech-net
  depends_on:
    redis_core:
      condition: service_healthy
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.core.rule=Host(`core.leonobitech.com`)"
    - "traefik.http.routers.core.entrypoints=websecure"
    - "traefik.http.routers.core.tls.certresolver=le"
    - "traefik.http.services.core.loadbalancer.server.port=8000"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 10s
```

### 🧠 redis_core

```yaml
redis_core:
  image: redis:7.2-alpine
  container_name: redis_core
  restart: unless-stopped
  env_file:
    - ./repositories/redis/.env
  command: redis-server --requirepass ${REDIS_PASSWORD} --databases ${REDIS_DATABASES}
  volumes:
    - redis_core_data:/data
  networks:
    - leonobitech-net
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s
```

### 🔀 traefik

```yaml
traefik:
  image: traefik:v2.11
  container_name: traefik
  restart: unless-stopped
  command:
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--certificatesresolvers.le.acme.tlschallenge=true"
    - "--certificatesresolvers.le.acme.email=${SSL_EMAIL}"
    - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./traefik/acme.json:/letsencrypt/acme.json
  networks:
    - leonobitech-net
```

---

## 🌐 Networks

```yaml
networks:
  leonobitech-net:
    name: leonobitech-net
    driver: bridge
```

---

## 📜 Common Commands

```bash
# ⬆️ Start all services
docker compose -f docker-compose.prod.yml up --build -d

# 🔁 Rebuild and restart core
docker compose -f docker-compose.prod.yml up --build core

# ⛔ Stop all services
docker compose -f docker-compose.prod.yml down

# 🔍 Logs
docker logs core

# 🧠 Redis CLI access
docker exec -it redis_core redis-cli -a <your_password>
```

---

## 🛡️ Security Highlights

- All services run with `no-new-privileges` and/or `read_only`, using `tmpfs` for volatile paths.
- Redis is isolated by logical DBs and password protected.
- Only explicitly labeled services are exposed by Traefik.
- HTTPS is enforced by default with automatic TLS via Let's Encrypt.
- Sensitive files (`.env`, PEM keys, etc.) are ignored by Git.

---

## 🧼 Maintenance

```bash
# 🧽 Remove stopped containers
docker container prune

# 🧽 Remove unused volumes
docker volume prune

# 🔥 Reset all (containers, images, volumes)
docker system prune -a --volumes
```

---

## 📘 Internal Docs

- [README.core.md](./repositories/core/README.core.md)
- [Redis DB Mapping](./repositories/redis/REDIS_DB_USAGE.md)

---

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)
