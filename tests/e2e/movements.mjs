// Historia ruchów magazynowych: INITIAL, dostawy, korekty, zlecenia, usunięcie miękkie, inwentaryzacja, izolacja salonów.
import { Client, PASSWORD, check, section, run, sql } from './lib.mjs';

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `mv-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', phone: '500600700' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  c.email = email;
  return c;
}

const mk = async (c, body) => (await c.req('POST', '/api/inventory', body)).json.item.id;
const qty = async (c, id) => Number((await c.req('GET', `/api/inventory/${id}`)).json.item.quantity);
const moves = async (c, id) => (await c.req('GET', `/api/inventory/${id}/movements?pageSize=200`)).json.movements;
const sum = (ms) => ms.reduce((s, m) => s + m.delta, 0);
const bizId = (c) => c.req('GET', '/api/business').then((r) => r.json.business.id);

await run(async () => {
  const A = await setupSalon('A');
  const B = await setupSalon('B');
  const cust = (await A.req('POST', '/api/customers', { name: 'Jan', surname: 'Test', phone: '+48500000000', smsConsent: false })).json.customer.id;
  const order = (items, extra = {}) => A.req('POST', '/api/work-orders', { customerId: cust, receivedAt: '2026-11-08', items, ...extra });

  section('INITIAL przy dodaniu towaru');
  const frame = await mk(A, { name: 'Oprawka M', quantity: 10 });
  const zero = await mk(A, { name: 'Zerowy', quantity: 0 });
  let ms = await moves(A, frame);
  check(ms.length === 1 && ms[0].type === 'INITIAL' && ms[0].delta === 10 && ms[0].qtyAfter === 10, 'towar z ilością 10 → jeden ruch INITIAL +10', ms);
  check((await moves(A, zero)).length === 0, 'towar z ilością 0 → brak ruchów');
  const biz = await bizId(A);
  check(sql(`select stock_history_start is not null from businesses where id='${biz}'`) === 't', 'stockHistoryStart ustawiony po pierwszej zmianie stanu');

  section('ensureStockHistory: idempotencja i salon sprzed funkcji');
  await A.req('POST', `/api/inventory/${zero}/deliveries`, { quantity: 1 });
  check(sql(`select count(*) from stock_movements where business_id='${biz}' and type='INITIAL'`) === '1', 'kolejne operacje nie dopisują drugiego INITIAL');
  // symulacja salonu sprzed funkcji: bez ruchów i bez stockHistoryStart
  const L = await setupSalon('L');
  const l1 = await mk(L, { name: 'Stary 1', quantity: 7 });
  const l2 = await mk(L, { name: 'Stary 2', quantity: 0 });
  const l3 = await mk(L, { name: 'Stary 3', quantity: 3 });
  const lb = await bizId(L);
  sql(`delete from stock_movements where business_id='${lb}'; update businesses set stock_history_start = null where id='${lb}'`);
  let r = await L.req('POST', `/api/inventory/${l3}/deliveries`, { quantity: 2 });
  check(r.status === 201, `pierwsza zmiana po „starej” bazie → ${r.status}`, r.json);
  const m1 = await moves(L, l1);
  check(m1.length === 1 && m1[0].type === 'INITIAL' && m1[0].delta === 7, 'stary towar 7 → INITIAL +7');
  check((await moves(L, l2)).length === 0, 'stary towar 0 → bez ruchu');
  const m3 = await moves(L, l3);
  check(m3.length === 2 && sum(m3) === 5 && (await qty(L, l3)) === 5, 'stary towar 3 + dostawa 2: INITIAL 3, DELIVERY 2, razem 5', m3);
  check(m3.find((m) => m.type === 'DELIVERY').qtyAfter === 5, 'qtyAfter dostawy = 5');

  section('dostawa');
  r = await A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 5, note: 'FV 12/2026' });
  check(r.status === 201 && Number(r.json.item.quantity) === 15, `dostawa +5 → 201, stan 15 (${r.json?.item?.quantity})`, r.json);
  ms = await moves(A, frame);
  const dlv = ms.find((m) => m.note === 'FV 12/2026');
  check(dlv && dlv.type === 'DELIVERY' && dlv.delta === 5 && dlv.qtyAfter === 15 && dlv.userEmail === A.email, 'ruch DELIVERY z notatką, qtyAfter i użytkownikiem', dlv);
  // historia „zaczęła się” 3 dni temu (jak w salonie używającym funkcji od dawna)
  sql(`update businesses set stock_history_start = now() - interval '3 days' where id='${biz}'; update stock_movements set occurred_at = now() - interval '3 days' where business_id='${biz}' and type='INITIAL'; update inventory_items set created_at = now() - interval '4 days' where business_id='${biz}'`);
  const yesterday = new Date(Date.now() - 3600_000).toISOString();
  r = await A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 3, occurredAt: yesterday });
  check(r.status === 201, `dostawa wsteczna (godzinę temu, po starcie historii) → ${r.status}`, r.json);
  const back = (await moves(A, frame)).find((m) => m.delta === 3);
  check(back && Math.abs(new Date(back.occurredAt) - new Date(yesterday)) < 1000, 'occurredAt wstecznej dostawy zachowany', back);
  check(new Date(back.createdAt) > new Date(back.occurredAt), 'createdAt późniejszy niż occurredAt');
  const tomorrow = new Date(Date.now() + 86400_000).toISOString();
  r = await A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 1, occurredAt: tomorrow });
  check(r.status === 400 && /przyszłości/.test(r.json.error), `data z przyszłości → ${r.status}`, r.json);
  r = await A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 1, occurredAt: '2020-01-01T00:00:00Z' });
  check(r.status === 400 && /początku historii/.test(r.json.error), `data sprzed początku historii → ${r.status}`, r.json);
  r = await A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 1, occurredAt: 'nie-data' });
  check(r.status === 400, `zła data → ${r.status}`);
  for (const q of [0, -1, 1.5, 1_000_001, 'abc']) {
    r = await A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: q });
    check(r.status === 400, `ilość dostawy ${JSON.stringify(q)} → 400 (${r.status})`);
  }
  check((await qty(A, frame)) === 18, 'odrzucone dostawy nie zmieniły stanu (18)');

  section('korekta ręczna');
  r = await A.req('PATCH', `/api/inventory/${frame}`, { quantity: 15, note: 'Zniszczone 3 szt.' });
  check(r.status === 200 && Number(r.json.item.quantity) === 15, `korekta 18→15 → ${r.status}`, r.json);
  const corr = (await moves(A, frame)).find((m) => m.type === 'CORRECTION');
  check(corr && corr.delta === -3 && corr.qtyAfter === 15 && corr.note === 'Zniszczone 3 szt.', 'ruch CORRECTION −3 z powodem', corr);
  const nBefore = (await moves(A, frame)).length;
  r = await A.req('PATCH', `/api/inventory/${frame}`, { quantity: 15, name: 'Oprawka M2', note: 'bez zmiany' });
  check(r.status === 200 && (await moves(A, frame)).length === nBefore, 'ta sama ilość + zmiana nazwy → bez nowego ruchu');
  r = await A.req('PATCH', `/api/inventory/${frame}`, { quantity: -1 });
  check(r.status === 400, `ujemna ilość → ${r.status}`);

  section('zlecenia: ORDER_OUT / ORDER_RETURN');
  r = await order([{ type: 'do_dali', framePrice: '100', inventoryItemIdFrame: frame }]);
  check(r.status === 201 && (await qty(A, frame)) === 14, `zlecenie → stan 14 (${r.status})`, r.json);
  const wo = r.json.workOrder;
  let out = (await moves(A, frame)).find((m) => m.type === 'ORDER_OUT');
  check(out && out.delta === -1 && out.qtyAfter === 14 && out.orderNumber === wo.orderNumber, 'ORDER_OUT z numerem zlecenia', out);
  // edycja: zdjęcie powiązania → zwrot
  r = await A.req('PATCH', `/api/work-orders/${wo.id}`, { items: [{ id: wo.items[0].id, type: 'do_dali', framePrice: '100', inventoryItemIdFrame: null }] });
  check(r.status === 200 && (await qty(A, frame)) === 15, `edycja bez towaru → stan 15 (${r.status})`, r.json);
  let ret = (await moves(A, frame)).find((m) => m.type === 'ORDER_RETURN');
  check(ret && ret.delta === 1 && ret.orderNumber === wo.orderNumber, 'ORDER_RETURN po edycji', ret);
  // edycja bez zmiany powiązań: brak ruchów
  const nAfterEdit = (await moves(A, frame)).length;
  r = await A.req('PATCH', `/api/work-orders/${wo.id}`, { items: [{ id: wo.items[0].id, type: 'do_dali', framePrice: '120', inventoryItemIdFrame: null }] });
  check(r.status === 200 && (await moves(A, frame)).length === nAfterEdit, 'edycja ceny bez zmiany powiązań → bez ruchów');
  // ponowne powiązanie, potem usunięcie zlecenia
  r = await A.req('PATCH', `/api/work-orders/${wo.id}`, { items: [{ id: wo.items[0].id, type: 'do_dali', framePrice: '120', inventoryItemIdFrame: frame }] });
  check(r.status === 200 && (await qty(A, frame)) === 14, 'ponowne powiązanie → 14');
  r = await A.req('DELETE', `/api/work-orders/${wo.id}`);
  check(r.status === 200 && (await qty(A, frame)) === 15, 'usunięcie zlecenia → zwrot, stan 15');
  ms = await moves(A, frame);
  check(ms.filter((m) => m.orderNumber === wo.orderNumber).length === 4, 'wszystkie 4 ruchy zlecenia zachowały numer po usunięciu zlecenia (snapshot)', ms.map((m) => [m.type, m.orderNumber]));
  check(sql(`select count(*) from stock_movements where order_number='${wo.orderNumber}' and work_order_id is null and business_id='${biz}'`) === '4', 'workOrderId = NULL po usunięciu zlecenia, orderNumber zostaje');

  section('brak towaru nadal blokowany, „do zamówienia” schodzi poniżej zera');
  const rare = await mk(A, { name: 'Rzadka', quantity: 1 });
  r = await order([{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: rare }, { type: 'do_dali', framePrice: '1', inventoryItemIdFrame: rare }]);
  check(r.status === 409, `2 szt. z 1 → 409 (${r.status})`, r.json);
  check((await qty(A, rare)) === 1 && (await moves(A, rare)).length === 1, 'po 409 stan 1 i brak nowych ruchów (rollback)');
  r = await order([{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: rare, frameOrdered: true }, { type: 'do_dali', framePrice: '1', inventoryItemIdFrame: rare, frameOrdered: true }]);
  check(r.status === 201 && (await qty(A, rare)) === -1, `do zamówienia → stan −1 (${r.status})`, r.json);
  const negOut = (await moves(A, rare)).find((m) => m.type === 'ORDER_OUT');
  check(negOut && negOut.delta === -2 && negOut.qtyAfter === -1, 'ORDER_OUT −2, qtyAfter −1', negOut);

  section('usunięcie klienta → ORDER_RETURN');
  const cust2 = (await A.req('POST', '/api/customers', { name: 'Ewa', surname: 'Kowalska', phone: '+48500000001', smsConsent: false })).json.customer.id;
  const own = await mk(A, { name: 'Do klienta', quantity: 4 });
  r = await A.req('POST', '/api/work-orders', { customerId: cust2, receivedAt: '2026-11-08', items: [{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: own }] });
  const no2 = r.json.workOrder.orderNumber;
  check((await qty(A, own)) === 3, 'zlecenie klienta → 3');
  r = await A.req('DELETE', `/api/customers/${cust2}`);
  check(r.status === 200 && (await qty(A, own)) === 4, 'usunięcie klienta → stan 4');
  ret = (await moves(A, own)).find((m) => m.type === 'ORDER_RETURN');
  check(ret && ret.delta === 1 && ret.orderNumber === no2, 'ORDER_RETURN z numerem usuniętego zlecenia', ret);

  section('inwentaryzacja → STOCKTAKE; dostawa w trakcie spisu');
  const sc = await mk(A, { name: 'Do spisu', quantity: 20 });
  r = await A.req('POST', '/api/stock-counts', { countDate: '2026-12-31' });
  check(r.status === 201, `start spisu → ${r.status}`);
  const countId = r.json.stockCount.id;
  r = await A.req('POST', `/api/inventory/${sc}/deliveries`, { quantity: 2 });
  check(r.status === 201, `dostawa podczas otwartego spisu → ${r.status}`, r.json);
  r = await A.req('PATCH', `/api/inventory/${sc}`, { quantity: 5 });
  check(r.status === 409, `korekta ilości podczas spisu → ${r.status}`);
  r = await A.req('GET', `/api/stock-counts/${countId}`);
  const line = r.json.lines.find((l) => l.inventoryItemId === sc);
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${line.id}`, { countedQty: 18 });
  r = await A.req('POST', `/api/stock-counts/${countId}/close`);
  check(r.status === 200 && (await qty(A, sc)) === 18, `zamknięcie spisu → stan 18 (${r.status})`, r.json);
  const st = (await moves(A, sc)).find((m) => m.type === 'STOCKTAKE');
  check(st && st.delta === -4 && st.qtyAfter === 18, 'STOCKTAKE −4 (22 → 18)', st);
  check(sql(`select stock_count_id is not null from stock_movements where id='${st.id}'`) === 't', 'STOCKTAKE ma stockCountId');

  section('usunięcie miękkie');
  const del = await mk(A, { name: 'Usuwany', quantity: 6 });
  r = await A.req('DELETE', `/api/inventory/${del}`);
  check(r.status === 200, `DELETE → ${r.status}`);
  ms = await moves(A, del);
  check(ms[0].type === 'REMOVAL' && ms[0].delta === -6 && ms[0].qtyAfter === 0 && sum(ms) === 0, 'REMOVAL −6, suma ruchów 0, historia czytelna', ms);
  check(sql(`select count(*) from inventory_items where id='${del}' and deleted_at is not null and quantity=0`) === '1', 'wiersz towaru zostaje (deleted_at), stan 0');
  r = await A.req('GET', '/api/inventory');
  check(!r.json.items.some((i) => i.id === del) && r.json.items.some((i) => i.id === frame), 'towar zniknął z listy');
  check((await A.req('GET', `/api/inventory/${del}`)).status === 404, 'GET usuniętego → 404');
  check((await A.req('PATCH', `/api/inventory/${del}`, { name: 'x' })).status === 404, 'PATCH usuniętego → 404');
  check((await A.req('DELETE', `/api/inventory/${del}`)).status === 404, 'drugi DELETE → 404');
  check((await A.req('POST', `/api/inventory/${del}/deliveries`, { quantity: 1 })).status === 404, 'dostawa do usuniętego → 404');
  r = await order([{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: del }]);
  check(r.status === 404, `nowe zlecenie z usuniętym towarem → ${r.status}`, r.json);
  const delEmpty = await mk(A, { name: 'Usuwany pusty', quantity: 0 });
  check((await A.req('DELETE', `/api/inventory/${delEmpty}`)).status === 200 && (await moves(A, delEmpty)).length === 0, 'usunięcie towaru ze stanem 0 → bez ruchu');
  // zlecenie powiązane z towarem, który potem usunięto, nadal działa
  const keep = await mk(A, { name: 'Zostanie usunięty', quantity: 2 });
  r = await order([{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: keep }]);
  const woK = r.json.workOrder;
  await A.req('DELETE', `/api/inventory/${keep}`);
  r = await A.req('PATCH', `/api/work-orders/${woK.id}`, { notes: 'x', items: [{ id: woK.items[0].id, type: 'do_dali', framePrice: '5', inventoryItemIdFrame: keep }] });
  check(r.status === 200, `edycja zlecenia z usuniętym towarem (bez zmiany powiązania) → ${r.status}`, r.json);
  check((await A.req('GET', `/api/work-orders/${woK.id}`)).status === 200, 'zlecenie z usuniętym towarem czytelne');
  // otwarty spis: usunięty towar znika z linii
  const delInCount = await mk(A, { name: 'Usunięty w spisie', quantity: 1 });
  r = await A.req('POST', '/api/stock-counts', { countDate: '2026-12-31' });
  const c2 = r.json.stockCount.id;
  r = await A.req('GET', `/api/stock-counts/${c2}`);
  check(r.json.lines.some((l) => l.inventoryItemId === delInCount), 'towar jest w otwartym spisie');
  await A.req('DELETE', `/api/inventory/${delInCount}`);
  r = await A.req('GET', `/api/stock-counts/${c2}`);
  check(!r.json.lines.some((l) => l.inventoryItemId === delInCount), 'usunięty towar znika z otwartego spisu');
  const afterDel = await mk(A, { name: 'Po usunięciu', quantity: 1 });
  r = await A.req('GET', `/api/stock-counts/${c2}`);
  check(r.json.lines.every((l) => l.inventoryItemId !== del) && r.json.lines.some((l) => l.inventoryItemId === afterDel), 'nowy towar dosypany, usunięte nie wracają');
  await A.req('DELETE', `/api/stock-counts/${c2}`);

  section('historia: stan w przeszłości = suma delta');
  const hist = await moves(A, frame);
  check(sum(hist) === (await qty(A, frame)), 'suma delta == stan (frame)');
  const mid = hist.find((m) => m.type === 'ORDER_OUT');
  const upTo = hist.filter((m) => m.occurredAt <= mid.occurredAt);
  check(upTo.length > 0, 'ruchy do chwili pierwszego zlecenia istnieją');

  section('współbieżność');
  const q0 = await qty(A, frame);
  const par = await Promise.all([
    ...Array.from({ length: 6 }, () => A.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 1 })),
    ...Array.from({ length: 3 }, () => order([{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: frame }])),
  ]);
  check(par.every((x) => x.status === 201), `9 równoległych zmian → 201 (${par.map((x) => x.status)})`);
  const q1 = await qty(A, frame);
  check(q1 === q0 + 6 - 3, `stan ${q0} → ${q1} (oczekiwano ${q0 + 3})`);
  const ps = await moves(A, frame);
  check(sum(ps) === q1, 'suma delta == stan po wyścigu');

  section('paginacja ruchów');
  r = await A.req('GET', `/api/inventory/${frame}/movements?page=1&pageSize=2`);
  check(r.status === 200 && r.json.movements.length === 2 && r.json.total === ps.length, `strona 1 (2 z ${r.json?.total})`);
  const p2 = await A.req('GET', `/api/inventory/${frame}/movements?page=2&pageSize=2`);
  check(p2.json.movements.every((m) => !r.json.movements.some((x) => x.id === m.id)), 'strony się nie nakładają');
  check((await A.req('GET', `/api/inventory/${frame}/movements?page=0`)).status === 400, 'page=0 → 400');

  section('izolacja salonów');
  const bItem = await mk(B, { name: 'Towar B', quantity: 5 });
  check((await B.req('GET', `/api/inventory/${frame}/movements`)).status === 404, 'B nie czyta historii towaru A → 404');
  check((await B.req('POST', `/api/inventory/${frame}/deliveries`, { quantity: 1 })).status === 404, 'B nie dopisuje dostawy do towaru A → 404');
  check((await A.req('GET', `/api/inventory/${bItem}/movements`)).status === 404, 'A nie czyta historii towaru B → 404');
  check((await qty(A, frame)) === q1 && (await qty(B, bItem)) === 5, 'stany bez zmian');
  check((await B.req('GET', `/api/inventory/${del}/movements`)).status === 404, 'B nie czyta historii usuniętego towaru A → 404');
  const noAuth = new Client('anon');
  check((await noAuth.req('GET', `/api/inventory/${frame}/movements`)).status === 401, 'bez sesji → 401');
  check((await A.req('GET', '/api/inventory/nie-uuid/movements')).status === 404, 'zły id → 404');
  check((await A.req('POST', '/api/inventory/nie-uuid/deliveries', { quantity: 1 })).status === 404, 'zły id dostawy → 404');

  section('niezmiennik (ten salon)');
  const bad = sql(`select count(*) from inventory_items i where i.business_id in ('${biz}','${lb}') and i.quantity <> coalesce((select sum(delta) from stock_movements m where m.inventory_item_id=i.id),0)`);
  check(bad === '0', `quantity == Σdelta dla wszystkich towarów (rozbieżnych: ${bad})`);
});
