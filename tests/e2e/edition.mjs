// Edycje aplikacji na kompilacji produkcyjnej (standalone): OPTYK_EDITION=desktop (Windows) i chmura.
// Uruchamiany przez tests/e2e/edition.sh (BASE, MODE=desktop|cloud). Admin: ROOT_USER_EMAIL / ROOT_USER_PASSWORD.
import { Client, BASE, ROOT_EMAIL, ROOT_PASSWORD, check, section, run } from './lib.mjs';

const DESKTOP = process.env.MODE === 'desktop';

await run(async () => {
  const c = new Client('edition');
  const get = async (p) => {
    const r = await fetch(BASE + p, { headers: { cookie: c.cookie() }, redirect: 'manual' });
    c.store(r);
    return r;
  };
  section(`tryb: ${DESKTOP ? 'Windows (desktop)' : 'chmura'}`);
  let r = await get('/');
  check(DESKTOP ? r.status === 307 && r.headers.get('location').endsWith('/login') : r.status === 200, `/ → ${r.status} ${r.headers.get('location') ?? ''}`);
  r = await get('/register');
  check(DESKTOP ? r.status === 307 && r.headers.get('location').endsWith('/login') : r.status === 200, `/register → ${r.status} ${r.headers.get('location') ?? ''}`);
  r = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'X', email: `x${Date.now()}@test.local`, password: 'Haslo-testowe-123' }),
  });
  check(DESKTOP ? r.status === 404 : r.status === 201, `API rejestracji → ${r.status}`);
  const html = await (await get('/login')).text();
  check(DESKTOP ? !html.includes('Zarejestruj') && !html.includes('/#funkcje') : html.includes('Zarejestruj'), `strona logowania ${DESKTOP ? 'bez' : 'z'} linkiem do rejestracji`);
  await c.login(ROOT_EMAIL, ROOT_PASSWORD);
  r = await get('/');
  check(DESKTOP ? r.headers.get('location')?.endsWith('/dashboard') : r.status === 200, `zalogowany: / → ${r.status} ${r.headers.get('location') ?? ''}`);
  const dash = await (await get('/dashboard')).text();
  check(!dash.includes('Okres próbny'), 'admin: brak paska okresu próbnego');
  check(DESKTOP ? !dash.includes('/admin/businesses') : dash.includes('/admin/businesses'), `menu admina ${DESKTOP ? 'ukryte' : 'widoczne'}`);
});
