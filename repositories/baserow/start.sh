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
CMD ["start"]
