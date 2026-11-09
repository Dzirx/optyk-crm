// Trasy REST z id w URL, wspólne opakowanie (JSON, zod, błędy) i izolacja salonów na nowych ścieżkach.
import { Client, BASE, PASSWORD, check, section, run } from './lib.mjs';

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `api-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  const cust = (await c.req('POST', '/api/customers', { name: 'Testowy', surname: `Klient${tag}`, phone: '+48500000000', smsConsent: true })).json.customer;
  const inv = (await c.req('POST', '/api/inventory', { name: `Soczewka ${tag}`, quantity: 10, price: '100' })).json.item;
  const order = (await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', inventoryItemIdOp: inv.id }] })).json.workOrder;
  const visit = (await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: '2027-01-15T10:00:00.000Z' })).json.visit;
  return { c, cust, inv, order, visit };
}

/** Żądanie z surowym (np. zepsutym) body JSON. */
async function raw(client, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { cookie: client.cookie(), 'content-type': 'application/json' }, body });
  let json = null;
  try { json = await res.json(); } catch { /* bez JSON */ }
  return { status: res.status, json };
}

await run(async () => {
  const A = await setupSalon('A');
  const B = await setupSalon('B');

  section('GET /[id]: własne dane tak, cudze 404');
  let r = await A.c.req('GET', `/api/customers/${A.cust.id}`);
  check(r.status === 200 && r.json.customer.id === A.cust.id, `GET klienta → ${r.status}`);
  r = await A.c.req('GET', `/api/work-orders/${A.order.id}`);
  check(r.status === 200 && r.json.workOrder.items.length === 1 && r.json.workOrder.customerName, `GET zlecenia → ${r.status}`);
  r = await A.c.req('GET', `/api/visits/${A.visit.id}`);
  check(r.status === 200 && r.json.visit.customerName === 'Testowy KlientA', `GET wizyty → ${r.status}`);
  r = await A.c.req('GET', `/api/inventory/${A.inv.id}`);
  check(r.status === 200 && r.json.item.id === A.inv.id, `GET towaru → ${r.status}`);

  const targets = [
    ['customers', B.cust.id, { name: 'Zhakowany' }],
    ['visits', B.visit.id, { notes: 'zhakowana' }],
    ['work-orders', B.order.id, { notes: 'zhakowane' }],
    ['inventory', B.inv.id, { name: 'Zhakowany' }],
  ];
  section('cudze id w URL (salon A → dane salonu B) → 404');
  for (const [res, id, patch] of targets) {
    r = await A.c.req('GET', `/api/${res}/${id}`);
    check(r.status === 404, `GET /api/${res}/[id B] → ${r.status}`, r.json);
    r = await A.c.req('PATCH', `/api/${res}/${id}`, patch);
    check(r.status === 404, `PATCH /api/${res}/[id B] → ${r.status}`, r.json);
    r = await A.c.req('DELETE', `/api/${res}/${id}`);
    check(r.status === 404, `DELETE /api/${res}/[id B] → ${r.status}`, r.json);
  }
  r = await A.c.req('POST', `/api/visits/${B.visit.id}/send-sms`, { smsType: 'reminder' });
  check(r.status === 404, `send-sms cudzej wizyty → ${r.status}`, r.json);
  r = await A.c.req('POST', `/api/work-orders/${B.order.id}/send-sms`);
  check(r.status === 404, `send-sms cudzego zlecenia → ${r.status}`, r.json);

  section('dane salonu B bez zmian po atakach');
  r = await B.c.req('GET', `/api/customers/${B.cust.id}`);
  check(r.status === 200 && r.json.customer.name === 'Testowy', 'klient B bez zmian');
  r = await B.c.req('GET', `/api/work-orders/${B.order.id}`);
  check(r.status === 200 && r.json.workOrder.notes === null, 'zlecenie B bez zmian');
  r = await B.c.req('GET', `/api/visits/${B.visit.id}`);
  check(r.status === 200 && r.json.visit.notes === null, 'wizyta B bez zmian');
  r = await B.c.req('GET', `/api/inventory/${B.inv.id}`);
  check(r.status === 200 && r.json.item.name === 'Soczewka B' && r.json.item.quantity === 9, 'towar B bez zmian (stan 9)');

  section('zły format id w URL → 404, nie 500');
  for (const res of ['customers', 'visits', 'work-orders', 'inventory']) {
    r = await A.c.req('DELETE', `/api/${res}/to-nie-uuid`);
    check(r.status === 404, `DELETE /api/${res}/to-nie-uuid → ${r.status}`, r.json);
  }

  section('stare ścieżki z id w body/query nie istnieją');
  for (const res of ['customers', 'visits', 'work-orders', 'inventory']) {
    r = await A.c.req('PATCH', `/api/${res}`, { id: 'x' });
    check(r.status === 405, `PATCH /api/${res} → ${r.status}`);
    r = await A.c.req('DELETE', `/api/${res}?id=x`);
    check(r.status === 405, `DELETE /api/${res}?id → ${r.status}`);
  }
  r = await A.c.req('POST', '/api/visits/send-sms', { visitId: A.visit.id, smsType: 'reminder' });
  check(r.status === 405, `POST /api/visits/send-sms (stara) → ${r.status}`);

  section('bez sesji → 401');
  const anon = new Client('anon');
  r = await anon.req('GET', '/api/customers');
  check(r.status === 401 && r.json.error === 'Nieautoryzowany', `lista bez sesji → ${r.status}`);
  r = await anon.req('PATCH', `/api/customers/${A.cust.id}`, { name: 'Xx' });
  check(r.status === 401, `PATCH bez sesji → ${r.status}`);
  r = await anon.req('PATCH', `/api/admin/users/${A.cust.id}`, { action: 'block' });
  check(r.status === 401, `admin PATCH bez sesji → ${r.status}`);

  section('zepsuty JSON → 400, nie 500');
  const bad = '{"name": "Jan", ';
  for (const [method, path] of [
    ['POST', '/api/customers'], ['PATCH', `/api/customers/${A.cust.id}`], ['POST', '/api/visits'],
    ['PATCH', `/api/visits/${A.visit.id}`], ['POST', '/api/work-orders'], ['PATCH', `/api/work-orders/${A.order.id}`],
    ['POST', '/api/inventory'], ['PATCH', `/api/inventory/${A.inv.id}`], ['POST', `/api/visits/${A.visit.id}/send-sms`],
    ['PATCH', '/api/business'],
  ]) {
    r = await raw(A.c, method, path, bad);
    check(r.status === 400 && /JSON/.test(r.json?.error ?? ''), `${method} ${path.replace(/[0-9a-f-]{36}/, '[id]')} → ${r.status} ${r.json?.error ?? ''}`);
  }
  r = await raw(A.c, 'POST', '/api/customers', '');
  check(r.status === 400, `pusty body → ${r.status}`);

  section('zod: polskie komunikaty 400');
  r = await A.c.req('POST', '/api/customers', {});
  check(r.status === 400 && r.json.error === 'Imię, nazwisko i telefon są wymagane', `brak pól klienta → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/customers', { name: 'J', surname: 'Kowalski', phone: '+48500000000' });
  check(r.status === 400 && r.json.error === 'Imię musi mieć co najmniej 2 znaki', `krótkie imię → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/customers', { name: 'Jan', surname: 'Kowalski', phone: '123abc' });
  check(r.status === 400 && /numer telefonu/.test(r.json.error), `zły telefon → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/customers', { name: 'Jan', surname: 'Kowalski', phone: '+48500000000', email: 'zly' });
  check(r.status === 400 && r.json.error === 'Nieprawidłowy adres e-mail', `zły e-mail → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/customers', { name: 'Jan', surname: 'Kowalski', phone: '+48500000000', smsConsent: 'tak' });
  check(r.status === 400 && /smsConsent/.test(r.json.error) && /[ąęłśżźćńó]/.test(r.json.error), `zły typ pola → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/customers', [1, 2]);
  check(r.status === 400 && r.json.error === 'Nieprawidłowe dane żądania', `body nie jest obiektem → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/visits', { customerId: A.cust.id });
  check(r.status === 400 && r.json.error === 'Data wizyty jest wymagana', `brak daty wizyty → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/visits', { customerId: A.cust.id, visitDate: 'nie-data' });
  check(r.status === 400 && r.json.error === 'Nieprawidłowa data wizyty', `zła data wizyty → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/visits', { customerId: A.cust.id, visitDate: '2027-01-15T10:00:00Z', reminderSmsDate: '2027-01-16T10:00:00Z' });
  check(r.status === 400 && /przed datą wizyty/.test(r.json.error), `przypomnienie po wizycie → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/work-orders', { customerId: A.cust.id, receivedAt: '2026-11-08', items: 'x' });
  check(r.status === 400 && r.json.error === 'Nieprawidłowe pozycje zlecenia', `items nie jest tablicą → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/work-orders', { receivedAt: '2026-11-08' });
  check(r.status === 400 && r.json.error === 'Wymagane ID klienta', `brak klienta → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/work-orders', { customerId: A.cust.id });
  check(r.status === 400 && r.json.error === 'Data przyjęcia jest wymagana', `brak daty przyjęcia → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/work-orders', { customerId: A.cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', lensPrice: 'abc' }] });
  check(r.status === 400 && r.json.error === 'Nieprawidłowa wartość: Cena szkieł', `zła cena w pozycji → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/inventory', { quantity: 1 });
  check(r.status === 400 && r.json.error === 'Nazwa jest wymagana', `brak nazwy towaru → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/inventory', { name: 'X' });
  check(r.status === 400 && r.json.error === 'Ilość jest wymagana', `brak ilości → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/inventory', { name: 'X', quantity: 1.5 });
  check(r.status === 400 && /całkowita/.test(r.json.error), `ilość ułamkowa → ${r.json?.error}`);
  r = await A.c.req('POST', `/api/visits/${A.visit.id}/send-sms`, { smsType: 'inny' });
  check(r.status === 400 && /reminder/.test(r.json.error), `zły typ SMS → ${r.json?.error}`);
  r = await A.c.req('POST', '/api/business', { name: 'Dubel', googleReviewUrl: 'https://g.page/x' });
  check(r.status === 400 && /już istnieje/.test(r.json.error), `drugi salon → ${r.status}`);
  r = await A.c.req('PATCH', '/api/business', { googleReviewUrl: 'https://example.com' });
  check(r.status === 400 && /Google Reviews/.test(r.json.error), `zły URL opinii → ${r.json?.error}`);

  section('kształty i wartości zachowane');
  r = await A.c.req('POST', '/api/inventory', { name: '  Z przecinkiem  ', quantity: '5', price: '199,50', sph: '', category: '  ', unit: '' });
  check(r.status === 201 && r.json.item.name === 'Z przecinkiem' && Number(r.json.item.price) === 199.5 && r.json.item.sph === null && r.json.item.category === null && r.json.item.unit === 'szt.', `towar: przecinek, trim, puste → null (${JSON.stringify(r.json)})`);
  r = await A.c.req('PATCH', `/api/inventory/${r.json.item.id}`, { price: '', quantity: '7' });
  check(r.status === 200 && r.json.item.price === null && r.json.item.quantity === 7, 'PATCH towaru: pusta cena → null, ilość 7');
  r = await A.c.req('PATCH', `/api/inventory/${A.inv.id}`, { quantity: null });
  check(r.status === 400 && r.json.error === 'Ilość jest wymagana', `PATCH ilość null → ${r.status}`);
  r = await A.c.req('PATCH', `/api/customers/${A.cust.id}`, { surname: 'Nowak', smsConsent: false });
  check(r.status === 200 && r.json.customer.surname === 'Nowak' && r.json.customer.smsConsent === false && r.json.customer.name === 'Testowy', 'PATCH klienta: tylko podane pola');
  r = await A.c.req('POST', `/api/visits/${A.visit.id}/send-sms`, { smsType: 'review' });
  check(r.status === 400 && /zgody/.test(r.json.error), `SMS do klienta bez zgody → ${r.status} ${r.json?.error}`);
  r = await A.c.req('POST', `/api/work-orders/${A.order.id}/send-sms`);
  check(r.status === 400 && /zgody/.test(r.json.error), `SMS zlecenia do klienta bez zgody → ${r.status} ${r.json?.error}`);

  section('admin: /api/admin/users/[id]');
  const adm = new Client('admin');
  await adm.login('root@test.local', 'Root-test-123');
  const userId = (await adm.req('GET', '/api/admin/businesses')).json.businesses.find((b) => b.name === 'Optyk A').userId;
  r = await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'nic' });
  check(r.status === 400 && r.json.error === 'Nieznana operacja', `nieznana operacja → ${r.status} ${r.json?.error}`);
  r = await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'extend', days: 0 });
  check(r.status === 400 && r.json.error === 'Nieprawidłowa liczba dni', `extend 0 dni → ${r.status}`);
  r = await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'deviceLimit', limit: 99 });
  check(r.status === 400 && r.json.error === 'Nieprawidłowy limit komputerów', `limit 99 → ${r.status}`);
  r = await adm.req('PATCH', `/api/admin/users/${userId}`, { action: 'deviceLimit', limit: '3' });
  check(r.status === 200 && r.json.windowsDeviceLimit === 3, `limit "3" → ${r.status}`);
  r = await adm.req('PATCH', `/api/admin/users/to-nie-uuid`, { action: 'block' });
  check(r.status === 404, `admin: zły id → ${r.status}`);
  r = await adm.req('PATCH', '/api/admin/businesses', { userId, action: 'block' });
  check(r.status === 405, `stary PATCH /api/admin/businesses → ${r.status}`);
  r = await A.c.req('GET', '/api/admin/businesses');
  check(r.status === 403, `salon na trasie admina → ${r.status}`);

  section('usuwanie przez /[id]');
  r = await A.c.req('DELETE', `/api/visits/${A.visit.id}`);
  check(r.status === 200, `DELETE wizyty → ${r.status}`);
  r = await A.c.req('DELETE', `/api/work-orders/${A.order.id}`);
  check(r.status === 200, `DELETE zlecenia → ${r.status}`);
  r = await A.c.req('DELETE', `/api/inventory/${A.inv.id}`);
  check(r.status === 200, `DELETE towaru → ${r.status}`);
  r = await A.c.req('DELETE', `/api/customers/${A.cust.id}`);
  check(r.status === 200, `DELETE klienta → ${r.status}`);
  r = await A.c.req('GET', `/api/customers/${A.cust.id}`);
  check(r.status === 404, `po usunięciu klient → ${r.status}`);
});
