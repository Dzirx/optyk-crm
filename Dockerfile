FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Adres zastępczy tylko na czas budowania (lib/db wymaga zmiennej przy imporcie);
# budowanie nie łączy się z bazą, a prawdziwy adres daje compose w czasie działania.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build
# Seed jako jeden plik JS: obraz nie potrzebuje tsx ani źródeł .ts.
RUN node scripts/build-seed.mjs

# Samo CLI Prisma (do `prisma db push` przy starcie), w wersji z package-lock.json.
# Bez tego trzeba by kopiować cały node_modules z narzędziami deweloperskimi.
FROM base AS prisma-cli
WORKDIR /prisma-cli
COPY package-lock.json ./
RUN PRISMA_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version") \
 && echo '{"private":true}' > package.json \
 && npm install --omit=dev --no-audit --no-fund --no-package-lock "prisma@${PRISMA_VERSION}" \
 && npm cache clean --force

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# CLI Prisma nie sprawdza przy starcie nowych wersji (checkpoint.prisma.io).
ENV CHECKPOINT_DISABLE=1
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir .next \
 && chown nextjs:nodejs .next
COPY --from=builder /app/public ./public
# Standalone ma własny, odchudzony node_modules z tym, czego używa serwer.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Klient Prisma z silnikiem (dla serwera i seeda) – na pewno w pełnej wersji.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/dist/seed.cjs ./seed.cjs
COPY --from=prisma-cli /prisma-cli/node_modules /opt/prisma-cli/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["./entrypoint.sh"]
