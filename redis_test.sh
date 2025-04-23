#!/bin/bash
set -e

# 📦 Extraer variables desde archivos .env
REDIS_PASSWORD=$(grep ^REDIS_PASSWORD repositories/redis/.env | cut -d '=' -f2)
REDIS_DATABASES=$(grep ^REDIS_DATABASES repositories/redis/.env | cut -d '=' -f2)
REDIS_DB=$(grep ^REDIS_DB repositories/core/.env | cut -d '=' -f2)

# 🔥 Eliminar contenedor, volumen e imagen anteriores
echo "🧹 Limpiando entorno Redis..."
docker rm -f redis_core 2>/dev/null || true
docker volume rm redis_core_data 2>/dev/null || true
docker rmi -f redis:latest 2>/dev/null || true

# 🚀 Levantar nuevo contenedor Redis
echo "🚀 Levantando Redis desde cero..."
docker run -d --name redis_core \
  -e REDIS_PASSWORD=$REDIS_PASSWORD \
  -e REDIS_DATABASES=$REDIS_DATABASES \
  -v redis_core_data:/data \
  --health-cmd='redis-cli ping' \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=5 \
  redis:latest \
  redis-server --requirepass $REDIS_PASSWORD --databases $REDIS_DATABASES

# ⏳ Esperar que esté healthy
echo "⏳ Esperando a que Redis esté saludable..."
until [ "$(docker inspect -f '{{.State.Health.Status}}' redis_core)" = "healthy" ]; do
  sleep 1
done

# 🔐 Autenticación y pruebas internas desde el contenedor
echo "🔐 Autenticando y haciendo pruebas dentro del contenedor..."

docker exec redis_core redis-cli -a "$REDIS_PASSWORD" SELECT "$REDIS_DB"
docker exec redis_core redis-cli -a "$REDIS_PASSWORD" SET mytest "core-ready" EX 60
RESULT=$(docker exec redis_core redis-cli -a "$REDIS_PASSWORD" GET mytest)

echo "🔎 Resultado de GET mytest: $RESULT"

echo "✅ Redis está 100% funcional y listo."
exit 0
