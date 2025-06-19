# Dockerfile (misma carpeta que tu docker-compose.yml)
FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y \
      ghostscript \
      gsfonts \
      fonts-nimbus-mono \
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Init \
 \
 # 1) Alias: mapea "Courier" al NimbusMono (que ya existe)
 && printf "/Courier /NimbusMonoPS-Regular\n/Courier-Bold /NimbusMonoPS-Bold\n" \
     > /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 \
 # 2) Limpia y reconstruye caché de fuentes
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -fv

USER odoo
