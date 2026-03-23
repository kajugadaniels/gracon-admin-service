# ─── Build Stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDependencies needed for build)
COPY package*.json ./
RUN npm ci

# Copy source and generate the Prisma client for the current platform
COPY . .
RUN npx prisma generate

# Compile TypeScript → JavaScript
RUN npm run build

# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the Prisma-generated client (platform-specific binaries) from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy the Prisma CLI binary (needed for prisma generate at runtime if required)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy compiled app and Prisma schema
# Note: migrations are owned by api/auth — admin never runs migrate deploy
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

# Run as non-root for security
RUN addgroup -g 1001 -S appgroup \
 && adduser  -u 1001 -S appuser -G appgroup
USER appuser

EXPOSE 3001

CMD ["node", "dist/main.js"]
