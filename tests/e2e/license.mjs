// Aktywacja licencji Windows (API /api/license/activate) razem z desktop/src/license.js.
// Wymaga na serwerze LICENSE_PRIVATE_KEY_B64, a w teście pasującego klucza publicznego (PEM w base64) w LICENSE_PUBLIC_KEY_B64.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Client, BASE, PASSWORD, ROOT_EMAIL, ROOT_PASSWORD, check, run } from './lib.mjs';

const require = createRequire(import.meta.url);
const { activate, verifyLicense } = require('../../desktop/src/license.js');

const PUB = process.env.LICENSE_PUBLIC_KEY_B64 ? Buffer.from(process.env.LICENSE_PUBLIC_KEY_B64, 'base64').toString('utf8') : '';
if (!PUB) {
  console.error('Brak LICENSE_PUBLIC_KEY_B64 (klucz publiczny pasujący do LICENSE_PRIVATE_KEY_B64 serwera).');
  process.exit(1);
}

const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const A = h('komputer-A');
const B = h('komputer-B');
const tryAct = (email, password, machineHash) =>
  activate(BASE, { email, password, machineHash, machineName: 'PC' }).then(
    (d) => ({ ok: true, d }),
    (e) => ({ ok: false, e: e.message }),
  );

await run(async () => {
  const email = `salon-${Date.now()}@test.local`, pw = PASSWORD;
  const u = new Client('salon'); await u.req('POST', '/api/auth/register', { name: 'Salon', email, password: pw });
  let r = await tryAct(email, pw, A);
  check(!r.ok && /wykupionej licencji/.test(r.e), `okres próbny → brak aktywacji (${r.e})`);
  const adm = new Client('admin'); await adm.login(ROOT_EMAIL, ROOT_PASSWORD);
  const row = async () => (await adm.req('GET', '/api/admin/businesses')).json.businesses.find((b) => b.userEmail === email);
  const userId = (await row()).userId;
  await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'unlimited' });
  r = await tryAct(email.toUpperCase(), pw, A);
  check(r.ok && verifyLicense(r.d.license, PUB, A)?.email === email, 'opłacone konto → licencja dla komputera A (e-mail wielkimi literami)');
  check(r.ok && verifyLicense(r.d.license, PUB, B) === null, 'licencja A nie działa na komputerze B');
  r = await tryAct(email, pw, A);
  check(r.ok && (await row()).windowsDevices.length === 1, 'ponowna aktywacja na A (reinstalacja) → OK, nadal 1 komputer');
  r = await tryAct(email, pw, B);
  check(!r.ok && /innym komputerze/.test(r.e), `komputer B przy limicie 1 → odmowa (${r.e})`);
  r = await tryAct(email, 'zle-haslo', A);
  check(!r.ok && /Nieprawidłowy/.test(r.e), 'złe hasło → odmowa');
  r = await fetch(BASE + '/api/license/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw, machineHash: 'xyz' }) });
  check(r.status === 400, `zły numer komputera → ${r.status}`);
  r = await u.req('PATCH', `/api/admin/users/${userId}`, { action: 'deviceLimit', limit: 5 });
  check(r.status === 401 || r.status === 403, `salon nie zmieni sobie limitu (${r.status})`);
  await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'unpinDevices' });
  r = await tryAct(email, pw, B);
  check(r.ok, 'po „Odepnij” komputer B aktywowany');
  r = await tryAct(email, pw, A);
  check(!r.ok, 'teraz komputer A przy limicie 1 → odmowa');
  r = await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'deviceLimit', limit: 2 });
  check(r.status === 200 && r.json.windowsDeviceLimit === 2, 'admin: limit 2');
  r = await tryAct(email, pw, A);
  const rw = await row();
  check(r.ok && rw.windowsDevices.length === 2 && rw.windowsDeviceLimit === 2, 'drugi komputer przy limicie 2 → OK (2/2)');
  await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'unpinDevices' });
  await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'deviceLimit', limit: 1 });
  const par = await Promise.all(['X', 'Y', 'Z', 'W'].map((k) => tryAct(email, pw, h(k))));
  check(par.filter((p) => p.ok).length === 1 && (await row()).windowsDevices.length === 1, `4 równoczesne aktywacje przy limicie 1 → dokładnie 1 udana (${par.filter((p) => p.ok).length})`);
  for (let i = 0; i < 10; i++) await tryAct(email, 'zle', A);
  r = await tryAct(email, pw, A);
  check(!r.ok && /Zbyt wiele/.test(r.e), 'po 10 błędnych hasłach → blokada 15 min');
});
