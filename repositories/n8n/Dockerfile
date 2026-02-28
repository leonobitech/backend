FROM n8nio/n8n:latest

# Must run as root since node_modules is owned by root
USER root

# Install sharp for image processing in Code nodes
# Build in /tmp to avoid pnpm catalog: protocol conflict, then copy to n8n node_modules
RUN cd /tmp && \
    npm init -y > /dev/null 2>&1 && \
    npm install --os=linux --libc=musl --cpu=x64 sharp && \
    rm -rf /usr/local/lib/node_modules/n8n/node_modules/sharp && \
    cp -r /tmp/node_modules/sharp /usr/local/lib/node_modules/n8n/node_modules/sharp && \
    cp -r /tmp/node_modules/@img /usr/local/lib/node_modules/n8n/node_modules/ 2>/dev/null; \
    rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json

# Apply Anthropic prompt caching patch at build time
COPY patches/prompt-caching-patch.js /opt/patches/prompt-caching-patch.js
RUN node /opt/patches/prompt-caching-patch.js

USER node
