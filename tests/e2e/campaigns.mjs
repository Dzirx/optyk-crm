// Kampanie SMS (wysyłki grupowe w tle): tworzenie, idempotencja, równoległe przetwarzanie,
// powody błędów, ponowienie, anulowanie, zgoda, izolacja salonów, limity, okres próbny, dzwonek.
// Bramka SMS jest podmieniona w fake-sms.cjs: klucz "fail-key" = błąd, numery +48999… = nieprawidłowy numer,
// a każde wywołanie trafia do dziennika FAKE_SMS_LOG (liczymy wysyłki do numerów).
import { readFileSync } from 'node:fs';
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

const LOG = process.env.FAKE_SMS_LOG;
const calls = () => (LOG ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : []);
const callsTo = (phones) => {
  const set = new Set(phones);
  return calls().filter((p) => set.has(p));
};

async function salon(tag, apiKey = 'ok-key') {
  const c = new Client(tag);
  const email = `${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  r = await c.req('GET', '/api/auth/csrf');
  await c.req('POST', '/api/auth/callback/credentials', undefined, { csrfToken: r.json.csrfToken, email, password: PASSWORD, callbackUrl: BASE });
  r = await c.req('POST', '/api/business', {
    name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', smsProvider: 'smsplanet', smsConfig: { apiKey },
  });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  c.email = email;
  c.bizId = sql(`select b.id from businesses b join users u on u.id=b.user_id where b.name='Optyk ${tag}'`);
  return c;
}

let seq = 0;
/** Klienci wstawiani SQL-em; zwraca { ids, phones }. phoneFn(i) → numer. */
function customers(c, count, { consent = true, phoneFn } = {}) {
  const base = ++seq;
  const tag = `K${base}x`;
  const phone = phoneFn ?? ((i) => `+4850${String(base).padStart(2, '0')}${String(i).padStart(5, '0')}`);
  const values = Array.from({ length: count }, (_, i) =>
    `(gen_random_uuid(), '${c.bizId}', 'Jan', '${tag}${String(i).padStart(4, '0')}', '${phone(i)}', ${consent}, now(), now())`);
  sql(`insert into customers (id, business_id, name, surname, phone, sms_consent, created_at, updated_at) values ${values.join(',')}`);
  const rows = sql(`select id || '|' || phone from customers where business_id='${c.bizId}' and surname like '${tag}%' order by surname`).split('\n');
  return { ids: rows.map((r) => r.split('|')[0]), phones: rows.map((r) => r.split('|')[1]) };
}

const key = () => `e2e-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;
const create = (c, ids, k = key(), message = 'Hej {name}, zapraszamy do {staff}') =>
  c.req('POST', '/api/sms/campaigns', { message, customerIds: ids, idempotencyKey: k });
const get = async (c, id, q = '') => (await c.req('GET', `/api/sms/campaigns/${id}${q}`)).json;
const cron = () => fetch(`${BASE}/api/cron/send-scheduled-sms`, { headers: { authorization: 'Bearer cron-test' } }).then((r) => r.status);

async function waitFor(c, id, pred, sec = 60) {
  for (let i = 0; i < sec * 4; i++) {
    const d = await get(c, id);
    if (d?.campaign && pred(d.campaign)) return d.campaign;
    await new Promise((r) => setTimeout(r, 250));
  }
  return (await get(c, id)).campaign;
}
const finished = (c) => c.status === 'done' || c.status === 'cancelled';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await run(async () => {
  const A = await salon('CA');
  const B = await salon('CB');

  section('bez sesji');
  const anon = new Client('anon');
  check((await anon.req('GET', '/api/sms/campaigns')).status === 401, 'GET lista bez sesji → 401');
  check((await anon.req('POST', '/api/sms/campaigns', {})).status === 401, 'POST bez sesji → 401');

  section('tworzenie → przetworzone do done');
  const c1 = customers(A, 12);
  let r = await create(A, c1.ids);
  check(r.status === 201 && r.json.campaign.total === 12, `POST → 201, total=12 (${r.status})`, r.json);
  check(['queued', 'sending'].includes(r.json.campaign.status) && r.json.campaign.sent <= 12, 'odpowiedź od razu, kampania w toku', r.json.campaign.status);
  const id1 = r.json.campaign.id;
  let camp = await waitFor(A, id1, finished);
  check(camp.status === 'done' && camp.sent === 12 && camp.failed === 0, 'kampania done: 12 wysłanych, 0 nieudanych', camp);
  check(camp.startedAt && camp.finishedAt, 'startedAt i finishedAt ustawione');
  let d = await get(A, id1);
  check(d.recipients.length === 12 && d.recipients.every((x) => x.status === 'sent'), 'wszyscy odbiorcy sent');
  check(sql(`select count(*) from sms_campaign_recipients where campaign_id='${id1}' and sent_at is not null and provider_message_id is not null`) === '12', 'sentAt i providerMessageId zapisane');
  const msg = sql(`select rendered_message from sms_campaign_recipients where campaign_id='${id1}' order by customer_name limit 1`);
  check(msg.startsWith('Hej Jan K') && msg.endsWith('zapraszamy do Optyk CA'), 'szablon {name} i {staff} podstawione', msg);
  check(callsTo(c1.phones).length === 12, 'bramka wywołana 12 razy', callsTo(c1.phones).length);

  section('idempotencja');
  const c2 = customers(A, 5);
  const k2 = key();
  const [p1, p2] = await Promise.all([create(A, c2.ids, k2), create(A, c2.ids, k2)]);
  check(p1.json.campaign.id === p2.json.campaign.id, 'równoległe żądania z tym samym kluczem → jedna kampania');
  check([p1.status, p2.status].sort().join() === '200,201', `statusy 201 + 200 (${p1.status}, ${p2.status})`);
  const p3 = await create(A, c2.ids, k2);
  check(p3.status === 200 && p3.json.campaign.id === p1.json.campaign.id, 'trzecie żądanie → 200, ta sama kampania');
  check(sql(`select count(*) from sms_campaigns where business_id='${A.bizId}' and idempotency_key='${k2}'`) === '1', 'w bazie jedna kampania');
  check(sql(`select count(*) from sms_campaign_recipients where campaign_id='${p1.json.campaign.id}'`) === '5', 'odbiorcy nie zdublowani (5)');
  await waitFor(A, p1.json.campaign.id, finished);
  check(callsTo(c2.phones).length === 5, 'każdy odbiorca dostał SMS raz (5 wywołań)', callsTo(c2.phones).length);
  r = await create(B, c2.ids, k2);
  check(r.status === 400, `ten sam klucz w innym salonie nie zwraca cudzej kampanii (${r.status})`);

  section('równoległe przetwarzanie: cron x4 + natychmiastowy start');
  const c3 = customers(A, 30);
  r = await create(A, c3.ids);
  const id3 = r.json.campaign.id;
  const crons = await Promise.all([cron(), cron(), cron(), cron()]);
  check(crons.every((s) => s === 200), 'cron odpowiada 200', crons);
  camp = await waitFor(A, id3, finished);
  check(camp.status === 'done' && camp.sent === 30 && camp.failed === 0, 'kampania done: 30/30', camp);
  const log3 = callsTo(c3.phones);
  check(log3.length === 30 && new Set(log3).size === 30, `bramka: dokładnie 30 wywołań, bez powtórzeń (${log3.length}/${new Set(log3).size})`);
  check(sql(`select count(*) from sms_campaign_recipients where campaign_id='${id3}' and status='sent'`) === '30', 'w bazie 30 sent');
  check(sql(`select sent from sms_campaigns where id='${id3}'`) === '30', 'licznik sent = 30');

  section('błędy: powody po polsku');
  const phonesMixed = (i) => (i < 2 ? `+48999000000${i}` : `+4850777${String(i).padStart(4, '0')}`);
  const c4 = customers(A, 5, { phoneFn: phonesMixed });
  r = await create(A, c4.ids);
  const id4 = r.json.campaign.id;
  camp = await waitFor(A, id4, finished);
  check(camp.status === 'done' && camp.sent === 3 && camp.failed === 2, 'sent=3, failed=2', camp);
  d = await get(A, id4, '?status=failed');
  check(d.total === 2 && d.recipients.length === 2 && d.recipients.every((x) => x.status === 'failed'), 'filtr status=failed → 2');
  check(d.recipients.every((x) => x.reasonCode === 'bad_phone' && x.reason === 'Nieprawidłowy numer telefonu'), 'powód: bad_phone po polsku', d.recipients[0]);
  check(sql(`select count(*) from sms_campaign_recipients where campaign_id='${id4}' and status='failed' and error_message like '%Invalid phone number%'`) === '2', 'errorMessage dostawcy zapisany');
  check(callsTo(c4.phones).length === 5, 'każdy z 5 numerów wywołany raz');

  section('salon z błędnym kluczem API: każdy odbiorca nieudany z powodem');
  const F = await salon('CF', 'fail-key');
  const cF = customers(F, 3);
  r = await create(F, cF.ids);
  camp = await waitFor(F, r.json.campaign.id, finished);
  check(camp.status === 'done' && camp.sent === 0 && camp.failed === 3, 'fail-key: 0 wysłanych, 3 nieudane', camp);
  d = await get(F, r.json.campaign.id, '?status=failed');
  check(d.recipients.every((x) => /Fake gateway failure/.test(x.reason ?? '')), 'powód zawiera tekst bramki', d.recipients[0]);
  const idF = r.json.campaign.id;

  section('ponowienie nieudanych');
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-aaaa' });
  check(r.status === 201 && r.json.campaign.total === 2 && r.json.campaign.id !== id4, `retry → nowa kampania z 2 odbiorcami (${r.status})`, r.json);
  const retryId = r.json.campaign.id;
  const retryNames = sql(`select string_agg(customer_name, ',' order by customer_name) from sms_campaign_recipients where campaign_id='${retryId}'`);
  const failedNames = sql(`select string_agg(customer_name, ',' order by customer_name) from sms_campaign_recipients where campaign_id='${id4}' and status='failed'`);
  check(retryNames === failedNames, 'tylko nieudani odbiorcy', { retryNames, failedNames });
  check(sql(`select message from sms_campaigns where id='${retryId}'`) === sql(`select message from sms_campaigns where id='${id4}'`), 'ta sama treść');
  const r2 = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-aaaa' });
  check(r2.status === 200 && r2.json.campaign.id === retryId, 'ten sam klucz → ta sama kampania (200)');
  camp = await waitFor(A, retryId, finished);
  check(camp.status === 'done' && camp.failed === 2, 'ponowienie kończy się (te numery nadal błędne)', camp);
  r = await A.req('POST', `/api/sms/campaigns/${id1}/retry-failed`, { idempotencyKey: 'retry-key-bbbb' });
  check(r.status === 400, `kampania bez nieudanych → 400 (${r.status})`, r.json);
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, {});
  check(r.status === 400, 'retry bez klucza → 400');
  section('ponowienie wybranych odbiorców (recipientIds)');
  const failedRecs = (await get(A, id4, '?status=failed')).recipients;
  const sentRec = (await get(A, id4, '?status=sent')).recipients[0];
  const foreignRec = (await get(A, id1)).recipients[0];
  const campaignsBefore = sql(`select count(*) from sms_campaigns where business_id='${A.bizId}'`);
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-sel1', recipientIds: [failedRecs[0].id], dryRun: true });
  check(r.status === 200 && r.json.count === 1 && r.json.skipped === 0, 'dryRun podzbioru → count=1, skipped=0', r.json);
  check(sql(`select count(*) from sms_campaigns where business_id='${A.bizId}'`) === campaignsBefore, 'dryRun nie tworzy kampanii');
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-sel1', recipientIds: [failedRecs[0].id] });
  check(r.status === 201 && r.json.campaign.total === 1 && r.json.skipped === 0, `retry podzbioru → nowa kampania z 1 odbiorcą (${r.status})`, r.json);
  check(sql(`select customer_name from sms_campaign_recipients where campaign_id='${r.json.campaign.id}'`) === failedRecs[0].customerName, 'jest to wskazany odbiorca');
  await waitFor(A, r.json.campaign.id, finished);
  for (const [name, ids, st] of [
    ['odbiorca wysłany (nie nieudany)', [sentRec.id], 400],
    ['odbiorca z innej kampanii', [foreignRec.id], 400],
    ['nieistniejące id', ['00000000-0000-4000-8000-000000000000'], 400],
    ['id nie jest UUID-em', ['abc'], 400],
    ['pusta lista', [], 400],
    ['nieudany + wysłany', [failedRecs[0].id, sentRec.id], 400],
  ]) {
    r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: key(), recipientIds: ids });
    check(r.status === st, `recipientIds: ${name} → ${st} (${r.status})`, r.json);
  }
  const rB = await B.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: key(), recipientIds: [failedRecs[0].id] });
  check(rB.status === 404, `B: odbiorcy cudzej kampanii → 404 (${rB.status})`);
  const bOwn = customers(B, 1, { phoneFn: () => '+48999000555' });
  const campB = (await create(B, bOwn.ids)).json.campaign.id;
  await waitFor(B, campB, finished);
  const bRec = (await get(B, campB, '?status=failed')).recipients[0];
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: key(), recipientIds: [bRec.id] });
  check(r.status === 400, `A: nieudany odbiorca salonu B → 400 (${r.status})`);
  // klient wycofał zgodę: pominięty z informacją
  const wCust = sql(`select customer_id from sms_campaign_recipients where id='${failedRecs[1].id}'`);
  sql(`update customers set sms_consent=false where id='${wCust}'`);
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: key(), dryRun: true });
  check(r.status === 200 && r.json.count === 1 && r.json.skipped === 1, 'dryRun wszystkich: 1 do wysłania, 1 pominięty (brak zgody)', r.json);
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-dddd' });
  check(r.status === 201 && r.json.campaign.total === 1 && r.json.skipped === 1, 'retry wszystkich: pominięto klienta bez zgody', r.json);
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: key(), recipientIds: [failedRecs[1].id] });
  check(r.status === 400, `tylko klient bez zgody → 400 (${r.status})`);
  sql(`update customers set sms_consent=true where id='${wCust}'`);

  // naprawa numerów i ponowienie: nowa kampania kończy się sukcesem
  sql(`update customers set phone = '+4850555' || right(phone, 4) where id in (select customer_id from sms_campaign_recipients where campaign_id='${id4}' and status='failed')`);
  r = await A.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-cccc' });
  camp = await waitFor(A, r.json.campaign.id, finished);
  check(r.status === 201 && camp.sent === 2 && camp.failed === 0, 'po poprawie numerów ponowienie wysyła 2/2', camp);

  section('anulowanie');
  const c5 = customers(A, 60);
  r = await create(A, c5.ids);
  const id5 = r.json.campaign.id;
  r = await A.req('POST', `/api/sms/campaigns/${id5}/cancel`);
  check(r.status === 200 && r.json.campaign.status === 'cancelled', `cancel → 200, status cancelled (${r.status})`, r.json);
  d = await get(A, id5, '?status=cancelled');
  check(d.total > 0, `oczekujący odbiorcy → cancelled (${d.total})`);
  check((await A.req('POST', `/api/sms/campaigns/${id5}/cancel`)).status === 409, 'drugie anulowanie → 409');
  check((await A.req('POST', `/api/sms/campaigns/${id1}/cancel`)).status === 409, 'anulowanie zakończonej → 409');
  await sleep(4000);
  camp = (await get(A, id5)).campaign;
  const out5 = callsTo(c5.phones).length;
  check(camp.status === 'cancelled' && camp.sent + camp.failed === out5, `po anulowaniu wysłano tylko rozpoczęte (${out5}), licznik zgodny`, camp);
  check(out5 < 60, `nie wysłano wszystkich 60 (${out5})`);
  await cron();
  await sleep(500);
  check(callsTo(c5.phones).length === out5, 'cron nie wznawia anulowanej kampanii');

  section('zgoda na SMS');
  const withConsent = customers(A, 3);
  const noConsent = customers(A, 2, { consent: false });
  r = await create(A, [...withConsent.ids, ...noConsent.ids]);
  check(r.status === 201 && r.json.campaign.total === 3, `klienci bez zgody pominięci (total=${r.json.campaign?.total})`);
  await waitFor(A, r.json.campaign.id, finished);
  check(callsTo(noConsent.phones).length === 0, 'bez zgody: brak wywołań bramki');
  r = await create(A, noConsent.ids);
  check(r.status === 400, `tylko klienci bez zgody → 400 (${r.status})`, r.json);

  section('izolacja salonów');
  const bCust = customers(B, 2);
  r = await create(A, bCust.ids);
  check(r.status === 400, `cudzy klient → 400 (${r.status})`);
  r = await create(A, [...withConsent.ids, ...bCust.ids]);
  check(r.status === 201 && r.json.campaign.total === 3, 'cudzy klient pominięty w mieszanej liście');
  await waitFor(A, r.json.campaign.id, finished);
  check(callsTo(bCust.phones).length === 0, 'bramka nie dostała numerów z innego salonu');
  check((await B.req('GET', `/api/sms/campaigns/${id1}`)).status === 404, 'B: GET cudzej kampanii → 404');
  check((await B.req('POST', `/api/sms/campaigns/${id1}/cancel`)).status === 404, 'B: cancel cudzej → 404');
  check((await B.req('POST', `/api/sms/campaigns/${id4}/retry-failed`, { idempotencyKey: 'retry-key-zzzz' })).status === 404, 'B: retry cudzej → 404');
  check((await B.req('GET', '/api/sms/campaigns/nie-uuid')).status === 404, 'zły id → 404');
  r = await B.req('GET', '/api/sms/campaigns');
  check(r.status === 200 && r.json.campaigns.every((x) => x.id !== id1 && x.id !== id4), 'B: historia bez kampanii A');

  section('historia i paginacja');
  r = await A.req('GET', '/api/sms/campaigns?page=1');
  check(r.status === 200 && r.json.pageSize === 20 && r.json.campaigns.length <= 20 && r.json.total >= 8, `historia: total=${r.json.total}`);
  const dates = r.json.campaigns.map((x) => x.createdAt);
  check(dates.every((x, i) => i === 0 || dates[i - 1] >= x), 'najnowsze pierwsze');
  check((await A.req('GET', '/api/sms/campaigns?page=0')).status === 400, 'page=0 → 400');
  d = await get(A, id3, '?page=2');
  check(d.recipients.length === 0 && d.total === 30 && d.pageSize === 50, 'szczegóły: strona 2 pusta, rozmiar 50');
  d = await get(A, id3);
  check(d.recipients.length === 30, 'szczegóły: 30 odbiorców na stronie 1');
  check((await A.req('GET', `/api/sms/campaigns/${id3}?status=zly`)).status === 400, 'zły status → 400');

  section('walidacja i limity');
  r = await create(A, Array.from({ length: 5001 }, (_, i) => String(i)));
  check(r.status === 400 && /5000/.test(r.json?.error ?? ''), `5001 odbiorców → 400 (${r.json?.error})`);
  check((await A.req('POST', '/api/sms/campaigns', { message: 'x', customerIds: [withConsent.ids[0]] })).status === 400, 'brak klucza → 400');
  check((await A.req('POST', '/api/sms/campaigns', { message: 'x', customerIds: [withConsent.ids[0]], idempotencyKey: 'zły klucz!' })).status === 400, 'zły klucz → 400');
  check((await create(A, [])).status === 400, 'pusta lista odbiorców → 400');
  check((await create(A, withConsent.ids, key(), '   ')).status === 400, 'pusta treść → 400');
  sql(`insert into customers (id, business_id, name, surname, phone, sms_consent, created_at, updated_at)
       select gen_random_uuid(), '${A.bizId}', 'Masowy', 'Big' || g, '+4851' || lpad(g::text, 7, '0'), true, now(), now() from generate_series(1, 5000) g`);
  const bigIds = (await A.req('GET', '/api/customers/ids?q=Masowy&smsConsent=true')).json.ids;
  check(bigIds.length === 5000, `ids?q=Masowy → 5000 (${bigIds.length})`);
  r = await create(A, bigIds);
  check(r.status === 201 && r.json.campaign.total === 5000, `dokładnie 5000 odbiorców → 201 (${r.status})`);
  await A.req('POST', `/api/sms/campaigns/${r.json.campaign.id}/cancel`);
  check(sql(`select count(*) from sms_campaign_recipients where campaign_id='${r.json.campaign.id}'`) === '5000', 'zapisano 5000 odbiorców');
  const noSms = await salon('CN');
  sql(`update businesses set sms_config = null where id='${noSms.bizId}'`);
  const cN = customers(noSms, 1);
  r = await create(noSms, cN.ids);
  check(r.status === 400 && /skonfigurowany/.test(r.json?.error ?? ''), `brak konfiguracji SMS → 400 (${r.json?.error})`);

  section('błąd bramki (konfiguracja): jedna decyzja dla całej kampanii');
  const G = await salon('CG');
  // Pusty klucz API: kampania odrzucona od razu (bramka nieskonfigurowana).
  sql(`update businesses set sms_config = '{"apiKey":""}' where id='${G.bizId}'`);
  const cG = customers(G, 8);
  r = await create(G, cG.ids);
  check(r.status === 400 && /skonfigurowany/.test(r.json?.error ?? ''), `pusty klucz API → 400 (${r.json?.error})`);
  // Błąd konfiguracji wykryty dopiero przy wysyłce (nieznany dostawca): jedna decyzja dla całej kampanii.
  sql(`update businesses set sms_config = '{"apiKey":"ok-key"}', sms_provider = 'nieznany' where id='${G.bizId}'`);
  r = await create(G, cG.ids);
  const idG = r.json.campaign.id;
  camp = await waitFor(G, idG, finished);
  check(camp.status === 'done' && camp.failed === 8 && camp.sent === 0, 'wszyscy nieudani', camp);
  check(callsTo(cG.phones).length === 0, 'bramka nie była wywoływana');
  d = await get(G, idG, '?status=failed');
  check(d.recipients.every((x) => x.reasonCode === 'not_configured' && x.isConfig), 'powód: bramka nieskonfigurowana');
  const nG = (await G.req('GET', '/api/notifications')).json;
  check(nG.items.length === 1 && nG.items[0].kind === 'sms_gateway' && nG.items[0].count === 8, 'dzwonek: jeden wpis bramki (count=8), bez wpisu kampanii', nG.items);
  check(nG.unreadCount === 1, 'bramka nieprzeczytana');
  await G.req('POST', '/api/notifications/read', { ids: ['gateway'] });
  check((await G.req('GET', '/api/notifications')).json.unreadCount === 0, 'bramka z kampanii oznaczona jako przeczytana');

  section('dzwonek: wpis kampanii z błędami');
  let n = (await F.req('GET', '/api/notifications')).json;
  const item = n.items.find((i) => i.kind === 'sms_campaign');
  check(!!item && item.campaignId === idF && item.count === 3 && item.campaignTotal === 3 && item.read === false, 'wpis kampanii: nie wysłano 3 z 3', n.items);
  check(n.unreadCount === 1, 'unreadCount = 1');
  check((await A.req('GET', '/api/notifications')).json.items.some((i) => i.campaignId === idF) === false, 'inny salon nie widzi wpisu');
  await B.req('POST', '/api/notifications/read', { ids: [`campaign:${idF}`] });
  check((await F.req('GET', '/api/notifications')).json.unreadCount === 1, 'obcy salon nie oznaczy cudzego wpisu');
  r = await F.req('POST', '/api/notifications/read', { ids: [`campaign:${idF}`] });
  n = (await F.req('GET', '/api/notifications')).json;
  check(r.status === 200 && n.unreadCount === 0 && n.items.find((i) => i.kind === 'sms_campaign')?.read === true, 'po potwierdzeniu: przeczytany, wpis zostaje');
  check(sql(`select failures_acknowledged_at is not null from sms_campaigns where id='${idF}'`) === 't', 'failuresAcknowledgedAt zapisane');
  const nA = (await A.req('GET', '/api/notifications')).json;
  check(nA.items.some((i) => i.kind === 'sms_campaign' && i.campaignId === id4 && i.count === 2 && i.campaignTotal === 5), 'salon A: wpis kampanii id4 (2 z 5)');
  check(!nA.items.some((i) => i.campaignId === id1), 'kampania bez błędów nie ma wpisu');

  section('okres próbny zakończony: kampania jest anulowana, nie wysyła');
  const T = await salon('CT');
  const cT = customers(T, 3);
  sql(`update users set access_until = now() - interval '1 day' where email='${T.email}'`);
  const campT = sql(`insert into sms_campaigns (id, business_id, message, total, created_at) values (gen_random_uuid(), '${T.bizId}', 'Test {name}', 3, now()) returning id`).split('\n')[0];
  for (let i = 0; i < 3; i++) {
    sql(`insert into sms_campaign_recipients (id, campaign_id, customer_id, customer_name, phone, rendered_message) values (gen_random_uuid(), '${campT}', '${cT.ids[i]}', 'Jan Test${i}', '${cT.phones[i]}', 'Test')`);
  }
  await cron();
  await Promise.all([cron(), cron()]);
  const cancelledT = sql(`select status || ',' || (finished_at is not null) || ',' || sent || ',' || failed from sms_campaigns where id='${campT}'`);
  check(cancelledT === 'cancelled,true,0,0', `po okresie próbnym: kampania zakończona jako anulowana (${cancelledT})`);
  check(sql(`select count(*) from sms_campaign_recipients where campaign_id='${campT}' and status='cancelled'`) === '3' && callsTo(cT.phones).length === 0, 'odbiorcy anulowani, bramka nietknięta');
  sql(`update users set access_until = null where email='${T.email}'`);
  await cron();
  check(sql(`select status from sms_campaigns where id='${campT}'`) === 'cancelled' && callsTo(cT.phones).length === 0, 'po przywróceniu dostępu anulowana kampania nie rusza');

  section('rezerwacje: porzucona („sending” > 5 min) jest przejmowana, świeża nie');
  const S = await salon('CS');
  const cS = customers(S, 2);
  const campS = sql(`insert into sms_campaigns (id, business_id, message, total, status, created_at) values (gen_random_uuid(), '${S.bizId}', 'Test', 2, 'sending', now()) returning id`).split('\n')[0];
  const recOld = sql(`insert into sms_campaign_recipients (id, campaign_id, customer_id, customer_name, phone, rendered_message, status, claimed_at) values (gen_random_uuid(), '${campS}', '${cS.ids[0]}', 'Jan A', '${cS.phones[0]}', 'Test', 'sending', (now() at time zone 'utc') - interval '10 minutes') returning id`).split('\n')[0];
  const recNew = sql(`insert into sms_campaign_recipients (id, campaign_id, customer_id, customer_name, phone, rendered_message, status, claimed_at) values (gen_random_uuid(), '${campS}', '${cS.ids[1]}', 'Jan B', '${cS.phones[1]}', 'Test', 'sending', now() at time zone 'utc') returning id`).split('\n')[0];
  await cron();
  check(sql(`select status from sms_campaign_recipients where id='${recOld}'`) === 'sent', 'porzucona rezerwacja przejęta i wysłana');
  check(sql(`select status from sms_campaign_recipients where id='${recNew}'`) === 'sending', 'świeża rezerwacja nietknięta');
  check(sql(`select status || ',' || sent from sms_campaigns where id='${campS}'`) === 'sending,1', 'kampania jeszcze w toku (1 wysłany)');
  sql(`update sms_campaign_recipients set claimed_at = (now() at time zone 'utc') - interval '6 minutes' where id='${recNew}'`);
  await cron();
  check(sql(`select status || ',' || sent from sms_campaigns where id='${campS}'`) === 'done,2', 'po upływie 5 min druga rezerwacja przejęta, kampania done');
  check(callsTo(cS.phones).length === 2, 'każdy numer wywołany raz');

  section('usunięcie klienta nie psuje historii');
  const delId = c1.ids[0];
  const before = sql(`select customer_name from sms_campaign_recipients where campaign_id='${id1}' and customer_id='${delId}'`);
  sql(`delete from customers where id='${delId}'`);
  d = await get(A, id1);
  check(d.recipients.some((x) => x.customerName === before && x.customerId === null), 'odbiorca zachowany z danymi z chwili wysyłki, customerId = null');
});
