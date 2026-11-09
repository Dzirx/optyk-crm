import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifyLicense } = require('../../desktop/src/license.js') as {
  verifyLicense: (token: unknown, pem: string, machine: string) => Record<string, unknown> | null;
};

// Klucze tylko na czas testu, w pamięci.
const pem = (k: crypto.KeyObject) => k.export({ type: 'spki', format: 'pem' }).toString();
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const foreign = crypto.generateKeyPairSync('ed25519');
const PUB = pem(publicKey);

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const MACHINE_A = sha('komputer-A');
const MACHINE_B = sha('komputer-B');

function sign(payload: object, key: crypto.KeyObject = privateKey): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.sign(null, Buffer.from(body), key).toString('base64url')}`;
}
const payload = { v: 1, email: 'salon@test.local', name: null, machine: MACHINE_A, issuedAt: '2026-11-09T00:00:00.000Z' };

test('poprawna licencja na właściwym komputerze', () => {
  assert.equal(verifyLicense(sign(payload), PUB, MACHINE_A)?.email, 'salon@test.local');
});

test('licencja nie działa na innym komputerze', () => {
  assert.equal(verifyLicense(sign(payload), PUB, MACHINE_B), null);
});

test('zmieniona treść licencji jest odrzucana', () => {
  const [, sig] = sign(payload).split('.');
  const forgedBody = Buffer.from(JSON.stringify({ ...payload, machine: MACHINE_B })).toString('base64url');
  assert.equal(verifyLicense(`${forgedBody}.${sig}`, PUB, MACHINE_B), null);
});

test('licencja podpisana obcym kluczem jest odrzucana', () => {
  assert.equal(verifyLicense(sign(payload, foreign.privateKey), PUB, MACHINE_A), null);
});

test('zła wersja licencji jest odrzucana', () => {
  assert.equal(verifyLicense(sign({ ...payload, v: 2 }), PUB, MACHINE_A), null);
});

for (const junk of ['', 'abc', 'a.b', '.', 'a.b.c', null, undefined, 42]) {
  test(`śmieć „${String(junk)}” zamiast licencji → null`, () => {
    assert.equal(verifyLicense(junk, PUB, MACHINE_A), null);
  });
}

test('brak klucza publicznego → null', () => {
  assert.equal(verifyLicense(sign(payload), '', MACHINE_A), null);
});
