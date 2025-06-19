# Dockerfile
FROM odoo:latest
USER root

RUN apt-get update \
 && apt-get install -y \
      ghostscript \
      gsfonts \
      curl \
      unzip \
 && mkdir -p /usr/share/fonts/type1/gsfonts \
 \
 # 1) Descargá PFB + AFM de Courier
 && curl -Lo /usr/share/fonts/type1/gsfonts/cour.pfb \
      https://github.com/ArtifexSoftware/ghostpdl-downloads/raw/master/fonts/cour.pfb \
 && curl -Lo /usr/share/fonts/type1/gsfonts/cour.afm \
      https://github.com/ArtifexSoftware/ghostpdl-downloads/raw/master/fonts/cour.afm \
 \
 # 2) Reconstruí la caché de fuentes
 && fc-cache -fv \
 \
 # 3) Limpieza
 && rm -rf /var/lib/apt/lists/*

USER odoo
