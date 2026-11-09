#!/usr/bin/env bash
# Buduje instalator Windows (.exe) w Dockerze. Wynik: desktop/dist/
# Użycie:  ./build-windows.sh           - instalator
#          ./build-windows.sh test      - test orkiestracji (PostgreSQL + Next) na Linuksie
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
CTX=".build-context"

rm -rf "$CTX" && mkdir -p "$CTX/app" "$CTX/desktop"
# Kod aplikacji bez sekretów (.env*), zależności i wyników budowania.
tar -C "$ROOT" \
  --exclude=./node_modules --exclude=./.next --exclude=./.git \
  --exclude=./desktop --exclude='./.env*' --exclude=./results2.csv --exclude=./tsconfig.tsbuildinfo \
  -cf - . | tar -C "$CTX/app" -xf -
tar --exclude=./node_modules --exclude=./dist --exclude=./payload --exclude=./.build-context \
  -cf - . | tar -C "$CTX/desktop" -xf -

if [ "${1:-}" != "test" ]; then
  # Instalator bez klucza publicznego lub adresu chmury nie dałby się aktywować.
  if [ ! -f src/license-public-key.js ]; then
    echo "Brak desktop/src/license-public-key.js. Uruchom raz: node scripts/generate-license-keys.mjs" >&2; exit 1
  fi
  if [ -z "$(node -p "require('./package.json').optyk.licenseServer" 2>/dev/null)" ]; then
    echo "Ustaw adres chmury w desktop/package.json → optyk.licenseServer (np. https://optykcrm.pl)" >&2; exit 1
  fi
fi

if [ "${1:-}" = "test" ]; then
  docker build -f "$CTX/desktop/Dockerfile" --target backend-test -t optyk-desktop-test "$CTX"
  docker run --rm optyk-desktop-test
else
  rm -rf dist && mkdir -p dist
  docker build -f "$CTX/desktop/Dockerfile" --target out --output "type=local,dest=dist" "$CTX"
  echo "Gotowe:"; ls -lh dist/*.exe
fi
rm -rf "$CTX"
