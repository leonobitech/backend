FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # Asegura carpeta de init
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Init \
 \
 # 🎯 Crea Fontmap.local para redireccionar /Courier
 && echo "/Courier /NimbusMonoPS-Regular def" > /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 && echo "/Courier-Bold /NimbusMonoPS-Bold def" >> /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 \
 # Limpieza
 && rm -rf /var/lib/apt/lists/*

USER odoo
