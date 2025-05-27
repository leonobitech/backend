FROM baserow/baserow:1.33.3

# Instala las herramientas necesarias
RUN apt-get update && apt-get install -y \
    python3-pip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Instala gunicorn y celery
RUN pip3 install gunicorn celery

# Copia tu script de inicio personalizado
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
CMD ["start"]#!/bin/bash

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

