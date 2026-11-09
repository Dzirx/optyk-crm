#!/usr/bin/env bash
# Wspólne funkcje skryptów e2e: tymczasowa baza Postgres w Dockerze i sprzątanie.
# Docker: zawsze kontekst desktop-linux (nigdy domyślny — ten idzie przez firmowy mirror rejestru).

export DOCKER_CONTEXT=desktop-linux

E2E_DB_CONTAINER="${E2E_DB_CONTAINER:-optyk-e2e-db}"
E2E_DB_PORT="${E2E_DB_PORT:-55441}"
E2E_PORT="${E2E_PORT:-3131}"
export E2E_DB_CONTAINER
export E2E_PG_USER=t E2E_PG_DB=optyk

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_URL="postgresql://t:t@127.0.0.1:${E2E_DB_PORT}/optyk?schema=public"
export DATABASE_URL

WORK_DIR=""
SERVER_PID=""
DB_STARTED=0

log() { printf '\n==> %s\n' "$*"; }

e2e_cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [ -n "$SERVER_PID" ]; then
    # serwer działa we własnej grupie procesów (setsid) — zabijamy całą grupę po PID
    kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    sleep 1
    kill -9 -- "-$SERVER_PID" 2>/dev/null || true
  fi
  if [ "$DB_STARTED" = 1 ]; then
    docker rm -f "$E2E_DB_CONTAINER" >/dev/null 2>&1 || true
  fi
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
  exit "$code"
}

e2e_init() {
  trap e2e_cleanup EXIT INT TERM
  WORK_DIR="$(mktemp -d)"
  if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop (kontekst desktop-linux) jest niedostępny. Uruchom Docker Desktop i spróbuj ponownie." >&2
    exit 2
  fi
  if docker container inspect "$E2E_DB_CONTAINER" >/dev/null 2>&1; then
    echo "Kontener $E2E_DB_CONTAINER już istnieje (poprzedni test?). Usuń go: DOCKER_CONTEXT=desktop-linux docker rm -f $E2E_DB_CONTAINER" >&2
    exit 2
  fi
}

# Pierwszy argument: wartość TZ nie jest potrzebna dla bazy.
db_up() {
  log "Start bazy Postgres ($E2E_DB_CONTAINER, 127.0.0.1:$E2E_DB_PORT)"
  docker run -d --name "$E2E_DB_CONTAINER" \
    -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=optyk \
    -p "127.0.0.1:${E2E_DB_PORT}:5432" postgres:16-alpine >/dev/null
  DB_STARTED=1
  local i
  for i in $(seq 1 60); do
    # -h 127.0.0.1: tymczasowy serwer z etapu inicjalizacji nie słucha na TCP
    if docker exec "$E2E_DB_CONTAINER" psql -h 127.0.0.1 -U t -d optyk -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Baza nie wystartowała." >&2
  exit 1
}

db_schema_and_seed() {
  log "Schemat bazy (prisma db push) i konto admina"
  (cd "$REPO_ROOT" && npx prisma db push --skip-generate >"$WORK_DIR/prisma.log" 2>&1) || { cat "$WORK_DIR/prisma.log"; exit 1; }
  (cd "$REPO_ROOT" && ROOT_USER_EMAIL="${ROOT_USER_EMAIL}" ROOT_USER_PASSWORD="${ROOT_USER_PASSWORD}" ROOT_USER_NAME=Root \
    npx tsx lib/db/seed.ts --silent) || { echo "Seed nie powiódł się." >&2; exit 1; }
}

# start_server <log> <polecenie...>  — uruchamia w tle w osobnej grupie procesów
start_server() {
  local logfile="$1"; shift
  setsid "$@" >"$logfile" 2>&1 &
  SERVER_PID=$!
}

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    kill -- "-$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    sleep 1
    kill -9 -- "-$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
