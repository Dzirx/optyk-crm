// Poprawki po przeglądzie magazynu: kolejność spisów, granice daty dostawy, „potwierdzone” pozycje spisu,
// pomijanie zbędnej synchronizacji, saldo w historii, powiązanie usuniętego towaru, start historii w seedzie.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client, PASSWORD, check, section, run, sql } from './lib.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const DAY = 86400_000;
const dayIso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const ts = (iso) => `to_char(${iso}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const endOf = (iso) => sql(`select ${ts(`(((('${iso}'::date + 1)::timestamp at time zone 'Europe/Warsaw') at time zone 'UTC') - interval '1 millisecond')`)}`);
const startOf = (iso) => sql(`select ${ts(`((('${iso}'::date)::timestamp at time zone 'Europe/Warsaw') at time zone 'UTC')`)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `rf-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', phone: '500600700' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  c.biz = (await c.req('GET', '/api/business')).json.business.id;
  return c;
}
const mk = async (c, body) => (await c.req('POST', '/api/inventory', body)).json.item.id;
const moves = async (c, id) => (await c.req('GET', `/api/inventory/${id}/movements?pageSize=200`)).json.movements;
/** Cofa historię salonu o 10 dni, a towary i ruchy INITIAL o 8 dni (jak salon używający magazynu od dawna). */
const age = (c) =>
  sql(`update businesses set stock_history_start = now() - interval '10 days' where id='${c.biz}';
       update stock_movements set occurred_at = now() - interval '8 days' where business_id='${c.biz}' and type='INITIAL';
       update inventory_items set created_at = now() - interval '8 days' where business_id='${c.biz}'`);
const deliver = (c, id, quantity, at) => c.req('POST', `/api/inventory/${id}/deliveries`, { quantity, ...(at ? { occurredAt: at } : {}) });

await run(async () => {
  // ---------------------------------------------------------------- (1) kolejność spisów
  section('(1) spis na wcześniejszy dzień niż zakończony');
  const S1 = await setupSalon('S1');
  const a1 = await mk(S1, { name: 'RF Spis 1', quantity: 4 });
  age(S1);
  const D = dayIso(-2);
  let r = await S1.req('POST', '/api/stock-counts', { countDate: D });
  check(r.status === 201, `start na ${D} → ${r.status}`, r.json);
  const c1 = r.json.stockCount.id;
  r = await S1.req('POST', `/api/stock-counts/${c1}/close`);
  check(r.status === 200, `zamknięcie → ${r.status}`, r.json);
  r = await S1.req('POST', '/api/stock-counts', { countDate: dayIso(-3) });
  check(r.status === 409 && /^Inwentaryzacja na \d{1,2}\.\d{2}\.\d{4} jest już zakończona\. Nie można liczyć wcześniejszego dnia\.$/.test(r.json?.error), `wcześniejszy dzień → 409 z komunikatem (${r.status})`, r.json);
  check((await S1.req('GET', '/api/stock-counts')).json.stockCounts.length === 1, 'odrzucony start nie zostawił spisu');
  r = await S1.req('POST', '/api/stock-counts', { countDate: D });
  check(r.status === 201, `ten sam dzień ponownie → ${r.status}`, r.json);
  await S1.req('DELETE', `/api/stock-counts/${r.json.stockCount.id}`);
  r = await S1.req('POST', '/api/stock-counts', { countDate: dayIso(-1) });
  check(r.status === 201, `późniejszy dzień → ${r.status}`, r.json);
  await S1.req('DELETE', `/api/stock-counts/${r.json.stockCount.id}`);

  // ---------------------------------------------------------------- (2) dostawa przed zakończonym spisem
  section('(2) dostawa sprzed zakończonego spisu');
  const endD = endOf(D);
  const endMs = new Date(endD).getTime();
  const m0 = (await S1.req('GET', `/api/inventory/${a1}/movements?pageSize=1`)).json;
  check(new Date(m0.deliveryMinAt).getTime() === endMs + 1, `deliveryMinAt = asOf + 1 ms (${m0.deliveryMinAt})`, m0.deliveryMinAt);
  r = await deliver(S1, a1, 1, new Date(endMs - 3600_000).toISOString());
  check(r.status === 400 && /^Dostawa nie może mieć daty sprzed zakończonej inwentaryzacji \(\d{1,2}\.\d{2}\.\d{4}\)\.$/.test(r.json?.error), `godzinę przed asOf → 400 (${r.status})`, r.json);
  r = await deliver(S1, a1, 1, new Date(endMs - 2 * DAY).toISOString());
  check(r.status === 400 && /sprzed zakończonej inwentaryzacji/.test(r.json?.error), 'dwa dni przed asOf → 400', r.json);
  r = await deliver(S1, a1, 2, new Date(endMs + 3600_000).toISOString());
  check(r.status === 201, `po asOf → ${r.status}`, r.json);
  check(Number(sql(`select quantity from inventory_items where id='${a1}'`)) === 6, 'odrzucone dostawy nie zmieniły stanu (4 + 2)');

  section('(2) przycięcie w dniu minimum (spis zamknięty dziś)');
  const S2 = await setupSalon('S2');
  const a2 = await mk(S2, { name: 'RF Przycięcie', quantity: 3 });
  age(S2);
  r = await S2.req('POST', '/api/stock-counts', { countDate: dayIso(0) });
  r = await S2.req('POST', `/api/stock-counts/${r.json.stockCount.id}/close`);
  check(r.status === 200, 'spis na dziś zamknięty');
  const asOf2 = sql(`select ${ts('as_of')} from stock_counts where business_id='${S2.biz}'`);
  r = await deliver(S2, a2, 5, new Date(new Date(startOf(dayIso(0))).getTime() + 1000).toISOString()); // dziś 00:00:01 lokalnie
  // Dzień zakończonej inwentaryzacji NIE jest przesuwany: towar mógł już być policzony na półce.
  check(r.status === 400 && /sprzed zakończonej inwentaryzacji/.test(r.json?.error),
    `dostawa „z dzisiejszego ranka” po spisie zamkniętym dziś → 400 (bez przesuwania), ${r.status}`, r.json);
  check(!(await moves(S2, a2)).some((m) => m.type === 'DELIVERY'), 'odrzucona dostawa nie zapisała ruchu', asOf2);
  r = await deliver(S2, a2, 5); // bez daty = teraz (po spisie) → przyjęta
  check(r.status === 201, `dostawa „teraz” po spisie zamkniętym dziś → ${r.status}`, r.json);
  r = await deliver(S2, a2, 1, new Date(Date.now() - DAY).toISOString());
  check(r.status === 400 && /sprzed zakończonej inwentaryzacji/.test(r.json?.error), 'wczoraj (inny dzień niż minimum) → 400', r.json);

  // ---------------------------------------------------------------- (3) dostawa przed założeniem towaru
  section('(3) dostawa sprzed założenia towaru');
  const S3 = await setupSalon('S3');
  await mk(S3, { name: 'RF Stary', quantity: 2 });
  age(S3);
  const n3 = await mk(S3, { name: 'RF Nowy dziś', quantity: 1 });
  const created3 = sql(`select ${ts('created_at')} from inventory_items where id='${n3}'`);
  const m3 = (await S3.req('GET', `/api/inventory/${n3}/movements?pageSize=1`)).json;
  check(Math.abs(new Date(m3.deliveryMinAt) - new Date(created3)) < 1000, `deliveryMinAt ≈ createdAt (${m3.deliveryMinAt} vs ${created3})`);
  r = await deliver(S3, n3, 1, new Date(Date.now() - DAY).toISOString());
  check(r.status === 400 && /^Dostawa nie może mieć daty sprzed dodania towaru \(\d{1,2}\.\d{2}\.\d{4}\)\.$/.test(r.json?.error), `wczoraj dla towaru z dziś → 400 (${r.status})`, r.json);
  r = await deliver(S3, n3, 2, new Date(new Date(startOf(dayIso(0))).getTime() + 1000).toISOString());
  check(r.status === 201, `dziś rano (ten sam dzień) → przycięcie → ${r.status}`, r.json);
  const d3 = (await moves(S3, n3)).find((m) => m.type === 'DELIVERY');
  check(d3 && new Date(d3.occurredAt).getTime() === new Date(created3).getTime(), 'occurredAt = chwila założenia towaru', [d3?.occurredAt, created3]);
  // towar założony po T nie trafia do spisu, a dostawa „przed T” jest niemożliwa
  r = await S3.req('POST', '/api/stock-counts', { countDate: dayIso(-3) });
  const s3c = r.json.stockCount.id;
  const lines3 = (await S3.req('GET', `/api/stock-counts/${s3c}`)).json.lines;
  check(!lines3.some((l) => l.inventoryItemId === n3), 'towar założony po dniu spisu nie wchodzi do spisu');
  r = await deliver(S3, n3, 1, new Date(Date.now() - 4 * DAY).toISOString());
  check(r.status === 400, 'dostawa przed założeniem towaru nie wstawi go do spisu z przeszłości (400)');
  await S3.req('DELETE', `/api/stock-counts/${s3c}`);

  // ---------------------------------------------------------------- (7) potwierdzona zgodność + batch bazy
  section('(7) pozycja „zgadza się” zostaje potwierdzona po dostawie wstecznej; baza liczona wsadowo');
  const S4 = await setupSalon('S4');
  const P = await mk(S4, { name: 'RF P', quantity: 10 });
  const Q = await mk(S4, { name: 'RF Q', quantity: 5 });
  const U = await mk(S4, { name: 'RF U', quantity: 7 });
  age(S4);
  r = await S4.req('POST', '/api/stock-counts', { countDate: dayIso(0) });
  const cid = r.json.stockCount.id;
  const get = async () => (await S4.req('GET', `/api/stock-counts/${cid}`)).json;
  let j = await get();
  const line = (id) => j.lines.find((l) => l.inventoryItemId === id);
  check(sql(`select count(*) from stock_count_lines where stock_count_id='${cid}' and touched`) === '0', 'nowe pozycje: touched = false');
  const tBefore = Date.now(); // τ liczenia P wypada po tej chwili
  r = await S4.req('PATCH', `/api/stock-counts/${cid}/lines/${line(P).id}`, { countedQty: 10 }); // zgadza się z programem
  const tP = Date.now(); // ...i przed tą
  check(r.status === 200 && sql(`select touched from stock_count_lines where id='${line(P).id}'`) === 't', 'PATCH liczbą (równą stanowi) → touched = true');
  await sleep(1200);
  r = await S4.req('PATCH', `/api/stock-counts/${cid}/lines/${line(Q).id}`, { countedQty: 5 });
  check(r.status === 200, 'Q potwierdzone w innej chwili');
  // dostawa wsteczna między liczeniem P a liczeniem Q: tylko Q ma ją w stanie z chwili liczenia
  const between = new Date(tP + 400).toISOString();
  check((await deliver(S4, P, 3, between)).status === 201 && (await deliver(S4, Q, 2, between)).status === 201 && (await deliver(S4, U, 4, between)).status === 201, 'trzy dostawy wsteczne między liczeniami');
  j = await get();
  check(line(P).countedQty === 10 && line(P).systemQtyAtCount === 10 && line(P).diff === 0, 'P liczone przed dostawą: baza 10, bez różnicy (partia: osobna chwila)', line(P));
  check(line(Q).countedQty === 5 && line(Q).systemQtyAtCount === 7 && line(Q).diff === -2, 'Q liczone po dostawie: baza 7, potwierdzone 5, różnica −2', line(Q));
  check(line(U).countedQty === 11 && line(U).systemQtyAtCount === 11 && line(U).diff === 0, 'U nieruszone: idzie za dziennikiem (11)', line(U));
  // dostawa wsteczna sprzed τ obu — P teraz też ma różnicę
  const early = new Date(tBefore - 600).toISOString();
  check((await deliver(S4, P, 1, early)).status === 201, 'dostawa wsteczna sprzed liczenia P');
  j = await get();
  check(line(P).countedQty === 10 && line(P).systemQtyAtCount === 11 && line(P).diff === -1, 'P: potwierdzone 10 zostaje, baza 11, różnica −1', line(P));
  // reset = nieruszona, idzie za dziennikiem
  r = await S4.req('PATCH', `/api/stock-counts/${cid}/lines/${line(P).id}`, { countedQty: null });
  check(r.status === 200 && r.json.line.countedQty === 14 && r.json.line.systemQtyAtCount === 14 && sql(`select touched from stock_count_lines where id='${line(P).id}'`) === 'f', 'reset (null) → touched = false, wartość z programu (14)', r.json);
  check((await deliver(S4, P, 1, early)).status === 201, 'kolejna dostawa wsteczna');
  j = await get();
  check(line(P).countedQty === 15 && line(P).diff === 0, 'po resecie pozycja znów idzie za dziennikiem (15)', line(P));
  // pozycja sprzed pola touched (countedQty != system): uzupełnienie przy synchronizacji
  r = await S4.req('PATCH', `/api/stock-counts/${cid}/lines/${line(U).id}`, { countedQty: 9 });
  sql(`update stock_count_lines set touched = false where id='${line(U).id}'`);
  check((await deliver(S4, U, 1, early)).status === 201, 'dostawa wsteczna do U');
  j = await get();
  check(sql(`select touched from stock_count_lines where id='${line(U).id}'`) === 't' && line(U).countedQty === 9 && line(U).diff === 9 - 12, 'stara pozycja z różnicą: touched uzupełnione, 9 zostaje', line(U));

  // ---------------------------------------------------------------- (4) pomijanie synchronizacji
  section('(4) synchronizacja pomijana, gdy nic się nie zmieniło');
  const maxSeq = () => sql(`select coalesce(max(seq),0) from stock_movements where business_id='${S4.biz}'`);
  await get();
  check(sql(`select synced_seq from stock_counts where id='${cid}'`) === maxSeq(), 'syncedSeq = największy seq ruchów salonu');
  sql(`update stock_count_lines set counted_qty = 99, system_qty_at_count = 99 where id='${line(P).id}'`);
  j = await get();
  check(line(P).countedQty === 99, 'bez nowych ruchów: GET niczego nie zapisuje (sztucznie zmieniona wartość zostaje)', line(P));
  check((await deliver(S4, Q, 1)).status === 201, 'nowy ruch');
  j = await get();
  check(line(P).countedQty === 15 && line(P).systemQtyAtCount === 15, 'nowy ruch unieważnia pominięcie: P przeliczone (15)', line(P));
  check(sql(`select synced_seq from stock_counts where id='${cid}'`) === maxSeq(), 'syncedSeq odświeżony');
  const extra = await mk(S4, { name: 'RF Dosypany', quantity: 1 });
  j = await get();
  check(!!line(extra), 'nowo założony towar dosypany do otwartego spisu');
  r = await S4.req('POST', `/api/stock-counts/${cid}/close`);
  check(r.status === 200, `zamknięcie → ${r.status}`, r.json);
  check(sql(`select count(*) from inventory_items i where i.business_id='${S4.biz}' and i.quantity <> coalesce((select sum(delta) from stock_movements m where m.inventory_item_id=i.id),0)`) === '0', 'niezmiennik po zamknięciu');

  // ---------------------------------------------------------------- (8) saldo w historii
  section('(8) „Stan po” w kolejności zdarzeń');
  const S5 = await setupSalon('S5');
  const h = await mk(S5, { name: 'RF Historia', quantity: 10 });
  age(S5);
  check((await deliver(S5, h, 5)).status === 201, 'dostawa +5 teraz');
  check((await deliver(S5, h, 3, new Date(Date.now() - DAY).toISOString())).status === 201, 'dostawa wsteczna +3 (wczoraj)');
  const ms = await moves(S5, h);
  check(JSON.stringify(ms.map((m) => m.delta)) === '[5,3,10]', 'lista wg occurredAt malejąco: +5, +3, INITIAL', ms.map((m) => m.delta));
  check(JSON.stringify(ms.map((m) => m.balanceAfter)) === '[18,13,10]', 'balanceAfter: 18, 13, 10', ms.map((m) => m.balanceAfter));
  check(JSON.stringify(ms.map((m) => m.qtyAfter)) === '[15,18,10]', 'qtyAfter (kolejność zapisu) zachowane: 15, 18, 10', ms.map((m) => m.qtyAfter));
  const pg = (await S5.req('GET', `/api/inventory/${h}/movements?page=2&pageSize=1`)).json;
  check(pg.movements[0].balanceAfter === 13, 'saldo poprawne także na drugiej stronie');

  // ---------------------------------------------------------------- (9) powiązanie usuniętego towaru
  section('(9) zlecenie z usuniętym towarem');
  const S6 = await setupSalon('S6');
  const cust = (await S6.req('POST', '/api/customers', { name: 'Jan', surname: 'RF', phone: '+48500000021', smsConsent: false })).json.customer.id;
  const live = await mk(S6, { name: 'RF Żywy', quantity: 3 });
  const gone = await mk(S6, { name: 'RF Usunięty', quantity: 3 });
  await S6.req('DELETE', `/api/inventory/${gone}`);
  r = await S6.req('POST', '/api/work-orders', { customerId: cust, receivedAt: dayIso(0), items: [{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: gone }] });
  check(r.status === 404, `POST ze skasowanym towarem → ${r.status}`, r.json);
  r = await S6.req('POST', '/api/work-orders', { customerId: cust, receivedAt: dayIso(0), items: [{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: live }] });
  const wo = r.json.workOrder;
  r = await S6.req('PATCH', `/api/work-orders/${wo.id}`, { items: [{ id: wo.items[0].id, type: 'do_dali', framePrice: '1', inventoryItemIdFrame: live }, { type: 'do_dali', framePrice: '1', inventoryItemIdOp: gone }] });
  check(r.status === 404, `PATCH z nowym powiązaniem do skasowanego → ${r.status}`, r.json);
  check(Number(sql(`select quantity from inventory_items where id='${live}'`)) === 2 && Number(sql(`select quantity from inventory_items where id='${gone}'`)) === 0, 'stany bez zmian po odrzuceniu');
  await S6.req('DELETE', `/api/inventory/${live}`);
  r = await S6.req('PATCH', `/api/work-orders/${wo.id}`, { notes: 'x', items: [{ id: wo.items[0].id, type: 'do_dali', framePrice: '2', inventoryItemIdFrame: live }] });
  check(r.status === 200, `istniejące powiązanie ze skasowanym towarem nadal dozwolone → ${r.status}`, r.json);
  // równoległe usuwanie towaru i zakładanie zlecenia: albo 404, albo 201 + towar usunięty, ale nigdy ruch na usuniętym towarze po usunięciu
  const race = await mk(S6, { name: 'RF Wyścig', quantity: 5 });
  const [rd, ro] = await Promise.all([
    S6.req('DELETE', `/api/inventory/${race}`),
    S6.req('POST', '/api/work-orders', { customerId: cust, receivedAt: dayIso(0), items: [{ type: 'do_dali', framePrice: '1', inventoryItemIdFrame: race }] }),
  ]);
  check(rd.status === 200 && [201, 404].includes(ro.status), `wyścig usunięcia i zlecenia → ${rd.status}/${ro.status}`);
  check(sql(`select count(*) from inventory_items i where i.id='${race}' and i.quantity <> coalesce((select sum(delta) from stock_movements m where m.inventory_item_id=i.id),0)`) === '0', 'po wyścigu quantity == Σ delta');

  // ---------------------------------------------------------------- (10) seed zakłada historię
  section('(10) seed zakłada historię magazynu');
  const S7 = await setupSalon('S7');
  await mk(S7, { name: 'RF Seed 1', quantity: 6 });
  await mk(S7, { name: 'RF Seed 2', quantity: 0 });
  await mk(S7, { name: 'RF Seed 3', quantity: 2 });
  const S8 = await setupSalon('S8');
  await mk(S8, { name: 'RF Seed zainicjowany', quantity: 9 });
  const initS8 = sql(`select count(*) from stock_movements where business_id='${S8.biz}'`);
  sql(`delete from stock_movements where business_id='${S7.biz}'; update businesses set stock_history_start = null where id='${S7.biz}'`);
  const seed = () =>
    execFileSync('npx', ['tsx', 'lib/db/seed.ts', '--silent'], {
      cwd: REPO,
      env: { ...process.env, ROOT_USER_NAME: 'Root', ROOT_USER_EMAIL: process.env.ROOT_USER_EMAIL || 'root@test.local', ROOT_USER_PASSWORD: process.env.ROOT_USER_PASSWORD || 'Root-test-123' },
      stdio: 'pipe',
    });
  seed();
  check(sql(`select stock_history_start is not null from businesses where id='${S7.biz}'`) === 't', 'seed ustawił stockHistoryStart');
  check(sql(`select count(*) from stock_movements where business_id='${S7.biz}' and type='INITIAL'`) === '2', 'INITIAL tylko dla towarów ze stanem ≠ 0 (2 z 3)');
  check(sql(`select sum(delta) from stock_movements where business_id='${S7.biz}'`) === '8', 'Σ delta = 8');
  check(sql(`select count(*) from stock_movements where business_id='${S8.biz}'`) === initS8, 'salon z historią nietknięty');
  const startAfter = sql(`select stock_history_start from businesses where id='${S7.biz}'`);
  seed();
  check(sql(`select count(*) from stock_movements where business_id='${S7.biz}'`) === '2' && sql(`select stock_history_start from businesses where id='${S7.biz}'`) === startAfter, 'drugie uruchomienie: bez zmian (idempotentne)');
});
