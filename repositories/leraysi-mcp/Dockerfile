# ============================================
# Dockerfile for odoo-mcp
# MCP server for Odoo with OAuth2 authentication
# ============================================

FROM node:22-alpine AS base
LABEL maintainer="Leonobitech <felix@leonobitech.com>"
LABEL description="MCP server for Odoo - Control your Odoo CRM from Claude Desktop"
WORKDIR /app

# ============================================
# Dependencies stage - leverages layer caching
# ============================================
FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev

# ============================================
# Build stage - compiles TypeScript
# ============================================
FROM base AS build
COPY package*.json tsconfig.json tsup.config.ts ./
COPY src ./src
COPY prisma ./prisma
COPY public ./public
RUN npm install
RUN npm run db:generate
RUN npm run build

# ============================================
# Runner stage - production image
# ============================================
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public

EXPOSE 8100

CMD ["node", "dist/index.mjs"]
