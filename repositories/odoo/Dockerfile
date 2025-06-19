# Dockerfile
FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y \
      ca-certificates \
      curl \
      ghostscript \
      gsfonts \
      tar \
      unzip \
 && mkdir -p /usr/share/fonts/type1/gsfonts \
 \
 # 1) Descarga el tarball oficial de las PostScript Base 35 (Type 1)
 && curl -fsSL -o /tmp/gs-fonts.tar.gz \
      "https://downloads.sourceforge.net/project/gs-fonts/gs-fonts/8.11%20%28base%2035%2C%20GPL%29/ghostscript-fonts-std-8.11.tar.gz" \
 \
 # 2) Extrae sólo Courier.afm y Courier.pfb
 && tar -xzf /tmp/gs-fonts.tar.gz \
       --strip-components=3 \
       -C /usr/share/fonts/type1/gsfonts \
       ghostscript-fonts-std-8.11/Resource/Font/Courier.afm \
       ghostscript-fonts-std-8.11/Resource/Font/Courier.pfb \
 \
 # 3) Reconstruye la caché de fuentes
 && fc-cache -fv \
 \
 # 4) Limpia temporales y APT
 && rm -rf /tmp/gs-fonts.tar.gz /var/lib/apt/lists/*

USER odoo
