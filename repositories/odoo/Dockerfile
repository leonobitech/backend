FROM odoo:latest
USER root

RUN apt-get update \
 && apt-get install -y \
      ghostscript \
      gsfonts \
      fonts-urw-base35 \
 && fc-cache -fv \
 && rm -rf /var/lib/apt/lists/*