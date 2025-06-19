FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # Asegura carpeta de init y crea Fontmap.local para redireccionar /Courier
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Init \
 && echo "/Courier /NimbusMonoPS-Regular def" > /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 && echo "/Courier-Bold /NimbusMonoPS-Bold def" >> /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 \
 # Limpieza
 && rm -rf /var/lib/apt/lists/*

# NUEVA SECCIÓN: Crear symlinks para que Ghostscript encuentre los archivos .pfb de Courier
# Symlinks de fuentes
RUN mkdir -p /usr/share/ghostscript/fonts \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Regular.pfb      /usr/share/ghostscript/fonts/Courier.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Bold.pfb         /usr/share/ghostscript/fonts/Courier-Bold.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Italic.pfb       /usr/share/ghostscript/fonts/Courier-Oblique.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-BoldItalic.pfb   /usr/share/ghostscript/fonts/Courier-BoldOblique.pfb

# 🔧 Variables de entorno para forzar los paths de Ghostscript
ENV GS_FONTPATH=/usr/share/ghostscript/fonts
ENV GS_LIB=/usr/share/ghostscript/10.02.1/Resource/Init

USER odoo
