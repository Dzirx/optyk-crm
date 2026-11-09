// Izolacja salonów (IDOR): dwa salony próbują dotknąć nawzajem swoich danych.
import { Client, BASE, PASSWORD, check, section, run } from './lib.mjs';

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `${tag.toLowerCase()}-${Date.now()}@test.local`;
  const password = PASSWORD;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  r = await c.req('GET', '/api/auth/csrf');
  r = await c.req('POST', '/api/auth/callback/credentials', undefined, { csrfToken: r.json.csrfToken, email, password, callbackUrl: BASE });
  if (![...c.jar.keys()].some((k) => k.includes('session-token'))) throw new Error(`login ${tag} nieudany (${r.status})`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  const cust = await c.req('POST', '/api/customers', { name: 'Testowy', surname: `Klient${tag}`, phone: '+48500000000', smsConsent: false });
  const cust2 = await c.req('POST', '/api/customers', { name: 'Drugi', surname: `Klient${tag}`, phone: '+48500000001', smsConsent: false });
  const inv = await c.req('POST', '/api/inventory', { name: `Soczewka ${tag}`, quantity: 10, price: '100.00' });
  const order = await c.req('POST', '/api/work-orders', {
    customerId: cust.json.customer.id, receivedAt: '2026-11-08', totalAmount: '', deposit: '',
    items: [{ type: 'do_dali', framePrice: '349', lensPrice: '420', inventoryItemIdOp: inv.json.item.id }],
  });
  const visit = await c.req('POST', '/api/visits', { customerId: cust.json.customer.id, visitDate: '2027-01-15T10:00:00.000Z', visitType: 'badanie' });
  if (order.status !== 201 || visit.status >= 300) throw new Error(`dane ${tag}: order ${order.status} ${JSON.stringify(order.json)} visit ${visit.status} ${JSON.stringify(visit.json)}`);
  return {
    c, customerId: cust.json.customer.id, customer2Id: cust2.json.customer.id, invId: inv.json.item.id,
    order: order.json.workOrder, visitId: visit.json.visit.id,
  };
}

async function invQty(s, id) {
  const r = await s.c.req('GET', '/api/inventory');
  return r.json.items.find((i) => i.id === id)?.quantity;
}

await run(async () => {
  const A = await setupSalon('A');
  const B = await setupSalon('B');
  const bItem = B.order.items[0];
  const aItem = A.order.items[0];

  section('poprawka sumy');
  check(Number(A.order.totalAmount) === 769, 'pusta kwota → suma pozycji 769', A.order.totalAmount);
  check((await invQty(A, A.invId)) === 9, 'stan magazynu A zmniejszony do 9');

  section('ataki z konta A na dane salonu B (oczekiwane 404)');
  let r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, items: [{ ...bItem, opSph: '-9.99', lensPrice: '1' }] });
  check(r.status === 404, `nadpisanie pozycji zlecenia B → ${r.status}`, r.json);
  let bOrders = await B.c.req('GET', '/api/work-orders');
  const bItemAfter = bOrders.json.workOrders[0].items[0];
  check(bItemAfter.opSph === null && Number(bItemAfter.lensPrice) === 420, 'pozycja B bez zmian');

  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, customerId: B.customerId });
  check(r.status === 404, `podpięcie klienta B pod zlecenie A → ${r.status}`, r.json);
  const aOrders = await A.c.req('GET', '/api/work-orders');
  check(!JSON.stringify(aOrders.json).includes('KlientB'), 'lista zleceń A nie zawiera danych klienta B');

  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, items: [{ ...aItem }, { id: 'new-x', type: 'do_dali', inventoryItemIdOl: B.invId }] });
  check(r.status === 404, `zdjęcie towaru B przez edycję zlecenia A → ${r.status}`, r.json);
  r = await A.c.req('POST', '/api/work-orders', { customerId: A.customerId, receivedAt: '2026-11-08', items: [{ type: 'do_dali', inventoryItemIdFrame: B.invId }] });
  check(r.status === 404, `zdjęcie towaru B przez nowe zlecenie A → ${r.status}`, r.json);
  check((await invQty(B, B.invId)) === 9, 'stan magazynu B bez zmian (9)');

  r = await A.c.req('POST', '/api/work-orders', { customerId: B.customerId, receivedAt: '2026-11-08', items: [] });
  check(r.status === 404, `nowe zlecenie A dla klienta B → ${r.status}`, r.json);

  r = await A.c.req('PATCH', '/api/visits', { id: A.visitId, customerId: B.customerId });
  check(r.status === 404, `przepięcie wizyty A na klienta B → ${r.status}`, r.json);

  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, customerId: 'to-nie-uuid' });
  check(r.status === 404, `zły format id → 404 zamiast 500 (${r.status})`, r.json);
  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, items: [{ id: 12345, type: 'do_dali' }] });
  check(r.status === 404, `id pozycji jako liczba → ${r.status}`, r.json);

  section('zwykłe operacje A dalej działają');
  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, items: [{ ...aItem, lensPrice: '500' }], totalAmount: '' });
  check(r.status === 200 && Number(r.json.workOrder.totalAmount) === 849, `edycja własnej pozycji → ${r.status}, suma ${r.json?.workOrder?.totalAmount}`);
  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, customerId: A.customer2Id });
  check(r.status === 200, `zmiana klienta na innego klienta A → ${r.status}`, r.json);
  r = await A.c.req('PATCH', '/api/work-orders', { id: A.order.id, items: [{ ...r.json.workOrder.items[0] }, { id: 'new-y', type: 'do_dali', inventoryItemIdOl: A.invId }] });
  check(r.status === 200, `nowa pozycja z własnym towarem → ${r.status}`, r.json);
  check((await invQty(A, A.invId)) === 8, 'stan magazynu A = 8');
  r = await A.c.req('PATCH', '/api/visits', { id: A.visitId, customerId: A.customer2Id });
  check(r.status === 200, `przepięcie wizyty na innego klienta A → ${r.status}`, r.json);
  r = await A.c.req('PATCH', '/api/visits', { id: A.visitId, customerId: A.customer2Id, notes: 'ten sam klient' });
  check(r.status === 200, `zapis wizyty z tym samym klientem → ${r.status}`, r.json);


});
