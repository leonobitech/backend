
# Chatwoot Multithreaded Worker Setup with Docker Compose

This guide documents how to scale Chatwoot's background processing capabilities using **multiple Sidekiq workers**, enhancing responsiveness and throughput in high-demand environments.

## 💡 Why Multiple Workers?

Chatwoot uses Sidekiq to handle background jobs such as:

- Incoming WhatsApp messages
- Email processing
- Scheduled jobs (notifications, conversation triggers)
- Webhooks and CRM sync
- Media uploads or email replies

Splitting Sidekiq into multiple queues and assigning different workers optimizes concurrency, reduces latency, and avoids bottlenecks under load.

---

## ⚙️ Final Docker Compose Setup

```yaml
chatwoot:
  image: chatwoot/chatwoot:latest
  container_name: chatwoot
  restart: unless-stopped
  env_file:
    - ./repositories/chatwoot/.env
  environment:
    - POSTGRES_HOST=${POSTGRES_HOST_CW}
    - POSTGRES_PORT=${POSTGRES_PORT_CW}
    - POSTGRES_DATABASE=${POSTGRES_DATABASE_CW}
    - POSTGRES_USERNAME=${POSTGRES_USERNAME_CW}
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD_CW}
  command: >
    sh -c "rm -f tmp/pids/server.pid &&
           bundle exec rails db:chatwoot_prepare &&
           bundle exec rails s -b 0.0.0.0 -p 3000"
  volumes:
    - chatwoot_data:/app/storage
  depends_on:
    - postgres_chatwoot
    - redis_chatwoot
  networks:
    - leonobitech-net

chatwoot-worker-default:
  image: chatwoot/chatwoot:latest
  container_name: chatwoot-worker-default
  restart: unless-stopped
  env_file:
    - ./repositories/chatwoot/.env
  command: ["bundle", "exec", "sidekiq", "-q", "default", "-q", "mailers"]
  depends_on:
    - postgres_chatwoot
    - redis_chatwoot
  networks:
    - leonobitech-net
  volumes:
    - chatwoot_data:/app/storage

chatwoot-worker-low:
  image: chatwoot/chatwoot:latest
  container_name: chatwoot-worker-low
  restart: unless-stopped
  env_file:
    - ./repositories/chatwoot/.env
  command: ["bundle", "exec", "sidekiq", "-q", "low"]
  depends_on:
    - postgres_chatwoot
    - redis_chatwoot
  networks:
    - leonobitech-net
  volumes:
    - chatwoot_data:/app/storage

chatwoot-worker-scheduler:
  image: chatwoot/chatwoot:latest
  container_name: chatwoot-worker-scheduler
  restart: unless-stopped
  env_file:
    - ./repositories/chatwoot/.env
  command: ["bundle", "exec", "sidekiq", "-q", "scheduled_jobs"]
  depends_on:
    - postgres_chatwoot
    - redis_chatwoot
  networks:
    - leonobitech-net
  volumes:
    - chatwoot_data:/app/storage
```

---

## 🧠 Queue Roles

| Worker                      | Queues Handled         | Role Description                               |
|-----------------------------|------------------------|------------------------------------------------|
| `chatwoot-worker-default`   | `default`, `mailers`   | Core tasks, email delivery                     |
| `chatwoot-worker-low`       | `low`                  | Async updates, webhook callbacks, less urgent  |
| `chatwoot-worker-scheduler` | `scheduled_jobs`       | Cron tasks, cleanup, triggers                  |

---

## 📈 Performance Tips

- Use `--concurrency` flag in production to increase Sidekiq threads (advanced)
- Monitor Sidekiq queues via Chatwoot's `/sidekiq` panel (requires admin + env var)
- Mount Prometheus + Grafana for metrics if needed

---

## 🧪 Test It

1. Send a WhatsApp message
2. Trigger an email from Chatwoot
3. Schedule an auto-responder or use the contact import feature

Monitor `docker compose logs -f chatwoot-worker-*` to observe queue distribution.

---

## 📝 Credits

Maintained by **Leonobitech Stack Team**  
Based on official [Chatwoot Worker Guide](https://www.chatwoot.com/docs)

---
