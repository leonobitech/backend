FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies separately to leverage caching
FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev

FROM base AS build
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm install
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Copy RSA keys and JWKS (generated during build)
COPY keys ./keys

EXPOSE 8200
CMD ["node", "dist/index.mjs"]
