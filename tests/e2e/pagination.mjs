// Paginacja i wyszukiwanie po stronie serwera: /api/customers i /api/work-orders + izolacja salonów.
import { Client, PASSWORD, check, section, run } from './lib.mjs';

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `pg-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  return c;
}

/** Wykonuje zadania po `n` naraz (numeracja zleceń i baza nie lubią setek równoległych żądań). */
async function inChunks(items, fn, n = 5) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

await run(async () => {
  const A = await setupSalon('A');
  const B = await setupSalon('B');

  section('dane: 55 klientów w salonie A, 2 w salonie B');
  const mk = (c, n, s, p, email) => c.req('POST', '/api/customers', { name: n, surname: s, phone: p, email, smsConsent: true });
  const idx = Array.from({ length: 55 }, (_, i) => i);
  const created = await inChunks(idx, (i) => mk(A, 'Jan', i < 5 ? 'Kowalski' : `Nazwisko${i}`, `+4850${String(1000000 + i).slice(1)}`, i === 7 ? 'szukany.mail@example.com' : undefined));
  check(created.every((r) => r.status === 201), 'utworzono 55 klientów');
  await mk(A, 'Anna', 'Kowalska', '+48601234567');
  await mk(B, 'Jan', 'Kowalski', '+48500000001');
  await mk(B, 'Obcy', 'Salonowicz', '+48777888999');
  // A ma teraz 56 klientów

  section('klienci: paginacja');
  let r;
  const pages = [];
  for (let p = 1; p <= 3; p++) pages.push(await A.req('GET', `/api/customers?page=${p}&pageSize=20`));
  check(pages.every((x) => x.status === 200), 'strony 1-3 → 200');
  check(pages[0].json.total === 56 && pages[0].json.page === 1 && pages[0].json.pageSize === 20, 'total=56, page, pageSize', pages[0].json);
  check(pages[0].json.customers.length === 20 && pages[1].json.customers.length === 20 && pages[2].json.customers.length === 16, 'rozmiary stron 20/20/16');
  const allIds = pages.flatMap((x) => x.json.customers.map((c) => c.id));
  check(new Set(allIds).size === 56, 'strony się nie nakładają (56 unikalnych id)');
  check(pages[0].json.customers.every((c) => typeof c.visitCount === 'number' && !('visits' in c)), 'visitCount zachowany, bez visits');
  const dates = pages.flatMap((x) => x.json.customers.map((c) => c.createdAt));
  check(dates.every((d, i) => i === 0 || dates[i - 1] >= d), 'kolejność: od najnowszych');
  r = await A.req('GET', '/api/customers?page=4&pageSize=20');
  check(r.status === 200 && r.json.customers.length === 0 && r.json.total === 56, 'strona poza zakresem → pusta lista, total ok');
  r = await A.req('GET', '/api/customers?page=1');
  check(r.json.pageSize === 50 && r.json.customers.length === 50, 'domyślny pageSize 50');
  check(r.json.counts?.all === 56 && r.json.counts.consented === 56 && r.json.counts.notConsented === 0, 'counts dla zakładek zgody', r.json.counts);

  section('klienci: wyszukiwanie');
  const qs = (q, extra = '') => `/api/customers?page=1&pageSize=50&q=${encodeURIComponent(q)}${extra}`;
  r = await A.req('GET', qs('kowalsk'));
  check(r.json.total === 6 && r.json.customers.every((c) => /^Kowalsk/i.test(c.surname)), 'q po nazwisku (bez wielkości liter, contains)', r.json.total);
  r = await A.req('GET', qs('KOWALSKA'));
  check(r.json.total === 1 && r.json.customers[0].name === 'Anna', 'q wielkie litery');
  r = await A.req('GET', qs('+48 601 234 567'));
  check(r.json.total === 1 && r.json.customers[0].surname === 'Kowalska', 'q telefon ze spacjami i +');
  r = await A.req('GET', qs('601-234'));
  check(r.json.total === 1, 'q telefon z myślnikiem (fragment)');
  r = await A.req('GET', qs('jan kowalski'));
  check(r.json.total === 5 && r.json.customers.every((c) => c.name === 'Jan' && c.surname === 'Kowalski'), 'q wielowyrazowe: imię + nazwisko', r.json.total);
  r = await A.req('GET', qs('kowalski jan'));
  check(r.json.total === 5, 'q wielowyrazowe w odwrotnej kolejności');
  r = await A.req('GET', qs('Nazwisko5'));
  check(r.json.total === 6 && r.json.customers.every((c) => c.surname.startsWith('Nazwisko5')), 'q z literami i cyfrą nie dopasowuje się do telefonów', r.json.total);
  r = await A.req('GET', qs('szukany.mail'));
  check(r.json.total === 1 && r.json.customers[0].email === 'szukany.mail@example.com', 'q po e-mailu');
  r = await A.req('GET', qs('nie ma takiego'));
  check(r.json.total === 0 && r.json.customers.length === 0, 'q bez wyników');
  r = await A.req('GET', qs('kowalsk', '&smsConsent=false'));
  check(r.json.total === 0 && r.json.counts.all === 6 && r.json.counts.consented === 6, 'smsConsent=false + q; counts liczone dla samego q');
  r = await A.req('GET', qs('   '));
  check(r.json.total === 56, 'q z samych spacji = brak filtra');
  r = await A.req('GET', qs('%'));
  check(r.status === 200 && r.json.total === 0, 'q ze znakiem % traktowane dosłownie');
  r = await A.req('GET', qs('Jan_'));
  check(r.status === 200 && r.json.total === 0, 'q ze znakiem _ traktowane dosłownie');

  section('klienci: pełna lista bez page (zgodność wsteczna)');
  r = await A.req('GET', '/api/customers');
  check(r.status === 200 && r.json.customers.length === 56 && !('total' in r.json), 'bez parametrów: wszyscy, kształt { customers }');
  r = await A.req('GET', `/api/customers?q=${encodeURIComponent('jan kowalski')}`);
  check(r.json.customers.length === 5 && !('total' in r.json), 'q bez page: pełna przefiltrowana lista (eksport CSV)');
  r = await A.req('GET', '/api/customers?withVisits=1');
  check(r.json.customers.length === 56 && Array.isArray(r.json.customers[0].visits), 'withVisits=1 bez page działa jak dawniej');

  section('klienci: walidacja');
  for (const bad of ['page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=1&pageSize=0', 'page=1&pageSize=201', 'page=1&pageSize=500', 'page=1&pageSize=x', 'page=1&smsConsent=maybe', `page=1&q=${'a'.repeat(101)}`]) {
    r = await A.req('GET', `/api/customers?${bad}`);
    check(r.status === 400 && typeof r.json?.error === 'string', `${bad.slice(0, 30)} → 400: ${r.json?.error}`);
  }
  r = await A.req('GET', '/api/customers?page=1&pageSize=200');
  check(r.status === 200, 'pageSize=200 dozwolone');

  section('klienci: izolacja salonów');
  r = await A.req('GET', '/api/customers');
  check(!r.json.customers.some((c) => c.surname === 'Salonowicz'), 'pełna lista A bez klientów B');
  r = await A.req('GET', qs('Salonowicz'));
  check(r.json.total === 0, 'A nie znajdzie klienta B po nazwisku');
  r = await A.req('GET', qs('777888999'));
  check(r.json.total === 0, 'A nie znajdzie klienta B po telefonie');
  r = await B.req('GET', '/api/customers?page=1&pageSize=200');
  check(r.json.total === 2 && r.json.customers.length === 2, 'B widzi tylko swoich 2 klientów', r.json.total);
  r = await B.req('GET', qs('kowalski'));
  check(r.json.total === 1, 'B: q „kowalski” → tylko własny klient');
  const aIds = new Set(allIds);
  const bAll = (await B.req('GET', '/api/customers')).json.customers;
  check(!bAll.some((c) => aIds.has(c.id)), 'żadne id z A nie pojawia się u B');

  section('zlecenia: dane');
  const custs = (await A.req('GET', '/api/customers')).json.customers;
  const kow = custs.find((c) => c.surname === 'Kowalska'); // +48601234567
  const nazw = custs.filter((c) => c.surname.startsWith('Nazwisko'));
  const mkOrder = (c, customerId) => c.req('POST', '/api/work-orders', { customerId, receivedAt: '2026-11-08', items: [] });
  const orders = await inChunks(Array.from({ length: 23 }, (_, i) => i), (i) => mkOrder(A, i < 3 ? kow.id : nazw[i].id));
  check(orders.every((x) => x.status === 201), 'utworzono 23 zlecenia w A');
  const orderList = orders.map((x) => x.json.workOrder);
  // 10 gotowych (w tym 2 Kowalskiej), 3 zakończone
  await inChunks([orderList[0], orderList[1], ...orderList.slice(3, 11)], (o) => A.req('PATCH', `/api/work-orders/${o.id}`, { status: 'ready' }));
  await inChunks(orderList.slice(11, 14), (o) => A.req('PATCH', `/api/work-orders/${o.id}`, { status: 'completed' }));
  const bCust = bAll[0];
  const bOrder = (await mkOrder(B, bCust.id)).json.workOrder;

  section('zlecenia: paginacja');
  const op = [];
  for (let p = 1; p <= 3; p++) op.push(await A.req('GET', `/api/work-orders?page=${p}&pageSize=10`));
  check(op[0].json.total === 23 && op[0].json.workOrders.length === 10 && op[1].json.workOrders.length === 10 && op[2].json.workOrders.length === 3, 'total=23, strony 10/10/3', op[0].json.total);
  const oIds = op.flatMap((x) => x.json.workOrders.map((o) => o.id));
  check(new Set(oIds).size === 23, 'strony zleceń się nie nakładają');
  const w = op[0].json.workOrders[0];
  check(typeof w.customerName === 'string' && typeof w.customerPhone === 'string' && Array.isArray(w.items) && 'orderNumber' in w, 'kształt pozycji: customerName, customerPhone, items');
  r = await A.req('GET', '/api/work-orders');
  check(r.json.workOrders.length === 23 && !('total' in r.json), 'bez page: pełna lista w starym kształcie');

  section('zlecenia: wyszukiwanie i status');
  const wq = (q, extra = '') => `/api/work-orders?page=1&pageSize=50&q=${encodeURIComponent(q)}${extra}`;
  r = await A.req('GET', wq('Kowalska'));
  check(r.json.total === 3 && r.json.workOrders.every((o) => o.customerName === 'Anna Kowalska'), 'q po nazwisku klienta');
  r = await A.req('GET', wq('Nazwisko5'));
  check(r.json.total === 1 || r.json.total === 0 || r.json.workOrders.every((o) => o.customerName.includes('Nazwisko5')), 'zlecenia: q z literami i cyfrą bez dopasowania do telefonów');
  r = await A.req('GET', wq('anna kowalska'));
  check(r.json.total === 3, 'q wielowyrazowe (imię + nazwisko)');
  r = await A.req('GET', wq('+48 601 234 567'));
  check(r.json.total === 3, 'q telefon ze spacjami');
  r = await A.req('GET', wq(orderList[5].orderNumber));
  check(r.json.total === 1 && r.json.workOrders[0].id === orderList[5].id, `q po numerze zlecenia (${orderList[5].orderNumber})`, r.json.total);
  r = await A.req('GET', wq(orderList[5].orderNumber.toLowerCase()));
  check(r.json.total === 1, 'q numer zlecenia bez wielkości liter');
  r = await A.req('GET', '/api/work-orders?page=1&pageSize=50&status=ready');
  check(r.json.total === 10 && r.json.workOrders.every((o) => o.status === 'ready'), 'status=ready → 10', r.json.total);
  r = await A.req('GET', '/api/work-orders?page=1&pageSize=50&status=completed');
  check(r.json.total === 3, 'status=completed → 3');
  r = await A.req('GET', '/api/work-orders?page=1&pageSize=50&status=pending');
  check(r.json.total === 10, 'status=pending → 10');
  r = await A.req('GET', wq('Kowalska', '&status=ready'));
  check(r.json.total === 2 && r.json.workOrders.every((o) => o.status === 'ready'), 'status + q razem');
  r = await A.req('GET', '/api/work-orders?status=ready');
  check(r.json.workOrders.length === 10 && !('total' in r.json), 'status bez page: pełna przefiltrowana lista');
  for (const bad of ['page=0', 'page=1&pageSize=201', 'page=1&pageSize=0', 'page=x', 'page=1&status=zly', `page=1&q=${'a'.repeat(101)}`]) {
    r = await A.req('GET', `/api/work-orders?${bad}`);
    check(r.status === 400 && typeof r.json?.error === 'string', `zlecenia ${bad.slice(0, 30)} → 400: ${r.json?.error}`);
  }

  section('zlecenia: izolacja salonów');
  r = await A.req('GET', '/api/work-orders');
  check(!r.json.workOrders.some((o) => o.id === bOrder.id), 'pełna lista A bez zleceń B');
  r = await A.req('GET', wq(bOrder.orderNumber));
  check(!r.json.workOrders.some((o) => o.id === bOrder.id), 'A nie znajdzie zlecenia B po numerze (numery mogą się powtarzać, id nie)');
  r = await A.req('GET', wq('Salonowicz'));
  check(r.json.total === 0, 'A: q po nazwisku klienta B → 0');
  r = await B.req('GET', '/api/work-orders?page=1&pageSize=200');
  check(r.json.total === 1 && r.json.workOrders[0].id === bOrder.id, 'B widzi tylko swoje zlecenie');
  check(!oIds.includes(bOrder.id), 'żadna strona A nie zawiera zlecenia B');

  section('bez sesji');
  const anon = new Client('anon');
  r = await anon.req('GET', '/api/customers?page=1');
  check(r.status === 401, `klienci bez sesji → ${r.status}`);
  r = await anon.req('GET', '/api/work-orders?page=1');
  check(r.status === 401, `zlecenia bez sesji → ${r.status}`);
});
