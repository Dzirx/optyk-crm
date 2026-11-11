# syntax=docker/dockerfile:1
# Kontekst budowania: katalog .build-context (przygotowuje go build-windows.sh)
#   app/      kod aplikacji (bez .env, node_modules, .next)
#   desktop/  kod Electrona

# ---------- 1. Aplikacja Next.js + silniki Prisma ----------
FROM node:22-bookworm-slim AS web
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY app/package.json app/package-lock.json ./
COPY app/prisma ./prisma
RUN npm ci --include=dev
COPY app/ ./
# Silnik zapytań dla Windows dodajemy tylko w tej kopii schematu.
RUN sed -i 's|provider = "prisma-client-js"|provider = "prisma-client-js"\n  binaryTargets = ["native", "windows"]|' prisma/schema.prisma
ENV NEXT_TELEMETRY_DISABLED=1
# Atrapa DATABASE_URL tylko na czas budowania (moduł db sprawdza ją przy imporcie). Baza nie jest używana.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

RUN mkdir -p /out/app/.next /out/app/node_modules/.prisma /out/app/node_modules/@prisma/client /out/tools/prisma \
    && cp -rL .next/standalone/. /out/app/ \
    && cp -r .next/static /out/app/.next/static \
    && cp -r public /out/app/public \
    && cp -r node_modules/.prisma/. /out/app/node_modules/.prisma/ \
    && cp -rL node_modules/@prisma/client/. /out/app/node_modules/@prisma/client/ \
    && "$(find node_modules -path '*/esbuild/bin/esbuild' | head -1)" lib/db/local-user.ts --bundle --platform=node --format=cjs \
         --external:@prisma/client --outfile=/out/app/local-user.js \
    && "$(find node_modules -path '*/esbuild/bin/esbuild' | head -1)" lib/db/init-stock.ts --bundle --platform=node --format=cjs \
         --external:@prisma/client --outfile=/out/app/init-stock.js \
    && cp prisma/schema.prisma /out/tools/prisma/schema.prisma

# Prisma CLI (db push) z silnikiem schematu dla Windows.
WORKDIR /out/tools
RUN PRISMA_VER=$(node -p "require('/src/package.json').devDependencies.prisma.replace('^','')") \
    && echo '{"name":"tools","private":true}' > package.json \
    && PRISMA_CLI_BINARY_TARGETS=windows,debian-openssl-3.0.x \
       npm install --no-audit --no-fund "prisma@${PRISMA_VER}"

# ---------- 2. PostgreSQL dla Windows + VC++ Runtime ----------
FROM debian:bookworm-slim AS pg
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG PG_VERSION=16.9-1
WORKDIR /tmp
RUN curl -fL --retry 3 -o pg.zip \
      "https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip" \
    && unzip -q pg.zip \
    && mkdir -p /out/pg /out/vcredist \
    && cp -r pgsql/bin pgsql/lib pgsql/share /out/pg/ \
    && curl -fL --retry 3 -o /out/vcredist/vc_redist.x64.exe https://aka.ms/vs/17/release/vc_redist.x64.exe

# ---------- 3. Test orkiestracji na Linuksie (opcjonalny) ----------
FROM node:22-bookworm-slim AS backend-test
RUN apt-get update && apt-get install -y --no-install-recommends postgresql openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && useradd -m tester \
    && tr -d '-' < /proc/sys/kernel/random/uuid > /etc/machine-id
COPY --from=web /out /payload
COPY desktop/src /desktop/src
COPY desktop/test /desktop/test
USER tester
CMD ["node", "/desktop/test/smoke.js"]

# ---------- 4. Instalator Windows ----------
FROM electronuserland/builder:wine AS installer
WORKDIR /project
COPY desktop/package.json ./
RUN npm install --no-audit --no-fund
COPY desktop/src ./src
COPY desktop/assets ./assets
COPY --from=web /out/app ./payload/app
COPY --from=web /out/tools ./payload/tools
COPY --from=pg /out/pg ./payload/pg
COPY --from=pg /out/vcredist ./payload/vcredist
# Usuń pliki Linuksa (były potrzebne tylko do testu).
RUN find payload \( -name 'libquery_engine-*' -o -name 'schema-engine-debian*' -o -name 'schema-engine-linux*' \) -delete \
    && test -f payload/app/node_modules/.prisma/client/query_engine-windows.dll.node \
    && test -f payload/tools/node_modules/@prisma/engines/schema-engine-windows.exe \
    && test -f payload/pg/bin/postgres.exe \
    && test -f payload/app/server.js && test -f payload/app/local-user.js && test -f payload/app/init-stock.js \
    && test -f src/license-public-key.js
RUN npx electron-builder --win nsis --x64 --publish never

FROM scratch AS out
COPY --from=installer /project/dist/*.exe /
