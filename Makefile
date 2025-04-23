
# 📁 Leonobitech Makefile – Root level
ENV_FILE = .env

# 🐳 Compose orchestration
up:
	docker compose --env-file $(ENV_FILE) up -d --build

build:
	docker compose --env-file $(ENV_FILE) build

down:
	docker compose --env-file $(ENV_FILE) down

restart: down up

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

# 🔁 Rebuild específico
reset-core:
	docker compose build core && docker compose restart core

# 🧪 Test Redis desde cero
reset-redis:
	chmod +x redis_test.sh && ./redis_test.sh

# 🧹 Limpieza general de Docker
prune:
	chmod +x docker_clean_all.sh && ./docker_clean_all.sh

# 🧼 Clean image de un servicio (por nombre)
clean-image:
	docker rmi -f leonobitech/$(SERVICE):latest

# 🛑 Stop individual
stop:
	docker stop $(SERVICE)
