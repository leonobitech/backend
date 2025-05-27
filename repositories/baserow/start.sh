#!/bin/bash

echo "🚀 Iniciando Baserow custom con bind 0.0.0.0"

# Forzar gunicorn a escuchar en 0.0.0.0:8000
export GUNICORN_CMD_ARGS="--bind=0.0.0.0:8000"

# Verificar si se pasa el comando `start` (flujo principal)
if [[ "$1" == "start" ]]; then
  echo "🔑 Ejecutando Baserow con comando: start"
  exec /baserow/docker-entrypoint.sh start
else
  # Si no es start, pasar cualquier otro comando a docker-entrypoint
  echo "🔧 Ejecutando Baserow con comando: $@"
  exec /baserow/docker-entrypoint.sh "$@"
fi
