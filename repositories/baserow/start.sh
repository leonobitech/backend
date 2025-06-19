#!/bin/bash

echo "🚀 Iniciando Baserow custom con bind 0.0.0.0"

export GUNICORN_CMD_ARGS="--bind=0.0.0.0:8000"

echo "🔑 Iniciando backend (gunicorn)"
gunicorn --bind 0.0.0.0:8000 baserow.wsgi:application &

echo "🌐 Iniciando frontend"
cd /baserow/web-frontend
npm run build
npm run start &

echo "⚙️ Iniciando worker"
cd /baserow/backend
celery -A baserow worker --loglevel=INFO &

echo "✅ Todos los servicios iniciados. Esperando..."
tail -f /dev/null
