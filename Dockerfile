# ============================================================
# Stage 1: Builder
# ============================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL 3.0 and CA certificates required by Prisma
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Generate the correct engine binary native to this Debian container
RUN npx prisma generate

# Build TypeScript application
RUN npm run build

# ============================================================
# Stage 2: Production runner
# ============================================================
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install runtime OpenSSL 3.0 dependency
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma      ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist        ./dist

EXPOSE 80

# Run pending migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
