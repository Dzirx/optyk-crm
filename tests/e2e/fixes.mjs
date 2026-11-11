// Poprawki: data odbioru, numeracja zleceń, magazyn i walidacja, usuwanie klienta, wizyty, strefa czasowa, limit logowań.
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

await run(async () => {
  const c = new Client('A');
  const stamp = Date.now();
  const email = `Salon.${stamp}@Test.Local`;
  const password = PASSWORD;
  let r = await c.req('POST', '/api/auth/register', { name: 'Salon', email, password });
  check(r.status === 201 && r.json.user.email === email.toLowerCase(), `rejestracja zapisuje e-mail małymi literami (${r.json?.user?.email})`);
  r = await c.req('POST', '/api/auth/register', { name: 'Salon', email: email.toUpperCase(), password });
  check(r.status === 400, `ten sam e-mail inną wielkością liter → 400 (${r.status})`);
  check(await c.login(email.toUpperCase(), password), 'logowanie e-mailem z wielkimi literami');
  await c.req('POST', '/api/business', { name: 'Optyk', googleReviewUrl: 'https://g.page/test' });

  const cust = (await c.req('POST', '/api/customers', { name: 'Jan', surname: 'Testowy', phone: '+48500000000', smsConsent: false })).json.customer;
  const cust2 = (await c.req('POST', '/api/customers', { name: 'Ewa', surname: 'Testowa', phone: '+48500000001', smsConsent: false })).json.customer;
  const inv = (await c.req('POST', '/api/inventory', { name: 'Soczewka 1 szt', quantity: 1, price: '100' })).json.item;
  const inv5 = (await c.req('POST', '/api/inventory', { name: 'Oprawka 5 szt', quantity: 5, price: '300' })).json.item;
  const qty = async (id) => (await c.req('GET', '/api/inventory')).json.items.find((i) => i.id === id).quantity;

  section('1. zmiana statusu nie kasuje daty odbioru');
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', pickupDate: '2026-11-20', items: [] });
  const o1 = r.json.workOrder;
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { status: 'ready' });
  check(r.status === 200 && r.json.workOrder.status === 'ready' && r.json.workOrder.pickupDate?.startsWith('2026-11-20'), `status ready, data odbioru zostaje (${r.json?.workOrder?.pickupDate})`);
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { pickupDate: '' });
  check(r.status === 200 && r.json.workOrder.pickupDate === null, 'puste pole daty odbioru nadal ją czyści');

  section('4. numery zleceń');
  const par = await Promise.all([1, 2, 3, 4].map(() => c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [] })));
  const nums = par.map((x) => x.json.workOrder.orderNumber);
  check(new Set(nums).size === 4, `4 równoczesne zlecenia → różne numery (${nums.join(', ')})`);
  const year = new Date().getFullYear();
  const mid = par.map((x) => x.json.workOrder).sort((x, y) => x.orderNumber.localeCompare(y.orderNumber))[1];
  await c.req('DELETE', `/api/work-orders/${mid.id}`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [] });
  check(r.json.workOrder.orderNumber === `ZL/${year}/006`, `po usunięciu zlecenia numer nie powtarza się (${r.json.workOrder.orderNumber})`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, orderNumber: `ZL/${year}/006`, receivedAt: '2026-11-08', items: [] });
  check(r.status === 409, `ręczny numer już zajęty → 409 (${r.status})`, r.json);
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { orderNumber: `ZL/${year}/006` });
  check(r.status === 409, `zmiana numeru na zajęty → 409 (${r.status})`);
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { orderNumber: o1.orderNumber, notes: 'x' });
  check(r.status === 200, `zapis z tym samym numerem → 200 (${r.status})`);

  section('5. magazyn i walidacja');
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', inventoryItemIdOp: inv.id }] });
  check(r.status === 201 && (await qty(inv.id)) === 0, 'pierwsze zlecenie zdejmuje ostatnią sztukę');
  const oInv = r.json.workOrder;
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', inventoryItemIdOl: inv.id }] });
  check(r.status === 409 && (await qty(inv.id)) === 0, `brak towaru → 409, stan 0 (${r.status}: ${r.json?.error})`);
  const countBefore = (await c.req('GET', '/api/work-orders')).json.workOrders.length;
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', inventoryItemIdFrame: inv5.id }, { type: 'do_bliży', inventoryItemIdOp: inv.id }] });
  check(r.status === 409 && (await qty(inv5.id)) === 5 && (await c.req('GET', '/api/work-orders')).json.workOrders.length === countBefore, 'transakcja wycofana: oprawka nie zdjęta, zlecenie nie powstało');
  r = await c.req('PATCH', `/api/work-orders/${oInv.id}`, { items: [{ ...oInv.items[0], lensPrice: '200' }] });
  check(r.status === 200, `edycja pozycji z tym samym towarem przy stanie 0 → 200 (${r.status})`, r.json);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', lensPrice: 'abc' }] });
  check(r.status === 400, `cena „abc” → 400 (${r.status}: ${r.json?.error})`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', framePrice: '-50' }] });
  check(r.status === 400, `ujemna cena → 400 (${r.status})`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', opAxis: '12.5' }] });
  check(r.status === 400, `oś 12.5 → 400 (${r.status})`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', lensPrice: '199,50' }] });
  check(r.status === 201 && Number(r.json.workOrder.totalAmount) === 199.5, `cena z przecinkiem 199,50 → 199.5 (${r.json?.workOrder?.totalAmount})`);
  section('szkła per oko i oprawka (tabela „Szkła i oprawka”)');
  const hoya = (await c.req('POST', '/api/inventory', { name: 'Hoya 1.6 AR', quantity: 3, price: '150' })).json.item;
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{
    type: 'do_dali', opLensName: 'Hoya 1.6 AR', opLensPrice: '150', inventoryItemIdOp: hoya.id,
    olLensName: 'Essilor 1.67 Crizal', olLensPrice: '180,50', olOrdered: true, ownFrame: true,
  }] });
  const perEye = r.json.workOrder?.items?.[0];
  check(r.status === 201 && perEye.opLensName === 'Hoya 1.6 AR' && perEye.olLensName === 'Essilor 1.67 Crizal'
    && Number(perEye.opLensPrice) === 150 && Number(perEye.olLensPrice) === 180.5, `pola per oko zapisane (${r.status})`, r.json);
  check(Number(perEye?.lensPrice) === 330.5 && Number(r.json.workOrder.totalAmount) === 330.5, `lensPrice = OP + OL (${perEye?.lensPrice}), kwota zlecenia ${r.json.workOrder?.totalAmount}`);
  check(perEye?.ownFrame === true && perEye.olOrdered === true && perEye.opOrdered === false && perEye.inventoryItemIdOl === null, 'oprawka własna, OL do zamówienia bez towaru');
  check((await qty(hoya.id)) === 2, 'stan zdjęty tylko dla OP (3 → 2)');
  r = await c.req('PATCH', `/api/work-orders/${r.json.workOrder.id}`, { items: [{ ...perEye, olLensPrice: '', olLensName: '' }] });
  check(r.status === 200 && Number(r.json.workOrder.items[0].lensPrice) === 150 && r.json.workOrder.items[0].olLensPrice === null, `usunięcie szkła OL → lensPrice 150 (${r.json.workOrder?.items?.[0]?.lensPrice})`);
  r = await c.req('PATCH', `/api/work-orders/${r.json.workOrder.id}`, { items: [{ ...r.json.workOrder.items[0], opLensPrice: '', opLensName: '', inventoryItemIdOp: '', lensPrice: '' }] });
  check(r.status === 200 && r.json.workOrder.items[0].lensPrice === null && (await qty(hoya.id)) === 3, 'brak obu szkieł → lensPrice null, towar wrócił na stan');
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', olLensName: 'Zamówione ręcznie', olLensPrice: '99', olOrdered: true }] });
  check(r.status === 201 && r.json.workOrder.items[0].olOrdered === true && r.json.workOrder.items[0].inventoryItemIdOl === null && (await qty(hoya.id)) === 3, 'do zamówienia z nazwą ręczną: bez powiązania, stan bez zmian');
  const oldOrdered = (await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', opLensName: 'Hoya', inventoryItemIdOp: hoya.id, opOrdered: true }] })).json.workOrder;
  check((await qty(hoya.id)) === 2, 'stary kształt: do zamówienia + powiązanie nadal zdejmuje towar');
  r = await c.req('PATCH', `/api/work-orders/${oldOrdered.id}`, { items: [oldOrdered.items[0]] });
  check(r.status === 200 && r.json.workOrder.items[0].inventoryItemIdOp === hoya.id && (await qty(hoya.id)) === 2, 'zapis bez zmian zachowuje powiązanie i stan');
  r = await c.req('PATCH', `/api/work-orders/${oldOrdered.id}`, { items: [{ ...oldOrdered.items[0], inventoryItemIdOp: '', opLensName: 'Inna' }] });
  check(r.status === 200 && r.json.workOrder.items[0].inventoryItemIdOp === null && (await qty(hoya.id)) === 3, 'odpięcie powiązania zwraca towar na stan');
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', opLensPrice: 'abc' }] });
  check(r.status === 400 && /Cena szkła OP/.test(r.json.error), `zła cena OP → 400 (${r.json?.error})`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', lensType: 'organiczne AR', lensPrice: '420' }] });
  check(r.status === 201 && r.json.workOrder.items[0].lensType === 'organiczne AR' && Number(r.json.workOrder.items[0].lensPrice) === 420
    && Number(r.json.workOrder.totalAmount) === 420, 'stary kształt (lensType + lensPrice) nadal przyjmowany');

  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', totalAmount: '100', deposit: '150', items: [] });
  check(r.status === 400, `zaliczka > kwota → 400 (${r.status}: ${r.json?.error})`);
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { totalAmount: '100', deposit: '100' });
  check(r.status === 200, 'zaliczka = kwota → 200');
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { deposit: '101' });
  check(r.status === 400, `sama zaliczka 101 przy kwocie 100 → 400 (${r.status})`);
  r = await c.req('PATCH', `/api/work-orders/${o1.id}`, { status: 'zly' });
  check(r.status === 400, `nieznany status → 400 (${r.status})`);
  r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: 'nie-data', items: [] });
  check(r.status === 400, `zła data → 400 (${r.status})`);
  r = await c.req('POST', '/api/inventory', { name: 'X', quantity: '-3' });
  check(r.status === 400, `magazyn: ilość -3 → 400 (${r.status})`);
  r = await c.req('POST', '/api/inventory', { name: 'X', quantity: 'abc' });
  check(r.status === 400, `magazyn: ilość „abc” → 400 (${r.status})`);
  r = await c.req('PATCH', `/api/inventory/${inv5.id}`, { price: 'zł' });
  check(r.status === 400, `magazyn: cena „zł” → 400 (${r.status})`);

  section('6. usunięcie klienta zwraca towar');
  r = await c.req('POST', '/api/work-orders', { customerId: cust2.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', inventoryItemIdFrame: inv5.id, inventoryItemIdOp: inv5.id }] });
  check(r.status === 201 && (await qty(inv5.id)) === 3, 'zlecenie klienta 2 zdjęło 2 szt. (stan 3)');
  r = await c.req('DELETE', `/api/customers/${cust2.id}`);
  check(r.status === 200 && (await qty(inv5.id)) === 5, `po usunięciu klienta stan wraca do 5 (${await qty(inv5.id)})`);
  r = await c.req('DELETE', `/api/work-orders/${oInv.id}`);
  check(r.status === 200 && (await qty(inv.id)) === 1, 'usunięcie zlecenia zwraca soczewkę (stan 1)');

  section('2. edycja wizyty po wysłanym przypomnieniu');
  r = await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: '2027-01-15T09:00:00.000Z', reminderSmsDate: '2027-01-14T09:00:00.000Z' });
  const v = r.json.visit;
  sql(`UPDATE visits SET reminder_sms_status='sent' WHERE id='${v.id}'`);
  r = await c.req('PATCH', `/api/visits/${v.id}`, { customerId: cust.id, visitDate: '2027-01-15T09:00:00.000Z', visitType: 'badanie', notes: 'nowa notatka', reminderSmsDate: '2027-01-14T09:00:00.000Z' });
  check(r.status === 200 && r.json.visit.notes === 'nowa notatka', `zapis formularza z tą samą datą SMS → 200 (${r.status} ${r.json?.error ?? ''})`);
  r = await c.req('PATCH', `/api/visits/${v.id}`, { reminderSmsDate: '2027-01-14T10:00:00.000Z' });
  check(r.status === 400, `zmiana daty wysłanego SMS → 400 (${r.status})`);
  r = await c.req('PATCH', `/api/visits/${v.id}`, { visitDate: '2027-01-16T09:00:00.000Z', reminderSmsDate: '2027-01-14T09:00:00.000Z' });
  check(r.status === 200, `przesunięcie wizyty po wysłanym SMS → 200 (${r.status})`);
  r = await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: '2027-02-15T09:00:00.000Z', reminderSmsDate: '2027-02-14T09:00:00.000Z' });
  const v2 = r.json.visit;
  sql(`UPDATE visits SET reminder_sms_status='failed' WHERE id='${v2.id}'`);
  r = await c.req('PATCH', `/api/visits/${v2.id}`, { reminderSmsDate: '2027-02-14T12:00:00.000Z' });
  check(r.status === 200 && r.json.visit.reminderSmsStatus === 'pending', `nowa data po błędzie → status pending (${r.json?.visit?.reminderSmsStatus})`);
  r = await c.req('PATCH', `/api/visits/${v2.id}`, { visitDate: '2027-02-13T08:00:00.000Z' });
  check(r.status === 200 && r.json.visit.reminderSmsDate?.startsWith('2027-02-11T23:00'), `wizyta przed przypomnieniem, bez daty SMS w żądaniu → 200, przypomnienie przeliczone na piątek 12.02 (${r.status} ${r.json?.visit?.reminderSmsDate})`);
  r = await c.req('PATCH', `/api/visits/${v2.id}`, { visitDate: '2027-02-10T08:00:00.000Z', reminderSmsDate: '2027-02-14T12:00:00.000Z' });
  check(r.status === 400, `jawnie podany zły dzień przypomnienia → 400 (${r.status})`);

  section('3. „wizyty dziś” w strefie Europe/Warsaw (serwer w UTC)');
  // 23:30 czasu polskiego dziś = wizyta dziś; 00:30 jutro czasu polskiego = nie dziś.
  const pl = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
  const off = -new Date(new Date().toLocaleString('en-US', { timeZone: 'UTC' })).getTime() + new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' })).getTime();
  const at = (hhmm, addDays = 0) => new Date(new Date(`${pl}T${hhmm}:00Z`).getTime() + addDays * 864e5 - off).toISOString();
  await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: at('00:10') });
  await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: at('23:50') });
  await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: at('00:10', 1) });
  await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: at('23:50', -1) });
  const html = await (await fetch(BASE + '/dashboard', { headers: { cookie: c.cookie() } })).text();
  const m = html.match(/visitsToday\\?":(\d+)/);
  check(m && m[1] === '2', `dashboard: wizyty dziś = 2 (${m?.[1]})`);

  section('8. limit logowań');
  const c2 = new Client('B');
  for (let i = 0; i < 10; i++) await c2.login(email, 'zle-haslo');
  check(!(await c2.login(email, password)), 'po 10 błędach poprawne hasło jest blokowane');


});
