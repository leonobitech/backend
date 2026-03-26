FROM n8nio/n8n:2.9.4

# Apply Anthropic prompt caching patch at build time
# Must run as root since node_modules is owned by root
USER root
COPY patches/prompt-caching-patch.js /opt/patches/prompt-caching-patch.js
RUN node /opt/patches/prompt-caching-patch.js
USER node
