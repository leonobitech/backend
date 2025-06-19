FROM odoo:latest

USER root

# Instala las fuentes necesarias
RUN apt-get update && apt-get install -y \
    gsfonts \
    ghostscript \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Agrega Courier.pfb manualmente donde reportlab lo espera
RUN mkdir -p /usr/share/fonts/type1/gsfonts && \
    curl -o /usr/share/fonts/type1/gsfonts/cour.pfb https://github.com/ArtifexSoftware/ghostpdl-downloads/raw/master/fonts/cour.pfb

USER odoo
