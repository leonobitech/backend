#!/bin/bash
set -e

echo "🛑 Deteniendo y eliminando todos los contenedores..."
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true

echo "🧹 Eliminando todas las imágenes..."
docker rmi -f $(docker images -aq) 2>/dev/null || true

echo "🧼 Eliminando todos los volúmenes..."
docker volume rm $(docker volume ls -q) 2>/dev/null || true

echo "🔌 Eliminando redes personalizadas (no bridge/host/none)..."
docker network rm $(docker network ls | grep -v 'bridge\|host\|none' | awk '{ print $1 }') 2>/dev/null || true

echo "✅ Entorno Docker completamente limpio."
