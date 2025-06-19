FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # 1) Crea el init de Ghostscript para mapeos de font
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Init \
 \
 # 2) Mapea Courier -> Helvetica (ya está disponible)
 && printf "/Courier /Helvetica\n/Courier-Bold /Helvetica-Bold\n" \
     > /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 \
 # 3) Limpia listas APT
 && rm -rf /var/lib/apt/lists/*

USER odoo
