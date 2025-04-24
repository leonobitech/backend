# 🧪 Leonobitech Dev Guide – Makefile vs Compose

This guide explains the difference between using `make` and `docker compose`  
in the **Leonobitech backend**, and when to use each depending on your goal.

---

## 🛠️ `make` – For Local Development

The `Makefile` provides quick commands to **work with individual services**, such as `core`.

### ✅ Common Dev Commands

```bash
make build SERVICE=core        # Build the Docker image
make run SERVICE=core          # Run the container locally
make stop SERVICE=core         # Stop the container
make clean SERVICE=core        # Remove image
make reset SERVICE=core        # Clean + remove container
```

Use these for:

- 🔁 Quick rebuilds
- 🔍 Debugging one service
- 👨‍💻 Isolated development before integration
- 🔬 Unit testing your service logic

---

## 🚀 `docker compose` – Full Stack Integration

Use `docker-compose.yml` to bring up the **entire backend infrastructure**:

```bash
docker compose -f docker-compose.yml up --build -d
```

This spins up:

- `traefik` (HTTPS reverse proxy)
- `core` (authentication microservice)
- `redis_core` (token cache layer)

---

## 🔍 When to Use Which?

| Use Case                        | Use `make`                | Use `docker compose`         |
|----------------------------------|----------------------------|-------------------------------|
| Develop/test only `core`         | ✅ Yes                     | ❌ Overkill                  |
| Full integration (Traefik, Redis)| ❌ Not supported            | ✅ Yes                       |
| Quick image rebuild              | ✅ Fast                    | ⚠️ Slower                   |
| Service isolation                | ✅ Yes                     | ❌ All or nothing            |
| Pre-deploy test                 | ❌                         | ✅ Realistic env             |

---

## 🧠 Pro Tip

Use `make` for:
> Rapid iterations, debugging, and working on one service at a time

Use `docker compose` for:
> Testing infrastructure as a whole, TLS routing, and production simulation

---

## 📦 Notes

- `make` reads from `./repositories/<SERVICE>/.env`
- `docker compose` reads from `.env` (root) and `.env` per service
- Don't forget to `chmod 600 traefik/acme.json` when using Let's Encrypt

---

Happy shipping!  
— **Leonobitech DevOps Team** ⚡