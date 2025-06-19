# Dockerfile (reemplaza al anterior)
FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # 1) Asegurate de la carpeta donde GS busca sus Type-1 de recursos
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Font \
 \
 # 2) Crea los archivos vacíos con el nombre que busca el warning
 && touch \
      /usr/share/ghostscript/10.02.1/Resource/Font/Courier.pfb \
      /usr/share/ghostscript/10.02.1/Resource/Font/Courier.afm \
 \
 # 3) Limpieza
 && rm -rf /var/lib/apt/lists/*

USER odoo
