# ⚙️ Leonobitech – n8n Microservice

This folder contains the production-ready configuration for the **n8n workflow automation** microservice within the Leonobitech platform.

Powered by Docker, Redis, PostgreSQL, and Traefik with scalable architecture support.

---

## 📦 Overview

This service runs:
- 🧠 A main n8n instance with the web editor (`n8n_main`)
- 🔀 A webhook worker (`n8n_webhook_1`) to enqueue external events
- 🛠️ A background task runner (`n8n_worker_1`) to execute jobs

All are coordinated through **Bull queue + Redis** and **PostgreSQL** as persistent storage.

---

## 🌐 Subdomain Routing

The Traefik reverse proxy exposes:

| Type        | URL                                 | Container         |
|-------------|--------------------------------------|-------------------|
| Editor UI   | https://n8n.leonobitech.com         | `n8n_main`        |
| Webhook     | https://n8n.leonobitech.com/webhook | `n8n_webhook_1`   |
| Test Hooks  | https://n8n.leonobitech.com/webhook-test | `n8n_main`   |

---

## 📁 Folder Structure

```
repositories/n8n/
├── .env.example              # All required environment variables
├── Dockerfile                # Shared Docker image for all n8n containers
├── README.n8n.md             # This file
```

---

## 🧠 Environment Variables (.env)

Here are the most important variables:

```dotenv
# Domain/subdomain config
DOMAIN_NAME=leonobitech.com
SUBDOMAIN=n8n

# Database
POSTGRES_DB=n8n
POSTGRES_USER=n8n
POSTGRES_PASSWORD=your_password
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres_n8n
DB_POSTGRESDB_PORT=5432

# Redis Queue
EXECUTIONS_MODE=queue
QUEUE_BULL_REDIS_HOST=redis_n8n
QUEUE_BULL_REDIS_PORT=6379
QUEUE_BULL_REDIS_PREFIX=bull

# Security
N8N_ENCRYPTION_KEY=long_secure_key
N8N_HOST=n8n.leonobitech.com
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.leonobitech.com/
```

---

## 🛠 Services

- `n8n_main`: Editor, webhook-test handling, system API
- `n8n_webhook_1`: External webhook ingestion
- `n8n_worker_1`: Offloaded job processor

---

## 🧪 Health Checks

Each container includes a healthcheck and is considered ready once:
- Postgres is available
- Redis is reachable
- n8n has initialized successfully

---

## 🚀 Deploy (via GitHub Actions)

Any commit to `main` triggers the workflow to:
- SSH into the VPS
- Pull the latest repo version
- Rebuild `n8n` containers
- Apply labels and reload Traefik

---

## 🧯 Notes

- Webhook `test` calls must hit `/webhook-test` so they go directly to `n8n_main`
- Production webhooks (`/webhook/...`) are distributed to the workers (`n8n_webhook_1` → queue → `n8n_worker_1`)

---

## 👥 Maintained by

Leonobitech DevOps ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)