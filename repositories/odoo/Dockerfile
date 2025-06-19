# Dockerfile (misma carpeta donde haces docker compose)
FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y \
      ghostscript \
      gsfonts \
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Font \
 && cp /usr/share/fonts/type1/gsfonts/*.pfb \
       /usr/share/fonts/type1/gsfonts/*.afm \
       /usr/share/ghostscript/10.02.1/Resource/Font/ \
 && fc-cache -fv \
 && rm -rf /var/lib/apt/lists/*

USER odoo
