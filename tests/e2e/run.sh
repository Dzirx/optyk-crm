#!/usr/bin/env bash
# Testy e2e: jednorazowa baza Postgres w Dockerze + serwer `next dev` + wszystkie suity.
# Wymaga uruchomionego Docker Desktop. Zawsze sprząta po sobie (serwer i kontener).
#
# Użycie:  npm run test:e2e            # wszystkie suity
#          npm run test:e2e -- idor    # tylko wybrane (nazwy plików bez .mjs)
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib.sh
. ./lib.sh

export ROOT_USER_EMAIL=root@test.local ROOT_USER_PASSWORD=Root-test-123
export BASE="http://127.0.0.1:${E2E_PORT}"

SUITES=("$@")
[ ${#SUITES[@]} -eq 0 ] && SUITES=(idor fixes trial license api pagination)

e2e_init
db_up
db_schema_and_seed

# Klucze licencji tylko w pamięci/zmiennych środowiska — nigdzie nie są zapisywane.
eval "$(cd "$REPO_ROOT" && node -e '
const c = require("crypto");
const { publicKey, privateKey } = c.generateKeyPairSync("ed25519");
const priv = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64");
const pub = Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64");
console.log("LICENSE_PRIVATE_KEY_B64=" + JSON.stringify(priv));
console.log("export LICENSE_PRIVATE_KEY_B64");
console.log("LICENSE_PUBLIC_KEY_B64=" + JSON.stringify(pub));
console.log("export LICENSE_PUBLIC_KEY_B64");
')"

log "Start serwera next dev na porcie $E2E_PORT"
start_server "$WORK_DIR/server.log" env \
  DATABASE_URL="$DATABASE_URL" \
  AUTH_SECRET="e2e-secret-e2e-secret-e2e-secret-0123456789" \
  AUTH_TRUST_HOST=true \
  CRON_SECRET=cron-test \
  CONTACT_EMAIL=kontakt@test.local \
  CONTACT_PHONE="500 600 700" \
  LICENSE_PRIVATE_KEY_B64="$LICENSE_PRIVATE_KEY_B64" \
  TZ=UTC \
  bash -c "cd '$REPO_ROOT' && exec node_modules/.bin/next dev -p $E2E_PORT -H 127.0.0.1"

declare -A RESULT
FAILED=0
for s in "${SUITES[@]}"; do
  log "Suita: $s"
  if node "$s.mjs"; then RESULT[$s]=OK; else RESULT[$s]=FAIL; FAILED=1; fi
done

printf '\n==== Podsumowanie e2e ====\n'
for s in "${SUITES[@]}"; do printf '%-10s %s\n' "$s" "${RESULT[$s]}"; done
if [ "$FAILED" = 1 ]; then
  echo "--- końcówka logu serwera ---"
  tail -n 30 "$WORK_DIR/server.log"
  exit 1
fi
