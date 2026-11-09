#!/usr/bin/env bash
# Opcjonalny test edycji (Windows/chmura) na kompilacji produkcyjnej (standalone).
# Wymaga `next build` (kilka minut) i Docker Desktop. Pominięcie budowania: SKIP_BUILD=1.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib.sh
. ./lib.sh

export ROOT_USER_EMAIL=admin@optyk.local ROOT_USER_PASSWORD=Admin-test-123
export BASE="http://127.0.0.1:${E2E_PORT}"

e2e_init
if [ "${SKIP_BUILD:-0}" != 1 ]; then
  log "next build"
  (cd "$REPO_ROOT" && DATABASE_URL="$DATABASE_URL" npm run build >"$WORK_DIR/build.log" 2>&1) || { tail -n 40 "$WORK_DIR/build.log"; exit 1; }
fi
STANDALONE="$REPO_ROOT/.next/standalone"
[ -f "$STANDALONE/server.js" ] || { echo "Brak $STANDALONE/server.js — uruchom bez SKIP_BUILD." >&2; exit 1; }

db_up
db_schema_and_seed

FAILED=0
for mode in cloud desktop; do
  log "Tryb: $mode"
  edition=""; [ "$mode" = desktop ] && edition=desktop
  start_server "$WORK_DIR/server-$mode.log" env \
    DATABASE_URL="$DATABASE_URL" AUTH_SECRET="e2e-secret-e2e-secret-e2e-secret-0123456789" AUTH_TRUST_HOST=true \
    OPTYK_EDITION="$edition" PORT="$E2E_PORT" HOSTNAME=127.0.0.1 TZ=UTC \
    node "$STANDALONE/server.js"
  MODE="$mode" node edition.mjs || FAILED=1
  stop_server
done
exit "$FAILED"
