#!/bin/sh
set -e

echo "Running database migrations..."
node /opt/prisma-cli/node_modules/prisma/build/index.js db push --skip-generate

echo "Running seed..."
node seed.cjs --silent

echo "Starting application..."
exec node server.js
