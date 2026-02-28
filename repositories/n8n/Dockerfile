FROM n8nio/n8n:latest

# Must run as root since node_modules is owned by root
USER root

# Install sharp for image processing in Code nodes (Alpine = musl libc)
RUN cd /usr/local/lib/node_modules/n8n && npm install --os=linux --libc=musl --cpu=x64 sharp

# Apply Anthropic prompt caching patch at build time
COPY patches/prompt-caching-patch.js /opt/patches/prompt-caching-patch.js
RUN node /opt/patches/prompt-caching-patch.js

USER node
