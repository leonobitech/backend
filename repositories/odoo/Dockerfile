FROM odoo:latest

USER root

RUN apt-get update \
 && apt-get install -y \
      wget \
      ghostscript \
      ca-certificates \
 && wget -qO /tmp/gsfonts.deb \
      http://archive.ubuntu.com/ubuntu/pool/universe/g/gsfonts/gsfonts_8.11+urwcyr1.0.7~pre44-4.5_all.deb \
 && dpkg -i /tmp/gsfonts.deb \
 && rm /tmp/gsfonts.deb \
 && fc-cache -fv \
 && rm -rf /var/lib/apt/lists/*

USER odoo
