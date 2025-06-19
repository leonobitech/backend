FROM odoo:latest

USER root

RUN apt-get update && apt-get install -y \
    gsfonts \
    fonts-urw-base35 \
    && rm -rf /var/lib/apt/lists/*

USER odoo