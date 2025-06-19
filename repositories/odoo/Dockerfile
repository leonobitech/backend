FROM odoo:latest

USER root

RUN apt-get update && apt-get install -y \
    gsfonts \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

USER odoo
