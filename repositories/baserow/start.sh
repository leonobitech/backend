#!/bin/bash

echo "🚀 Iniciando Baserow custom con bind 0.0.0.0"

# Forzar gunicorn a escuchar en 0.0.0.0:8000
export GUNICORN_CMD_ARGS="--bind=0.0.0.0:8000"

# Iniciar el backend
echo "🔑 Iniciando backend (gunicorn) en 0.0.0.0:8000"
gunicorn --bind 0.0.0.0:8000 baserow.wsgi:application &

# Iniciar el frontend
echo "🌐 Iniciando frontend"
cd /baserow/web-frontend
npm run build
npm run start &

# Iniciar el worker
echo "⚙️ Iniciando worker"
cd /baserow/backend
celery -A baserow worker --loglevel=INFO &

# Mantener el contenedor vivo
echo "✅ Todos los servicios iniciados. Esperando..."
tail -f /dev/null
