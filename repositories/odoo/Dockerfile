FROM odoo:latest

USER root

# Instala Ghostscript y gsfonts, configura symlinks y Fontmap.local
RUN apt-get update \
 && apt-get install -y ghostscript gsfonts \
 \
 # Crea carpetas necesarias para Ghostscript
 && mkdir -p /usr/share/ghostscript/10.02.1/Resource/Init \
 && mkdir -p /usr/share/ghostscript/fonts \
 && mkdir -p /usr/share/fonts/type1/gsfonts \
 \
 # Define Fontmap.local con alias Courier
 && echo "/Courier /NimbusMonoPS-Regular def" > /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 && echo "/Courier-Bold /NimbusMonoPS-Bold def" >> /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 && echo "/Courier-Oblique /NimbusMonoPS-Italic def" >> /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 && echo "/Courier-BoldOblique /NimbusMonoPS-BoldItalic def" >> /usr/share/ghostscript/10.02.1/Resource/Init/Fontmap.local \
 \
 # Symlinks para Ghostscript
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Regular.pfb    /usr/share/ghostscript/fonts/Courier.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Bold.pfb       /usr/share/ghostscript/fonts/Courier-Bold.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Italic.pfb     /usr/share/ghostscript/fonts/Courier-Oblique.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-BoldItalic.pfb /usr/share/ghostscript/fonts/Courier-BoldOblique.pfb \
 \
 # Symlinks para ReportLab (ruta que suele usar internamente)
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Regular.pfb    /usr/share/fonts/type1/gsfonts/Courier.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Bold.pfb       /usr/share/fonts/type1/gsfonts/Courier-Bold.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-Italic.pfb     /usr/share/fonts/type1/gsfonts/Courier-Oblique.pfb \
 && ln -sf /usr/share/fonts/X11/Type1/NimbusMonoPS-BoldItalic.pfb /usr/share/fonts/type1/gsfonts/Courier-BoldOblique.pfb \
 \
 # Limpieza
 && rm -rf /var/lib/apt/lists/*

# Variables de entorno para ayudar a Ghostscript
ENV GS_FONTPATH=/usr/share/ghostscript/fonts
ENV GS_LIB=/usr/share/ghostscript/10.02.1/Resource/Init

USER odoo
