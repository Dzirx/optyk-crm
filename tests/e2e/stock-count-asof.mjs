// Inwentaryzacja „na dzień”: stany z historii magazynu na koniec dnia spisu (Europe/Warsaw),
// także gdy spis robi się dni później. Czasu serwera nie da się zmienić, więc przeszłość budujemy
// SQL-em (start historii i ruchy INITIAL cofnięte) oraz dostawami wstecznymi.
import { Client, PASSWORD, check, section, run, sql } from './lib.mjs';

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `asof-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', phone: '500600700' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  return c;
}

const DAY = 86400_000;
const dayIso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const mk = async (c, body) => (await c.req('POST', '/api/inventory', body)).json.item.id;
const qty = async (c, id) => Number((await c.req('GET', `/api/inventory/${id}`)).json.item.quantity);
const sumSql = (id) => Number(sql(`select coalesce(sum(delta),0) from stock_movements where inventory_item_id='${id}'`));
const stockAtSql = (id, iso) => Number(sql(`select coalesce(sum(delta),0) from stock_movements where inventory_item_id='${id}' and occurred_at <= '${iso}'::timestamp`));
const rawQty = (id) => Number(sql(`select quantity from inventory_items where id='${id}'`));
const endOf = (iso) =>
  sql(`select to_char((((('${iso}'::date + 1)::timestamp at time zone 'Europe/Warsaw') at time zone 'UTC') - interval '1 millisecond'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

await run(async () => {
  const A = await setupSalon('A');
  const biz = (await A.req('GET', '/api/business')).json.business.id;
  const cust = (await A.req('POST', '/api/customers', { name: 'Jan', surname: 'Asof', phone: '+48500000010', smsConsent: false })).json.customer.id;
  const sale = (itemId) =>
    A.req('POST', '/api/work-orders', { customerId: cust, receivedAt: dayIso(0), items: [{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: itemId }] });

  section('przygotowanie: historia sprzed 10 dni');
  const P = await mk(A, { name: 'AS Oprawka P', quantity: 10, purchasePrice: 10, price: 30 });
  const Q = await mk(A, { name: 'AS Oprawka Q', quantity: 5, purchasePrice: 20 });
  const X = await mk(A, { name: 'AS Usunięty po dniu spisu', quantity: 6, purchasePrice: 100 });
  const Y = await mk(A, { name: 'AS Usunięty przed dniem spisu', quantity: 2, purchasePrice: 1 });
  const Z = await mk(A, { name: 'AS Zerowy', quantity: 0 });
  sql(`update businesses set stock_history_start = now() - interval '10 days' where id='${biz}';
       update stock_movements set occurred_at = now() - interval '8 days' where business_id='${biz}' and type='INITIAL';
       update inventory_items set created_at = now() - interval '8 days' where business_id='${biz}'`);
  const N = await mk(A, { name: 'AS Założony po dniu spisu', quantity: 3, purchasePrice: 5 });

  const D = dayIso(-3);
  const endD = endOf(D);
  const endMs = new Date(endD).getTime();
  const hb = (ms) => new Date(endMs - ms).toISOString();
  check(endMs < Date.now() && endMs > Date.now() - 4 * DAY, `D = ${D}, koniec dnia ${endD}`);

  // Y usunięty 5 dni temu (przed dniem spisu)
  await A.req('DELETE', `/api/inventory/${Y}`);
  sql(`update inventory_items set deleted_at = now() - interval '5 days' where id='${Y}';
       update stock_movements set occurred_at = now() - interval '5 days' where inventory_item_id='${Y}' and type='REMOVAL'`);

  let r = await A.req('POST', `/api/inventory/${P}/deliveries`, { quantity: 5, occurredAt: new Date(Date.now() - 5 * DAY).toISOString() });
  check(r.status === 201, `dostawa P +5 sprzed 5 dni → ${r.status}`, r.json);
  r = await A.req('POST', `/api/inventory/${P}/deliveries`, { quantity: 4, occurredAt: new Date(Date.now() - DAY).toISOString() });
  check(r.status === 201, `dostawa P +4 sprzed doby (po dniu spisu) → ${r.status}`, r.json);
  await A.req('DELETE', `/api/inventory/${X}`); // usunięty dziś, czyli po dniu spisu
  check((await qty(A, P)) === 19 && stockAtSql(P, endD) === 15, 'P: teraz 19, na koniec dnia spisu 15');

  section('walidacja daty');
  r = await A.req('POST', '/api/stock-counts', { countDate: dayIso(-11) });
  check(r.status === 400 && /^Historia magazynu zaczyna się \d{1,2}\.\d{1,2}\.\d{4}\. Inwentaryzacji na wcześniejszy dzień nie da się wyliczyć\.$/.test(r.json?.error), `data sprzed historii → ${r.status}`, r.json);
  const startDate = new Date(Date.now() - 10 * DAY).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  check(r.json?.error?.includes(startDate), `komunikat podaje datę startu historii ${startDate}`, r.json);
  check((await A.req('GET', '/api/stock-counts')).json.stockCounts.length === 0, 'odrzucony start nie zostawił spisu');

  section('spis na dzień miniony: stany z historii');
  r = await A.req('POST', '/api/stock-counts', { countDate: D });
  check(r.status === 201, `start spisu na ${D} → ${r.status}`, r.json);
  const cid = r.json.stockCount.id;
  const getCount = async () => (await A.req('GET', `/api/stock-counts/${cid}`)).json;
  const line = (j, id) => j.lines.find((l) => l.inventoryItemId === id);
  let j = await getCount();
  check(line(j, P)?.countedQty === 15 && line(j, P)?.systemQtyAtCount === 15, 'P: 15 (a nie 19 z dziś)', line(j, P));
  check(line(j, Q)?.countedQty === 5, 'Q: 5');
  check(line(j, X)?.countedQty === 6, 'X usunięty po dniu spisu jest w spisie (6)', line(j, X));
  check(line(j, Z)?.countedQty === 0, 'Z (stan 0) jest w spisie');
  check(!line(j, N), 'towar założony po dniu spisu NIE wchodzi do spisu');
  check(!line(j, Y), 'towar usunięty przed dniem spisu NIE wchodzi do spisu');
  check(j.lines.length === 4, `4 pozycje (${j.lines.length})`);
  check(j.stockCount.asOf && new Date(j.stockCount.asOf).toISOString() === endD, 'asOf otwartego spisu = koniec dnia spisu', j.stockCount);

  section('sprzedaż dziś nie zmienia spisu z przeszłości; dostawa wsteczna ≤ koniec dnia go zmienia');
  r = await sale(Q);
  check(r.status === 201 && (await qty(A, Q)) === 4, 'sprzedaż Q dziś → stan 4');
  j = await getCount();
  check(line(j, Q)?.countedQty === 5, 'Q w spisie nadal 5');
  r = await A.req('POST', `/api/inventory/${P}/deliveries`, { quantity: 2, occurredAt: hb(3600_000) });
  check(r.status === 201, `dostawa wsteczna P +2 (godzinę przed końcem dnia spisu) → ${r.status}`, r.json);
  j = await getCount();
  check(line(j, P)?.countedQty === 17 && line(j, P)?.systemQtyAtCount === 17, 'otwarty spis widzi dostawę wsteczną: P 17', line(j, P));

  section('edycje w spisie z przeszłości');
  const patch = (id, countedQty) => A.req('PATCH', `/api/stock-counts/${cid}/lines/${line(j, id).id}`, { countedQty });
  r = await patch(P, 14);
  check(r.status === 200 && r.json.line.systemQtyAtCount === 17 && new Date(r.json.line.countedAt).toISOString() === endD, 'P=14: baza 17, countedAt = koniec dnia spisu', r.json);
  r = await patch(Q, 7);
  check(r.status === 200 && r.json.line.systemQtyAtCount === 5, 'Q=7: baza 5 (stan na koniec dnia, nie dzisiejsze 4)', r.json);
  r = await patch(X, 5);
  check(r.status === 200 && r.json.line.systemQtyAtCount === 6, 'X=5: baza 6', r.json);
  await patch(Z, 3);
  r = await patch(Z, null);
  check(r.status === 200 && r.json.line.countedQty === 0 && r.json.line.systemQtyAtCount === 0, 'reset Z (null) → stan z historii 0', r.json);
  r = await A.req('POST', `/api/inventory/${P}/deliveries`, { quantity: 1, occurredAt: hb(2 * 3600_000) });
  check(r.status === 201, 'kolejna dostawa wsteczna P +1 po zapisaniu liczenia');
  j = await getCount();
  check(line(j, P)?.systemQtyAtCount === 18 && line(j, P)?.countedQty === 14 && line(j, P)?.diff === -4, 'liczona pozycja: baza przeliczona (18), różnica −4', line(j, P));
  check(j.summary.linesWithDiff === 3, `3 pozycje z różnicą (${j.summary.linesWithDiff})`);
  check((await A.req('PATCH', `/api/inventory/${Q}`, { quantity: 1 })).status === 409, 'ręczna korekta ilości podczas spisu → 409');
  const curBefore = { P: await qty(A, P), Q: await qty(A, Q) };
  check(curBefore.P === 22 && curBefore.Q === 4, `stany przed zamknięciem: P 22, Q 4 (${curBefore.P}, ${curBefore.Q})`);

  section('zamknięcie spisu z przeszłości');
  r = await A.req('POST', `/api/stock-counts/${cid}/close`);
  check(r.status === 200, `zamknięcie → ${r.status}`, r.json);
  check((await qty(A, P)) === 18, 'P: stan teraz 22 − 4 = 18 (korekta jest prawdziwa)');
  check((await qty(A, Q)) === 6, 'Q: stan teraz 4 + 2 = 6');
  check(rawQty(X) === 0, 'X (usunięty): stan zostaje 0');
  for (const [id, d, nm] of [[P, -4, 'P'], [Q, 2, 'Q'], [X, -1, 'X']]) {
    const n = sql(`select count(*) from stock_movements where inventory_item_id='${id}' and type='STOCKTAKE' and delta=${d} and stock_count_id='${cid}' and occurred_at='${endD}'::timestamp`);
    check(n === '1', `${nm}: STOCKTAKE ${d} z occurred_at = koniec dnia spisu`);
  }
  check(sql(`select count(*) from stock_movements where inventory_item_id='${Z}'`) === '0', 'Z bez różnicy: bez ruchów');
  check(stockAtSql(P, endD) === 14 && stockAtSql(Q, endD) === 7 && stockAtSql(X, endD) === 5, 'stockAt(koniec dnia) po zamknięciu = policzone (14, 7, 5)');
  check(sumSql(P) === 18 && sumSql(Q) === 6 && sumSql(X) === 0, 'quantity == Σ delta (P, Q, X)');
  check(sql(`select as_of = '${endD}'::timestamp and closed_at > as_of from stock_counts where id='${cid}'`) === 't', 'asOf = koniec dnia spisu, closedAt późniejszy');
  j = await getCount();
  const sheet = (id) => [line(j, id).countedQty, line(j, id).systemQtyAtCount, line(j, id).appliedDiff];
  check(JSON.stringify(sheet(P)) === '[14,18,-4]' && JSON.stringify(sheet(Q)) === '[7,5,2]' && JSON.stringify(sheet(X)) === '[5,6,-1]', 'arkusz: [policzone, powinno być, różnica] P/Q/X', [sheet(P), sheet(Q), sheet(X)]);
  check(j.summary.valueCents === 78000, `wartość wg cen zakupu = 780,00 zł (${j.summary.valueCents})`);
  await sale(Q);
  const again = await getCount();
  check(again.lines.every((l) => l.countedQty === line(j, l.inventoryItemId).countedQty), 'zamknięty arkusz nie zmienia się po późniejszej sprzedaży');

  section('CSV i wydruk jako stan na dzień spisu');
  const csvRes = await fetch(`${process.env.BASE}/api/stock-counts/${cid}/export?price=purchase`, { headers: { cookie: A.cookie() } });
  const csv = await csvRes.text();
  check(csvRes.status === 200 && csv.includes('AS Oprawka P;') && /AS Oprawka P;[^;]*;szt\.;18;14;-4;10,00;140,00/.test(csv), 'CSV: P 18 / 14 / −4, 10,00, 140,00', csv.split('\r\n').slice(0, 6));
  check(/AS Usunięty po dniu spisu;[^;]*;szt\.;6;5;-1;100,00;500,00/.test(csv), 'CSV: usunięty po dniu spisu jest w arkuszu');
  check(!csv.includes('AS Założony po dniu') && !csv.includes('AS Usunięty przed'), 'CSV bez towarów spoza dnia spisu');
  const html = await A.page(`/inventory/stock-counts/${cid}/print`);
  const plEnd = new Date(endD).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  check(html.includes('Stan na:') && html.includes(`${plEnd}, 23:59`), `wydruk: „Stan na: ${plEnd}, 23:59”`);
  check(/780,00/.test(html) && !html.includes('PROJEKT'), 'wydruk: razem 780,00 zł, bez znaku PROJEKT');
  check(!html.includes('AS Założony po dniu') && html.includes('AS Usunięty po dniu spisu'), 'wydruk: towar założony po dniu spisu pominięty, usunięty po dniu — jest');

  section('spis „żywy” (data = dziś): sprzedaż w trakcie i korekta w chwili wpisu');
  r = await A.req('POST', '/api/stock-counts', { countDate: dayIso(0) });
  check(r.status === 201, `start spisu na dziś → ${r.status}`, r.json);
  const lid = r.json.stockCount.id;
  const live = async () => (await A.req('GET', `/api/stock-counts/${lid}`)).json;
  let L = await live();
  const ll = (id) => L.lines.find((l) => l.inventoryItemId === id);
  const nowP = await qty(A, P);
  const nowQ = await qty(A, Q);
  check(ll(P)?.countedQty === nowP && ll(Q)?.countedQty === nowQ && ll(N)?.countedQty === 3, `stany bieżące: P ${nowP}, Q ${nowQ}, N 3`, [ll(P), ll(Q), ll(N)]);
  check(!ll(X) && !ll(Y), 'usunięte towary nie wchodzą do spisu żywego');
  r = await A.req('PATCH', `/api/stock-counts/${lid}/lines/${ll(P).id}`, { countedQty: nowP - 2 });
  const tEdit = r.json.line.countedAt;
  check(r.status === 200 && r.json.line.systemQtyAtCount === nowP && Math.abs(Date.now() - new Date(tEdit)) < 60_000, 'edycja żywa: countedAt = chwila wpisu, baza = bieżący stan', r.json);
  await sale(P);
  await sale(Q);
  const N2 = await mk(A, { name: 'AS Założony w trakcie spisu', quantity: 2 });
  L = await live();
  check(ll(Q)?.countedQty === nowQ - 1 && ll(Q)?.diff === 0, 'nieruszone Q idzie za sprzedażą w trakcie spisu');
  check(ll(P)?.countedQty === nowP - 2 && ll(P)?.systemQtyAtCount === nowP, 'liczone P zachowuje bazę z chwili wpisu');
  check(ll(N2)?.countedQty === 2, 'towar założony w trakcie żywego spisu jest dosypany');
  r = await A.req('POST', `/api/stock-counts/${lid}/close`);
  check(r.status === 200, `zamknięcie żywego → ${r.status}`, r.json);
  check((await qty(A, P)) === nowP - 1 - 2, `P: stan = ${nowP} − 1 (sprzedaż) − 2 (korekta) = ${nowP - 3}`);
  check(sql(`select count(*) from stock_movements where inventory_item_id='${P}' and type='STOCKTAKE' and delta=-2 and stock_count_id='${lid}' and occurred_at='${tEdit}'::timestamp`) === '1', 'STOCKTAKE −2 z occurred_at = chwila wpisu');
  check(sql(`select count(*) from stock_movements where inventory_item_id='${P}' and type='ORDER_OUT' and occurred_at > '${tEdit}'::timestamp`) === '1', 'sprzedaż po wpisie jest później w historii niż korekta');
  check(sql(`select as_of = closed_at from stock_counts where id='${lid}'`) === 't', 'żywy spis: asOf = chwila zamknięcia');
  L = await live();
  check(ll(P)?.countedQty === nowP - 3 && ll(P)?.systemQtyAtCount === nowP - 1 && ll(P)?.appliedDiff === -2, 'arkusz żywego: P = stan po zamknięciu', ll(P));
  check(sumSql(P) === (await qty(A, P)), 'Σ delta == stan');

  section('spis na dzień przyszły jest dozwolony (żywy do końca tego dnia)');
  r = await A.req('POST', '/api/stock-counts', { countDate: dayIso(30) });
  check(r.status === 201, `start na +30 dni → ${r.status}`, r.json);
  const fid = r.json.stockCount.id;
  const F = (await A.req('GET', `/api/stock-counts/${fid}`)).json;
  check(F.lines.find((l) => l.inventoryItemId === P)?.countedQty === (await qty(A, P)), 'przyszły spis: bieżące stany');
  check((await A.req('DELETE', `/api/stock-counts/${fid}`)).status === 200, 'anulowanie przyszłego spisu');

  section('zwrot do usuniętego towaru nie zmienia stanu (zostaje 0)');
  const R1 = await mk(A, { name: 'AS Zwrot 1', quantity: 5 });
  let o = (await sale(R1)).json.workOrder;
  await A.req('DELETE', `/api/inventory/${R1}`);
  r = await A.req('DELETE', `/api/work-orders/${o.id}`);
  check(r.status === 200 && rawQty(R1) === 0 && sumSql(R1) === 0, 'usunięcie zlecenia po usunięciu towaru → towar nadal 0');
  check(sql(`select count(*) from stock_movements where inventory_item_id='${R1}' and type='ORDER_RETURN'`) === '0', 'brak ruchu ORDER_RETURN do usuniętego towaru');
  const R2 = await mk(A, { name: 'AS Zwrot 2', quantity: 5 });
  o = (await sale(R2)).json.workOrder;
  await A.req('DELETE', `/api/inventory/${R2}`);
  r = await A.req('PATCH', `/api/work-orders/${o.id}`, { items: [{ id: o.items[0].id, type: 'do_dali', framePrice: '1', inventoryItemIdFrame: null }] });
  check(r.status === 200 && rawQty(R2) === 0 && sumSql(R2) === 0, 'edycja zlecenia (zdjęcie powiązania) po usunięciu towaru → towar nadal 0');
  check(sql(`select count(*) from stock_movements where inventory_item_id='${R2}' and type='ORDER_RETURN'`) === '0', 'brak ORDER_RETURN po edycji');
  const R3 = await mk(A, { name: 'AS Zwrot 3', quantity: 5 });
  const cust3 = (await A.req('POST', '/api/customers', { name: 'Ewa', surname: 'Asof', phone: '+48500000011', smsConsent: false })).json.customer.id;
  await A.req('POST', '/api/work-orders', { customerId: cust3, receivedAt: dayIso(0), items: [{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: R3 }] });
  await A.req('DELETE', `/api/inventory/${R3}`);
  r = await A.req('DELETE', `/api/customers/${cust3}`);
  check(r.status === 200 && rawQty(R3) === 0 && sql(`select count(*) from stock_movements where inventory_item_id='${R3}' and type='ORDER_RETURN'`) === '0', 'usunięcie klienta po usunięciu towaru → towar nadal 0');
  const R4 = await mk(A, { name: 'AS Zwrot 4 (żywy)', quantity: 5 });
  o = (await sale(R4)).json.workOrder;
  await A.req('DELETE', `/api/work-orders/${o.id}`);
  check((await qty(A, R4)) === 5, 'zwrot do żywego towaru nadal działa (5)');

  section('niezmiennik');
  const bad = sql(`select count(*) from inventory_items i where i.business_id='${biz}' and i.quantity <> coalesce((select sum(delta) from stock_movements m where m.inventory_item_id=i.id),0)`);
  check(bad === '0', `quantity == Σ delta w całym salonie (rozbieżnych: ${bad})`);
  const delNonZero = sql(`select count(*) from inventory_items where business_id='${biz}' and deleted_at is not null and quantity <> 0`);
  check(delNonZero === '0', 'usunięte towary mają stan 0');
});
