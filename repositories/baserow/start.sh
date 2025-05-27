#!/bin/bash

echo "🚀 Iniciando Baserow custom con 0.0.0.0 en gunicorn"

# Iniciar el backend (gunicorn) en 0.0.0.0
echo "🔑 Iniciando backend (gunicorn) en 0.0.0.0:8000"
gunicorn --bind 0.0.0.0:8000 baserow.wsgi:application &

# Iniciar el frontend
echo "🌐 Iniciando frontend"
cd /baserow/web-frontend
npm run build
npm run serve &

# Iniciar el worker (celery)
echo "⚙️ Iniciando worker"
cd /baserow/backend
celery -A baserow worker --loglevel=INFO &

# Mantener el contenedor en ejecución
echo "✅ Todos los servicios iniciados. Esperando..."
tail -f /dev/null
