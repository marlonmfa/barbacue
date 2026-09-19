# ── Multi-stage build for the Next.js web app (monorepo workspace) ──
# Build context MUST be the monorepo root:
#   docker build -f apps/web/Dockerfile -t barbacue-web .
# Database migrations are NOT run here — they run via the `migrate` stage
# (drizzle-kit migrate). See docker-compose.yml / docs/DEPLOY.md.
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# ── builder: install deps + compile the standalone server ──
# Install in the same stage that builds so npm-workspace .bin symlinks (next,
# drizzle-kit, etc.) resolve. Manifests first so the npm ci layer caches.
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/scraper/package.json ./packages/scraper/
RUN npm ci
COPY . .
# next.config.ts loads ../../.env if present; in CI/Docker none exists, so env
# comes from the container at runtime. A DB is NOT needed at build time.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/web

# ── migrate: one-shot image that applies drizzle migrations ──
# Reuses the builder (has drizzle-kit + config + schema + migrations).
#   docker compose run --rm migrate   (or it runs automatically before `web`)
FROM builder AS migrate
WORKDIR /app/apps/web
CMD ["npx", "drizzle-kit", "migrate"]

# ── runner: minimal production image (just starts the server) ──
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone bundle (traced node_modules + server) and assets.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# Private installer: served only by the authenticated admin download route.
COPY --from=builder /app/apps/web/private-downloads ./apps/web/private-downloads
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
