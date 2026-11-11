// Paginacja i wyszukiwanie po stronie serwera: /api/customers i /api/work-orders + izolacja salonów.
import { Client, PASSWORD, check, section, run, sql } from './lib.mjs';

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

  section('magazyn: paginacja, q, category, izolacja');
  const mkInv = (c, name, category, notes) => c.req('POST', '/api/inventory', { name, quantity: 3, category, notes });
  const invIdx = Array.from({ length: 55 }, (_, i) => i);
  const invCreated = await inChunks(invIdx, (i) => mkInv(A, `Szkło ${String(i).padStart(2, '0')}`, i < 20 ? 'Szkła' : i < 25 ? 'Oprawki' : null, i === 30 ? 'rabat 50% do końca' : undefined));
  check(invCreated.every((r) => r.status === 201), 'utworzono 55 pozycji magazynu w A');
  const delItem = invCreated[54].json.item;
  r = await A.req('DELETE', `/api/inventory/${delItem.id}`);
  check(r.status < 300, `usunięto pozycję (${r.status})`);
  await mkInv(B, 'Szkło obce', 'ObcaKategoria');
  // A ma teraz 54 aktywne pozycje (55 - 1 usunięta)
  const ip = [];
  for (let p = 1; p <= 3; p++) ip.push(await A.req('GET', `/api/inventory?page=${p}&pageSize=20`));
  check(ip.every((x) => x.status === 200), 'strony magazynu 1-3 → 200');
  check(ip[0].json.total === 54 && ip[0].json.page === 1 && ip[0].json.pageSize === 20, 'total=54, page, pageSize', ip[0].json.total);
  check(ip[0].json.items.length === 20 && ip[1].json.items.length === 20 && ip[2].json.items.length === 14, 'rozmiary stron 20/20/14');
  const invIds = ip.flatMap((x) => x.json.items.map((i) => i.id));
  check(new Set(invIds).size === 54, 'strony magazynu się nie nakładają');
  check(!invIds.includes(delItem.id), 'usunięta pozycja wykluczona');
  const names = ip.flatMap((x) => x.json.items.map((i) => i.name));
  check(names.every((n, i) => i === 0 || names[i - 1] <= n), 'kolejność: nazwa rosnąco');
  r = await A.req('GET', '/api/inventory?page=1');
  check(r.json.pageSize === 50 && r.json.items.length === 50, 'magazyn: domyślny pageSize 50');
  check(JSON.stringify(r.json.categories) === JSON.stringify(['Oprawki', 'Szkła']), 'categories = kategorie salonu (bez obcych, bez null)', r.json.categories);
  r = await A.req('GET', '/api/inventory?page=9&pageSize=20');
  check(r.status === 200 && r.json.items.length === 0 && r.json.total === 54, 'magazyn: strona poza zakresem → pusta, total ok');
  const iq = (q, extra = '') => `/api/inventory?page=1&pageSize=50&q=${encodeURIComponent(q)}${extra}`;
  r = await A.req('GET', iq('szkło 1'));
  check(r.json.total === 10 && r.json.items.every((i) => i.name.includes('Szkło 1')), 'q po nazwie (bez wielkości liter)', r.json.total);
  r = await A.req('GET', iq('OPRAWKI'));
  check(r.json.total === 5 && r.json.items.every((i) => i.category === 'Oprawki'), 'q po kategorii');
  r = await A.req('GET', iq('rabat'));
  check(r.json.total === 1 && r.json.items[0].name === 'Szkło 30', 'q po uwagach');
  r = await A.req('GET', iq('%'));
  check(r.status === 200 && r.json.total === 1, 'q ze znakiem % traktowane dosłownie (tylko uwaga „50%”)', r.json.total);
  r = await A.req('GET', iq('_'));
  check(r.status === 200 && r.json.total === 0, 'q ze znakiem _ traktowane dosłownie');
  r = await A.req('GET', iq('   '));
  check(r.json.total === 54, 'q z samych spacji = brak filtra');
  r = await A.req('GET', '/api/inventory?page=1&category=' + encodeURIComponent('Szkła'));
  check(r.json.total === 20 && r.json.items.every((i) => i.category === 'Szkła'), 'category=Szkła → 20');
  check(r.json.categories.length === 2, 'categories nie zależą od filtra');
  r = await A.req('GET', '/api/inventory' + '?page=1&category=Szk%C5%82a&q=' + encodeURIComponent('Szkło 0'));
  check(r.json.total === 10, 'category + q razem', r.json.total);
  for (const bad of ['page=0', 'page=1&pageSize=201', 'page=x', `page=1&q=${'a'.repeat(101)}`]) {
    r = await A.req('GET', `/api/inventory?${bad}`);
    check(r.status === 400 && typeof r.json?.error === 'string', `magazyn ${bad.slice(0, 30)} → 400: ${r.json?.error}`);
  }
  r = await A.req('GET', '/api/inventory');
  check(r.status === 200 && r.json.items.length === 54 && !('total' in r.json) && !('categories' in r.json), 'bez page: pełna lista w starym kształcie (54, bez deleted)', r.json.items?.length);
  check(!r.json.items.some((i) => i.name === 'Szkło obce'), 'pełna lista A bez pozycji B');
  r = await A.req('GET', iq('obce'));
  check(r.json.total === 0, 'A: q po pozycji B → 0');
  r = await A.req('GET', '/api/inventory?page=1&category=ObcaKategoria');
  check(r.json.total === 0, 'A: category B → 0');
  r = await B.req('GET', '/api/inventory?page=1');
  check(r.json.total === 1 && r.json.items[0].name === 'Szkło obce' && JSON.stringify(r.json.categories) === '["ObcaKategoria"]', 'B widzi tylko swoje i swoje kategorie');
  r = await new Client('anon').req('GET', '/api/inventory?page=1');
  check(r.status === 401, `magazyn bez sesji → ${r.status}`);


  section('wizyty: granice dnia w czasie polskim (serwer w UTC)');
  const vcust = (await A.req('POST', '/api/customers', { name: 'Wizytowy', surname: 'Dzienny', phone: '+48500999001', smsConsent: true })).json.customer;
  const bcust = (await B.req('POST', '/api/customers', { name: 'Obcy', surname: 'Wizytowy', phone: '+48500999002', smsConsent: true })).json.customer;
  const mkVisit = (c, customerId, iso) => c.req('POST', '/api/visits', { customerId, visitDate: iso });
  // Zwykły dzień (CET, UTC+1): 11.11.2026 w Polsce to 10.11 23:00Z … 11.11 23:00Z.
  // Zmiana na czas letni 29.03.2026: dzień ma 23 h (28.03 23:00Z … 29.03 22:00Z).
  // Zmiana na czas zimowy 25.10.2026: dzień ma 25 h (24.10 22:00Z … 25.10 23:00Z).
  const stamps = [
    '2026-11-10T22:30:00.000Z', // 10.11 23:30 PL
    '2026-11-10T23:30:00.000Z', // 11.11 00:30 PL
    '2026-11-11T22:30:00.000Z', // 11.11 23:30 PL
    '2026-11-11T23:30:00.000Z', // 12.11 00:30 PL
    '2026-03-28T22:30:00.000Z', // 28.03 23:30 PL
    '2026-03-28T23:30:00.000Z', // 29.03 00:30 PL (dzień zmiany na letni)
    '2026-03-29T21:30:00.000Z', // 29.03 23:30 PL (CEST)
    '2026-03-29T22:30:00.000Z', // 30.03 00:30 PL
    '2026-10-24T21:30:00.000Z', // 24.10 23:30 PL (CEST)
    '2026-10-24T22:30:00.000Z', // 25.10 00:30 PL (dzień zmiany na zimowy)
    '2026-10-25T22:30:00.000Z', // 25.10 23:30 PL (CET)
    '2026-10-25T23:30:00.000Z', // 26.10 00:30 PL
  ];
  check((await inChunks(stamps, (iso) => mkVisit(A, vcust.id, iso))).every((x) => x.status === 201), 'utworzono wizyty graniczne');
  const dayVisits = async (from, to) => (await A.req('GET', `/api/visits?customerId=${vcust.id}&from=${from}&to=${to}`)).json.visits.map((v) => new Date(v.visitDate).toISOString());
  let got = await dayVisits('2026-11-10T23:00:00.000Z', '2026-11-11T23:00:00.000Z');
  check(JSON.stringify(got.sort()) === JSON.stringify(['2026-11-10T23:30:00.000Z', '2026-11-11T22:30:00.000Z']), 'dzień 11.11: 00:30 i 23:30 czasu polskiego', got);
  got = await dayVisits('2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z');
  check(JSON.stringify(got.sort()) === JSON.stringify(['2026-03-28T23:30:00.000Z', '2026-03-29T21:30:00.000Z']), 'dzień zmiany na letni (23 h): 00:30 i 23:30', got);
  got = await dayVisits('2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z');
  check(JSON.stringify(got.sort()) === JSON.stringify(['2026-10-24T22:30:00.000Z', '2026-10-25T22:30:00.000Z']), 'dzień zmiany na zimowy (25 h): 00:30 i 23:30', got);
  got = await dayVisits('2026-03-29T22:00:00.000Z', '2026-03-30T22:00:00.000Z');
  check(got.length === 1 && got[0] === '2026-03-29T22:30:00.000Z', '30.03: tylko wizyta z 00:30', got);
  r = await B.req('GET', '/api/visits?from=2026-11-10T23:00:00.000Z&to=2026-11-11T23:00:00.000Z');
  check(r.status === 200 && r.json.visits.length === 0, 'salon B nie widzi wizyt dnia salonu A');
  for (const bad of ['from=2026-11-11', 'to=jutro']) {
    r = await A.req('GET', `/api/visits?${bad}`);
    check(r.status === 400, `wizyty ${bad} → 400`);
  }

  section('wizyty klienta: paginacja 50 na stronę');
  const many = await A.req('POST', '/api/customers', { name: 'Stały', surname: 'Bywalec', phone: '+48500999003', smsConsent: true });
  const mc = many.json.customer;
  const many55 = Array.from({ length: 55 }, (_, i) => new Date(Date.UTC(2025, 0, 1, 8 + (i % 8), 0) + Math.floor(i / 8) * 86400000).toISOString());
  // Dwie wizyty o tej samej godzinie sprawdzają stabilny porządek (id rozstrzyga remisy).
  many55.push(many55[54], many55[54]);
  check((await inChunks(many55, (iso) => mkVisit(A, mc.id, iso))).every((x) => x.status === 201), 'utworzono 57 wizyt jednego klienta');
  const vp = [];
  for (let p = 1; p <= 3; p++) vp.push(await A.req('GET', `/api/visits?customerId=${mc.id}&page=${p}&pageSize=50`));
  check(vp.every((x) => x.status === 200), 'strony 1-3 → 200');
  check(vp[0].json.total === 57 && vp[0].json.page === 1 && vp[0].json.pageSize === 50, 'total=57, page, pageSize', { t: vp[0].json.total });
  check(vp[0].json.visits.length === 50 && vp[1].json.visits.length === 7 && vp[2].json.visits.length === 0, 'rozmiary stron 50/7/0');
  const vids = vp.flatMap((x) => x.json.visits.map((v) => v.id));
  check(new Set(vids).size === 57, 'strony się nie nakładają (57 unikalnych id)');
  const vdates = vp.flatMap((x) => x.json.visits.map((v) => v.visitDate));
  check(vdates.every((d, i) => i === 0 || vdates[i - 1] >= d), 'kolejność: od najnowszych');
  r = await A.req('GET', `/api/visits?customerId=${mc.id}&page=1`);
  check(r.json.pageSize === 50 && r.json.visits.length === 50, 'domyślny pageSize 50');
  r = await A.req('GET', `/api/visits?customerId=${mc.id}&page=2&pageSize=20`);
  check(r.json.visits.length === 20 && r.json.total === 57, 'pageSize=20, strona 2');
  r = await A.req('GET', `/api/visits?customerId=${mc.id}`);
  check(r.status === 200 && r.json.visits.length === 57 && !('total' in r.json), 'bez page: pełna lista w starym kształcie');
  for (const bad of ['page=0', 'page=1&pageSize=201', 'page=x']) {
    r = await A.req('GET', `/api/visits?customerId=${mc.id}&${bad}`);
    check(r.status === 400 && typeof r.json?.error === 'string', `wizyty ${bad} → 400`);
  }
  r = await B.req('GET', `/api/visits?customerId=${mc.id}&page=1`);
  check(r.status === 200 && r.json.total === 0 && r.json.visits.length === 0, 'salon B: wizyty klienta salonu A → pusto');
  r = await B.req('GET', `/api/visits?customerId=${bcust.id}&page=1`);
  check(r.json.total === 0, 'klient B bez wizyt → 0');
  r = await new Client('anon').req('GET', '/api/visits?page=1');
  check(r.status === 401, `wizyty bez sesji → ${r.status}`);

  section('klienci/ids: filtry, limit, izolacja salonów');
  // Klienci z 5 i 2 wizytami (przedziały „4–9” i „1–3”), obie wizyty przed 2025 r.
  const mid = (await A.req('POST', '/api/customers', { name: 'Średni', surname: 'Zzz-Mid', phone: '+48500999004', smsConsent: true })).json.customer;
  const few = (await A.req('POST', '/api/customers', { name: 'Rzadki', surname: 'Zzz-Few', phone: '+48500999005', smsConsent: true })).json.customer;
  for (let i = 0; i < 5; i++) await mkVisit(A, mid.id, `2024-06-0${i + 1}T10:00:00.000Z`);
  for (let i = 0; i < 2; i++) await mkVisit(A, few.id, `2024-03-0${i + 1}T10:00:00.000Z`);
  // Salon A ma teraz: 56 klientów z początku + 3 z wizytami (vcust, mc) i 0 wizyt reszta.
  const total = (await A.req('GET', '/api/customers?page=1')).json.total;
  const totalB = (await B.req('GET', '/api/customers?page=1')).json.total;
  r = await A.req('GET', '/api/customers/ids');
  check(r.status === 200 && r.json.ids.length === total && r.json.total === total && r.json.limit === 5000, 'ids bez filtrów: wszyscy klienci salonu', { total: r.json.total, want: total });
  check(new Set(r.json.ids).size === total, 'ids bez powtórzeń');
  const pageIds = (await A.req('GET', '/api/customers?page=1&pageSize=200')).json.customers.map((c) => c.id).sort();
  check(JSON.stringify([...r.json.ids].sort()) === JSON.stringify(pageIds), 'ids = id z listy klientów');
  r = await A.req('GET', '/api/customers/ids?q=kowalsk');
  check(r.json.total === 6 && r.json.ids.length === 6, 'ids?q=kowalsk → 6', r.json.total);
  r = await A.req('GET', '/api/customers/ids?q=' + encodeURIComponent('+48 601 234 567'));
  check(r.json.total === 1, 'ids?q=telefon → 1');
  // Zgoda: odznaczamy dwóch klientów „Kowalski”.
  const kowCust = (await A.req('GET', '/api/customers?page=1&q=kowalski')).json.customers.slice(0, 2);
  for (const c of kowCust) await A.req('PATCH', `/api/customers/${c.id}`, { smsConsent: false });
  r = await A.req('GET', '/api/customers/ids?smsConsent=false');
  check(r.json.total === 2 && JSON.stringify([...r.json.ids].sort()) === JSON.stringify(kowCust.map((c) => c.id).sort()), 'ids?smsConsent=false → 2');
  r = await A.req('GET', '/api/customers/ids?smsConsent=true&q=kowalsk');
  check(r.json.total === 4, 'ids?smsConsent=true&q → 4', r.json.total);
  r = await A.req('GET', '/api/customers?page=1&q=kowalsk&smsConsent=true');
  check(r.json.selectableTotal === 4 && r.json.total === 4, 'lista: selectableTotal ze zgodą');
  r = await A.req('GET', '/api/customers?page=1&q=kowalsk');
  check(r.json.total === 6 && r.json.selectableTotal === 4, 'lista bez filtra zgody: total 6, selectableTotal 4', r.json);

  // Filtry wizyt (strona wiadomości): liczba wizyt, data wizyty (dni czasu polskiego), sortowanie.
  r = await A.req('GET', '/api/customers/ids?visitRanges=3');
  check(r.json.total === 2 && [vcust.id, mc.id].every((id) => r.json.ids.includes(id)), 'visitRanges=3 (10+ wizyt) → klienci z 12 i 57 wizytami', r.json);
  r = await A.req('GET', '/api/customers/ids?visitRanges=2');
  check(r.json.total === 1 && r.json.ids[0] === mid.id, 'visitRanges=2 (4–9) → klient z 5 wizytami', r.json);
  r = await A.req('GET', '/api/customers/ids?visitRanges=1');
  check(r.json.total === 1 && r.json.ids[0] === few.id, 'visitRanges=1 (1–3) → klient z 2 wizytami', r.json);
  r = await A.req('GET', '/api/customers/ids?visitRanges=0');
  check(r.json.total === total - 4 && ![vcust, mc, mid, few].some((c) => r.json.ids.includes(c.id)), 'visitRanges=0 (brak wizyt) → reszta', r.json.total);
  r = await A.req('GET', '/api/customers/ids?visitRanges=1,2');
  check(r.json.total === 2, 'visitRanges=1,2 → suma przedziałów', r.json.total);
  r = await A.req('GET', '/api/customers/ids?visitRanges=3&visitFrom=2026-11-11&visitTo=2026-11-11');
  check(r.json.total === 1 && r.json.ids[0] === vcust.id, 'visitRanges + data wizyty razem (AND)');
  r = await A.req('GET', '/api/customers/ids?visitFrom=2026-11-11&visitTo=2026-11-11');
  check(r.json.total === 1 && r.json.ids[0] === vcust.id, 'visitFrom=visitTo=2026-11-11 → klient z wizytą w tym dniu (czas polski)');
  r = await A.req('GET', '/api/customers/ids?visitFrom=2026-11-13');
  check(r.json.total === 0, 'visitFrom po wszystkich wizytach → 0');
  r = await A.req('GET', '/api/customers/ids?visitFrom=2025-01-01&visitTo=2025-01-01');
  check(r.json.total === 1 && r.json.ids[0] === mc.id, 'wizyta z 1.01.2025 → klient mc');
  r = await A.req('GET', '/api/customers/ids?visitTo=2024-12-31');
  check(r.json.total === 2 && [mid.id, few.id].every((id) => r.json.ids.includes(id)), 'visitTo=2024-12-31 → klienci z wizytami z 2024');
  r = await B.req('GET', '/api/customers/ids?visitRanges=3');
  check(r.json.total === 0 && r.json.ids.length === 0, 'salon B: visitRanges nie ujawnia klientów A');
  r = await A.req('GET', '/api/customers?page=1&visitRanges=3&sort=visits-desc');
  check(r.json.total === 2 && r.json.customers[0].visitCount === 57 && r.json.customers[1].visitCount === 12, 'lista + visitRanges + sort=visits-desc');
  r = await A.req('GET', '/api/customers?page=1&sort=visits-desc');
  check([mc, vcust, mid, few].every((c, i) => r.json.customers[i].id === c.id), 'sort=visits-desc: malejąca liczba wizyt');
  r = await A.req('GET', '/api/customers?page=1&pageSize=200&sort=visits-asc');
  check(r.json.customers[0].visitCount === 0 && r.json.customers.at(-1).id === mc.id, 'sort=visits-asc: bez wizyt pierwsze');
  r = await A.req('GET', '/api/customers?page=1&sort=date-desc');
  check([vcust, mc, mid, few].every((c, i) => r.json.customers[i].id === c.id) && r.json.customers[4].visitCount === 0, 'sort=date-desc: od najnowszej wizyty, bez wizyt na końcu');
  check(r.json.customers.length === 50 && new Set(r.json.customers.map((c) => c.id)).size === 50, 'sort=date-desc: pełna strona bez powtórzeń');
  const dpages = [];
  for (let p = 1; p <= 2; p++) dpages.push(...(await A.req('GET', `/api/customers?page=${p}&pageSize=50&sort=date-desc`)).json.customers.map((c) => c.id));
  check(new Set(dpages).size === total && dpages.length === total, 'sort=date-desc: strony się nie nakładają', { n: dpages.length, total });
  r = await A.req('GET', '/api/customers?page=1&pageSize=200&sort=date-asc');
  check(r.json.customers[0].visitCount === 0 && r.json.customers.at(-1).id === vcust.id, 'sort=date-asc: bez wizyt pierwsze, najnowsza ostatnia');
  r = await A.req('GET', '/api/customers?page=1&sort=name-asc');
  check(r.json.customers[0].surname === 'Bywalec', 'sort=name-asc: pierwsze nazwisko Bywalec', r.json.customers[0].surname);
  r = await A.req('GET', '/api/customers?page=1&sort=name-desc');
  check(r.json.customers[0].surname === 'Zzz-Mid' && r.json.customers[1].surname === 'Zzz-Few', 'sort=name-desc');
  for (const bad of ['visitRanges=9', 'visitRanges=a', 'visitFrom=2026-02-30', 'visitTo=x']) {
    r = await A.req('GET', `/api/customers/ids?${bad}`);
    check(r.status === 400 && typeof r.json?.error === 'string', `ids ${bad} → 400: ${r.json?.error}`);
  }
  r = await A.req('GET', '/api/customers?page=1&sort=drop');
  check(r.status === 400, `lista sort=drop → ${r.status}`);
  r = await new Client('anon').req('GET', '/api/customers/ids');
  check(r.status === 401, `ids bez sesji → ${r.status}`);
  r = await B.req('GET', '/api/customers/ids');
  check(r.json.total === totalB && !r.json.ids.some((id) => pageIds.includes(id)), 'salon B: ids tylko własnych klientów');

  section('klienci/ids: limit 5000 (salon C z 5005 klientami)');
  const C = await setupSalon('C');
  const bizC = sql(`select b.id from businesses b join users u on u.id=b.user_id where b.name='Optyk C'`);
  sql(`insert into customers (id, business_id, name, surname, phone, sms_consent, created_at, updated_at)
       select gen_random_uuid(), '${bizC}', 'Masowy', 'Klient' || g, '+4850' || lpad(g::text, 7, '0'), true, now(), now() from generate_series(1, 5005) g`);
  r = await C.req('GET', '/api/customers/ids?smsConsent=true');
  check(r.status === 200 && r.json.total === 5005 && r.json.ids.length === 5000 && r.json.limit === 5000, 'ids przycięte do 5000, total=5005', { total: r.json.total, n: r.json.ids?.length });
  check(new Set(r.json.ids).size === 5000, 'ids po przycięciu bez powtórzeń');
  r = await C.req('GET', '/api/customers/ids?q=Klient500');
  check(r.status === 200 && r.json.total === 7 && r.json.ids.length === 7, 'ids?q w dużym salonie → 7 (Klient500, Klient5000–5005)', r.json.total);
  r = await C.req('POST', '/api/sms/campaigns', { message: 'x', idempotencyKey: 'pagination-limit-key', customerIds: Array.from({ length: 5001 }, (_, i) => String(i)) });
  check(r.status === 400 && /5000/.test(r.json?.error ?? ''), `bulk >5000 odbiorców → ${r.status}: ${r.json?.error}`);

  section('bez sesji');
  const anon = new Client('anon');
  r = await anon.req('GET', '/api/customers?page=1');
  check(r.status === 401, `klienci bez sesji → ${r.status}`);
  r = await anon.req('GET', '/api/work-orders?page=1');
  check(r.status === 401, `zlecenia bez sesji → ${r.status}`);
});
