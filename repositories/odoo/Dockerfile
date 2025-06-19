# Dockerfile para silenciar el warning de Courier
FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # 1) Creamos la carpeta Init si no existe
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Init \
 \
 # 2) Mapeamos Courier al URW Base35 que ya está instalado
 && printf "/Courier /C059-Roman ;\n/Courier-Bold /C059-Bold ;\n" \
     > /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 \
 # 3) Limpieza
 && rm -rf /var/lib/apt/lists/*

USER odoo
