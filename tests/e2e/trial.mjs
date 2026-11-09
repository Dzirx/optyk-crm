// Okres próbny (5 dni), flagi „do zamówienia” per element, koniec okresu próbnego, ręczny dostęp nadawany przez admina.
// Wymaga na serwerze CONTACT_EMAIL=kontakt@test.local, CONTACT_PHONE="500 600 700", CRON_SECRET=cron-test.
import { Client, PASSWORD, ROOT_EMAIL, ROOT_PASSWORD, BASE, check, section, run, sql } from './lib.mjs';

await run(async () => {
  const c = new Client('A');
  const email = `trial-${Date.now()}@test.local`, password = PASSWORD;
  let r = await c.req('POST', '/api/auth/register', { name: 'Salon', email, password });
  const days = Number(sql(`SELECT round(extract(epoch from access_until - now())/86400) FROM users WHERE email='${email}'`));
  check(days === 5, `rejestracja → dostęp na 5 dni (${days})`);
  await c.login(email, password);
  await c.req('POST', '/api/business', { name: 'Optyk Trial', googleReviewUrl: 'https://g.page/test' });
  let html = await c.page('/dashboard');
  check(html.includes('Okres próbny: zostało') && html.includes('500 600 700'), 'panel pokazuje pasek okresu próbnego z kontaktem');

  section('do zamówienia: osobno OP / OL / oprawka');
  const cust = (await c.req('POST', '/api/customers', { name: 'Jan', surname: 'Testowy', phone: '+48500000000', smsConsent: true })).json.customer;
  const lensOk = (await c.req('POST', '/api/inventory', { name: 'Soczewka na stanie', quantity: 3, price: '100' })).json.item;
  const lensNo = (await c.req('POST', '/api/inventory', { name: 'Soczewka brak', quantity: 0, price: '120' })).json.item;
  const frameNo = (await c.req('POST', '/api/inventory', { name: 'Oprawka brak', quantity: 0, price: '300' })).json.item;
  const q = async (id) => (await c.req('GET', '/api/inventory')).json.items.find((i) => i.id === id).quantity;
  const base = { type: 'do_dali', inventoryItemIdOp: lensOk.id, inventoryItemIdOl: lensNo.id, inventoryItemIdFrame: frameNo.id };
  let r2 = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-09', items: [base] });
  check(r2.status === 409 && r2.json.error.includes('Do zamówienia'), `nic nie zaznaczone → 409 (${r2.json?.error})`);
  r2 = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-09', items: [{ ...base, olOrdered: true }] });
  check(r2.status === 409 && r2.json.error.includes('Oprawka brak'), 'tylko OL zaznaczone → 409 o brak oprawki');
  r2 = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-09', items: [{ ...base, opOrdered: true, frameOrdered: true }] });
  check(r2.status === 409 && r2.json.error.includes('Soczewka brak'), 'zaznaczone złe szkło (OP zamiast OL) → 409 wykrywa pomyłkę');
  r2 = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-09', items: [{ ...base, olOrdered: true, frameOrdered: true }] });
  check(r2.status === 201, `OL + oprawka do zamówienia → 201 (${r2.status})`);
  check((await q(lensOk.id)) === 2 && (await q(lensNo.id)) === -1 && (await q(frameNo.id)) === -1, 'stany: OP 3→2, OL 0→-1, oprawka 0→-1');
  const order = r2.json.workOrder;
  const it = order.items[0];
  check(it.olOrdered && it.frameOrdered && !it.opOrdered, 'flagi zapisane per element');
  r2 = await c.req('PATCH', `/api/work-orders/${order.id}`, { status: 'ready' });
  check(r2.status === 200 && r2.json.workOrder.items[0].olOrdered === true, 'zmiana statusu nie rusza flag');
  await c.req('PATCH', `/api/inventory/${lensNo.id}`, { quantity: 0 });
  r2 = await c.req('PATCH', `/api/work-orders/${order.id}`, { items: [{ ...it, olOrdered: false }] });
  check(r2.status === 200 && (await q(lensNo.id)) === 0, 'po dostawie OL: odznaczenie, stan bez zmian (0)');
  r2 = await c.req('PATCH', `/api/inventory/${frameNo.id}`, { name: 'Oprawka (nowa nazwa)', quantity: -1 });
  check(r2.status === 200, 'edycja towaru z ujemnym stanem → 200');
  r2 = await c.req('PATCH', `/api/inventory/${frameNo.id}`, { quantity: -5 });
  check(r2.status === 400, 'ręczne obniżenie do -5 → 400');
  r2 = await c.req('DELETE', `/api/work-orders/${order.id}`);
  check(r2.status === 200 && (await q(lensOk.id)) === 3 && (await q(lensNo.id)) === 1 && (await q(frameNo.id)) === 0, 'usunięcie zlecenia zwraca wszystko');

  section('koniec okresu próbnego');
  const vis = (await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: new Date(Date.now() + 864e5).toISOString(), reminderSmsDate: new Date(Date.now() - 60e3).toISOString() })).json.visit;
  sql(`UPDATE users SET access_until = now() - interval '1 minute' WHERE email='${email}'`);
  html = await c.page('/dashboard');
  check(html.includes('Okres próbny zakończył się') && html.includes('kontakt@test.local'), 'panel → ekran „Okres próbny zakończył się”');
  r = await c.req('GET', '/api/customers');
  check(r.status === 404, `API klientów zablokowane (${r.status})`);
  r = await c.req('GET', '/api/business');
  check(r.status === 403, `API salonu → 403 (${r.status})`);
  r = await (await fetch(BASE + '/api/cron/send-scheduled-sms', { headers: { authorization: 'Bearer cron-test' } })).json();
  const st = sql(`SELECT reminder_sms_status FROM visits WHERE id='${vis.id}'`);
  check(r.results?.reminderSms?.processed === 0 && st === 'pending', `cron pomija salon po okresie próbnym (processed=${r.results?.reminderSms?.processed}, status=${st})`);

  section('admin');
  const adm = new Client('admin');
  check(await adm.login(ROOT_EMAIL, ROOT_PASSWORD), 'logowanie admina');
  r = await adm.req('GET', '/api/admin/businesses');
  const row = r.json.businesses.find((b) => b.userEmail === email);
  check(r.status === 200 && row && row.customerCount === 1, 'admin widzi konto i liczbę klientów');
  r = await adm.req('PATCH', `/api/admin/users/${row.userId}`, { action: 'extend', days: 30 });
  const left = Math.round((new Date(r.json.accessUntil) - Date.now()) / 864e5);
  check(r.status === 200 && left === 30, `+30 dni od dziś (${left})`);
  r = await adm.req('PATCH', `/api/admin/users/${row.userId}`, { action: 'extend', days: 30 });
  check(Math.round((new Date(r.json.accessUntil) - Date.now()) / 864e5) === 60, 'drugie +30 dni liczy się od końca okresu (60)');
  html = await c.page('/dashboard');
  check(!html.includes('Okres próbny zakończył się') && (await c.req('GET', '/api/customers')).status === 200, 'salon znowu ma dostęp');
  r = await adm.req('PATCH', `/api/admin/users/${row.userId}`, { action: 'unlimited' });
  html = await c.page('/dashboard');
  check(r.json.accessUntil === null && !html.includes('Okres próbny: zostało'), 'bez limitu → brak paska');
  r = await c.req('PATCH', `/api/admin/users/${row.userId}`, { action: 'unlimited' });
  check(r.status === 403, `zwykły użytkownik nie zmieni dostępu (${r.status})`);
  const adminId = sql(`SELECT id FROM users WHERE email='${ROOT_EMAIL}'`);
  r = await adm.req('PATCH', `/api/admin/users/${adminId}`, { action: 'block' });
  check(r.status === 404, `nie da się zablokować admina (${r.status})`);


});
