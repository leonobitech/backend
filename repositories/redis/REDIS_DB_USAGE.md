# 📦 Redis Logical DB Usage – Leonobitech

This document defines how Redis databases (0–15) are used across Leonobitech microservices.  
Redis supports 16 logical databases by default, accessible via `SELECT N` (where N = 0..15).

---

## ⚙️ Redis Configuration via Docker Compose

The Redis service is defined in the main `docker-compose.yml` file.

It pulls configuration from this file:

```
/repositories/redis/.env
```

### .env contents (used to boot the Redis server):

```env
REDIS_PASSWORD=supersecretpassword123
REDIS_DATABASES=16
```

These variables are used in `docker-compose.yml` like so:

```yaml
command: redis-server --requirepass ${REDIS_PASSWORD} --databases ${REDIS_DATABASES}
```

---

## 🤝 Redis Client Configuration in `core`

The `core` microservice has its own `.env` that configures how it connects to Redis.

Located in:

```
/repositories/core/.env
```

### .env contents (used by the Node.js Redis client):

```env
# Redis
REDIS_HOST=redis                       # 👈 Docker Compose service name
REDIS_PORT=6379                        # 👈 Redis default port
REDIS_PASSWORD=supersecretpassword123  # 👈 Must match the one in redis/.env
REDIS_DB=2                             # 👈 Logical DB selected by core
```

---

## 🧠 Difference Between `REDIS_DATABASES` and `REDIS_DB`

Although they look similar, they serve **completely different purposes**:

| Variable            | Used by                           | Purpose                                                 |
|---------------------|-----------------------------------|---------------------------------------------------------|
| `REDIS_DATABASES=16`| 🧱 **Redis server**               | Defines how many logical DBs Redis starts with.(`0–15`) |
| `REDIS_DB=2`        | 🧠 **Redis client (e.g. `core`)** | Specifies which DB the client should use.               |

---

### 🏢 Metaphor

Think of Redis as a **building with floors**:

- `REDIS_DATABASES=16` → “Build me a 16-floor building”
- `REDIS_DB=2` → “I (auth) will operate from floor 2”

Each microservice can operate on its own “floor” (logical DB), **without affecting others**.

---

### ✅ Real Use in Leonobitech

- Redis is launched with `16` databases:
  ```env
  REDIS_DATABASES=16
  ```

- `core` connects to and uses DB `2`:
  ```env
  REDIS_DB=2
  ```

- `notifications` might use DB `3`, and so on.

This design allows all services to **share one Redis instance safely**, while keeping their data isolated.

---

## 📘 Logical DB Assignments

| DB Number | Assigned To      |                Purpose                  |
|-----------|------------------|-----------------------------------------|
| `0`       | (default)        | ⚠️ Avoid using, reserved for test/debug |
| `1`       | -                | Available                               |
| `2`       | `core`           | clientKey & accessKey cache (TTL-based) |
| `3`       | `notifications`  | Message queues (BullMQ)                 |
| `4`       | rate-limiter     | Request throttling                      |
| `5`–`15`  | (future use)     | Available                               |

---

## ✅ Notes

- Redis DBs are isolated from each other: `core` can't read data from `notifications` and vice versa.
- Be explicit about which DB a service should use.
- Document your usage to avoid collisions.

---

Maintained by the **Leonobitech Development Team** ✨
