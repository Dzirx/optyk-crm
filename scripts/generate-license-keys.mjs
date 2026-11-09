#!/usr/bin/env node
// Generuje parę kluczy Ed25519 dla licencji wersji Windows. Uruchom JEDEN raz.
//
//  - klucz publiczny  → desktop/src/license-public-key.js (wbudowany w program, można commitować)
//  - klucz prywatny   → wypisany na ekran; wpisz go do .env serwera jako LICENSE_PRIVATE_KEY_B64
//
// Klucza prywatnego nie zapisuj w repozytorium. Jego utrata = nowe klucze i nowy instalator,
// a stare licencje przestaną działać w nowej wersji programu.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || path.join(root, 'desktop', 'src', 'license-public-key.js');

if (fs.existsSync(target) && !process.argv.includes('--force')) {
  console.error(`Plik ${target} już istnieje. Nowe klucze unieważnią wydane licencje.`);
  console.error('Jeśli na pewno chcesz nowe klucze, dodaj --force.');
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

fs.writeFileSync(
  target,
  `'use strict';\n// Klucz publiczny licencji (scripts/generate-license-keys.mjs). Do sprawdzania podpisu — nie jest tajny.\nmodule.exports = ${JSON.stringify(publicPem)};\n`,
);

console.log(`Zapisano klucz publiczny: ${target}\n`);
console.log('Dodaj do .env na serwerze (TAJNE, nie commituj):\n');
console.log(`LICENSE_PRIVATE_KEY_B64=${Buffer.from(privatePem).toString('base64')}`);
