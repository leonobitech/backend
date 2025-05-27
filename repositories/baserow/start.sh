#!/bin/bash

echo "🚀 Iniciando Baserow custom con bind 0.0.0.0"

# Forzar gunicorn a escuchar en 0.0.0.0:8000
export GUNICORN_CMD_ARGS="--bind=0.0.0.0:8000"

echo "🔑 Ejecutando comando oficial: start"
exec /baserow/docker/docker-entrypoint.sh start
