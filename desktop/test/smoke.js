'use strict';
// Test na Linuksie: backend.js (PostgreSQL, schemat, konto lokalne, Next.js) oraz licencja offline.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { Backend } = require('../src/backend');
const { verifyLicense, saveLicense, readLicense } = require('../src/license');
const { machineId, isValid } = require('../src/machine-id');

const pgBinDir = fs.readdirSync('/usr/lib/postgresql').map((v) => `/usr/lib/postgresql/${v}/bin`)[0];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optyk-'));
const make = () => new Backend({ resourcesDir: '/payload', dataDir, pgBinDir });

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function users(b) {
  const r = spawnSync(
    path.join(pgBinDir, 'psql'),
    ['-h', '127.0.0.1', '-p', String(b.pgPort), '-U', 'optyk', '-d', 'optyk_crm', '-tAc', "select email||':'||role from users"],
    { env: { ...process.env, PGPASSWORD: b.config.pgPassword }, encoding: 'utf8' }
  );
  return r.stdout.trim();
}

async function login(url, email, password) {
  const csrf = await request('GET', `${url}/api/auth/csrf`);
  const cookie = (csrf.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const { csrfToken } = JSON.parse(csrf.body);
  const res = await request(
    'POST',
    `${url}/api/auth/callback/credentials`,
    new URLSearchParams({ csrfToken, email, password, callbackUrl: url }).toString(),
    { cookie, 'content-type': 'application/x-www-form-urlencoded' }
  );
  return (res.headers['set-cookie'] || []).some((c) => c.includes('session-token'));
}

function assert(cond, msg) {
  if (!cond) throw new Error(`BŁĄD TESTU: ${msg}`);
  console.log(`OK: ${msg}`);
}

function testLicense() {
  console.log('--- licencja (offline)');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  const sign = (payload, key = privateKey) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${crypto.sign(null, Buffer.from(body), key).toString('base64url')}`;
  };
  const machine = machineId();
  assert(/^[0-9a-f]{64}$/.test(machine.hash), `numer sprzętowy odczytany (źródło: ${machine.source})`);
  assert(machineId().hash === machine.hash, 'numer sprzętowy stały między odczytami');
  const payload = { v: 1, lid: 'x', sub: 'u', email: 'salon@test.pl', name: 'Salon', machine: machine.hash, issuedAt: new Date().toISOString() };
  const token = sign(payload);
  assert(verifyLicense(token, pub, machine.hash)?.email === 'salon@test.pl', 'poprawna licencja przyjęta');
  assert(verifyLicense(token, pub, 'a'.repeat(64)) === null, 'licencja z innego komputera odrzucona');
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...payload, machine: 'b'.repeat(64) })).toString('base64url');
  assert(verifyLicense(`${forged}.${sig}`, pub, 'b'.repeat(64)) === null, 'zmieniona treść licencji odrzucona');
  const other = crypto.generateKeyPairSync('ed25519').privateKey;
  assert(verifyLicense(sign(payload, other), pub, machine.hash) === null, 'licencja podpisana obcym kluczem odrzucona');
  assert(verifyLicense('śmieci', pub, machine.hash) === null && verifyLicense(null, pub, machine.hash) === null, 'uszkodzony plik odrzucony');
  const file = path.join(dataDir, 'license.json');
  saveLicense(file, token);
  assert(readLicense(file) === token && body.length > 0, 'zapis i odczyt pliku licencji');
  assert(!isValid('To be filled by O.E.M.') && !isValid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF') && !isValid('03000200-0400-0500-0006-000700080009'), 'śmieciowe numery producentów odrzucone');
  assert(isValid('4C4C4544-0042-3510-8050-B4C04F4D4E32') && isValid('5CG1234XYZ'), 'prawdziwe numery przyjęte');
}

(async () => {
  testLicense();

  console.log('--- pierwsze uruchomienie (aktywacja)');
  let b = make();
  const p1 = await b.prepare((s) => console.log(`  ... ${s}`));
  assert(p1.firstRun === true, 'pierwsze uruchomienie');
  assert(!(await b.hasUsers()), 'przed aktywacją brak konta');
  assert(!JSON.stringify(b.config).includes('password'), 'config.json bez hasła użytkownika');
  await b.createLocalUser({ email: 'Salon@Test.pl', password: 'Haslo-z-chmury-1', name: 'Salon Testowy' });
  assert(await b.hasUsers(), 'po aktywacji jest konto');
  assert(users(b) === 'salon@test.pl:admin', `konto lokalne: ${users(b)}`);
  const info = await b.launch();
  const page = await request('GET', `${info.url}/login`);
  assert(page.status === 200 && !page.body.includes('Zarejestruj'), `GET /login -> ${page.status}, bez rejestracji`);
  assert(await login(info.url, 'salon@test.pl', 'Haslo-z-chmury-1'), 'logowanie hasłem z chmury');
  assert(!(await login(info.url, 'salon@test.pl', 'inne-haslo')), 'złe hasło odrzucone');
  const reg = await request('POST', `${info.url}/api/auth/register`, '{}', { 'content-type': 'application/json' });
  assert(reg.status === 404, `rejestracja wyłączona -> ${reg.status}`);
  const cron = await request('GET', `${info.url}/api/cron/send-scheduled-sms`);
  assert(cron.status === 401, `cron bez klucza -> ${cron.status}`);
  await b.stop();

  console.log('--- drugie uruchomienie');
  b = make();
  const p2 = await b.prepare();
  assert(p2.firstRun === false, 'drugie uruchomienie nie jest pierwszym');
  assert(await b.hasUsers(), 'konto zostało');
  console.log('--- ponowna aktywacja (np. zgubiony plik licencji) z nowym hasłem');
  await b.createLocalUser({ email: 'salon@test.pl', password: 'Nowe-haslo-2', name: 'Salon Testowy' });
  assert(users(b) === 'salon@test.pl:admin', 'nadal jedno konto');
  const info2 = await b.launch();
  assert(await login(info2.url, 'salon@test.pl', 'Nowe-haslo-2'), 'logowanie nowym hasłem');
  await b.stop();
  console.log('WSZYSTKO OK');
})().catch((e) => {
  console.error(e.stack || e.message);
  try { console.error(fs.readFileSync(path.join(dataDir, 'logs', 'desktop.log'), 'utf8')); } catch {}
  try { console.error(fs.readFileSync(path.join(dataDir, 'logs', 'app.log'), 'utf8')); } catch {}
  process.exit(1);
});
