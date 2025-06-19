FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # 1) Asegurate de que exista el directorio
 && mkdir -p /usr/share/fonts/type1/gsfonts \
 \
 # 2) Creá los archivos dummy
 && touch /usr/share/fonts/type1/gsfonts/Courier.pfb \
          /usr/share/fonts/type1/gsfonts/Courier.afm \
 \
 # 3) Reconstruí la caché de fuentes (por las dudas)
 && fc-cache -fv \
 \
 # 4) Limpieza
 && rm -rf /var/lib/apt/lists/*

USER odoo
