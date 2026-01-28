# 🔧 Build Stage
FROM node:24-slim AS builder

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos las dependencias
COPY package*.json ./
RUN npm install

# Copiamos el resto del código
COPY . .

# ⚙️ Generamos Prisma Client
RUN npx prisma generate

# 🛠️ Build con pkgroll
RUN npm run build

# 🧹 Limpiamos devDependencies
RUN npm prune --omit=dev

# 🛡️ Production Stage
FROM node:24-slim AS production

# Instalar OpenSSL en el stage de producción
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos solo lo necesario desde builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/keys ./keys   
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "dist/index.mjs"]