// Poprawki po przeglądzie wizyt i wysyłek grupowych: przesunięcie wizyty bez daty SMS w żądaniu,
// klucz idempotencji przy zmianie treści, niezależny stan „przeczytane” wpisu bramki i wpisu kampanii,
// licznik i „oznacz wszystkie” dla więcej niż 50 wpisów.
import { Client, PASSWORD, check, section, run, sql } from './lib.mjs';

const DAY = 86400_000;
const warsawDay = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const startOfWarsawDay = (iso) => sql(`select to_char(((('${iso}'::date)::timestamp at time zone 'Europe/Warsaw') at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
const FIXED = new Set(['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26']);
const isoPlus = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

/** Dzień wizyty za ~3 tygodnie (wtorek-piątek), którego poprzedni dzień to zwykły dzień roboczy (poza świętami ruchomymi: omijamy kwiecień-czerwiec). */
function pickVisitDay() {
  for (let n = 21; n < 80; n++) {
    const d = warsawDay(n);
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    const month = Number(d.slice(5, 7));
    if (wd < 2 || wd > 5 || (month >= 3 && month <= 6)) continue;
    if (FIXED.has(d.slice(5)) || FIXED.has(isoPlus(d, -1).slice(5))) continue;
    return d;
  }
  throw new Error('brak dnia wizyty');
}

async function salon(tag, apiKey = 'ok-key') {
  const c = new Client(tag);
  const email = `rfs-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', smsProvider: 'smsplanet', smsConfig: { apiKey } });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  c.biz = (await c.req('GET', '/api/business')).json.business.id;
  return c;
}

await run(async () => {
  const A = await salon('RA');
  const stamp = String(Date.now()).slice(-6);
  const cust = (await A.req('POST', '/api/customers', { name: 'Jan', surname: 'Przesunięty', phone: `+48517${stamp}`, smsConsent: true })).json.customer.id;

  // ------------------------------------------------------------ (1) przesunięcie wizyty bez daty SMS
  section('przesunięcie wizyty na wcześniej bez daty SMS w żądaniu');
  const D = pickVisitDay();
  const prev = isoPlus(D, -1);
  const later = isoPlus(D, 7); // data wizyty startowej: tydzień później
  let r = await A.req('POST', '/api/visits', { customerId: cust, visitDate: `${later}T10:00:00.000Z`, reminderSmsDate: isoPlus(later, -1) });
  check(r.status === 201, `utworzenie wizyty → ${r.status}`, r.json);
  const vid = r.json.visit.id;
  r = await A.req('PATCH', `/api/visits/${vid}`, { visitDate: `${D}T10:00:00.000Z` });
  check(r.status === 200, `przesunięcie bez reminderSmsDate → ${r.status}`, r.json);
  const stored = new Date(r.json?.visit?.reminderSmsDate ?? 0).toISOString();
  check(stored === startOfWarsawDay(prev), `przypomnienie = początek dnia ${prev} (Warszawa) → ${stored}`);

  r = await A.req('PATCH', `/api/visits/${vid}`, { visitDate: new Date().toISOString() });
  check(r.status === 200 && r.json.visit.reminderSmsDate === null, `przesunięcie na dziś: przypomnienie wyczyszczone (${r.status})`, r.json?.visit?.reminderSmsDate);

  r = await A.req('POST', '/api/visits', { customerId: cust, visitDate: `${later}T10:00:00.000Z`, reminderSmsDate: isoPlus(later, -1) });
  const vid2 = r.json.visit.id;
  r = await A.req('PATCH', `/api/visits/${vid2}`, { visitDate: `${D}T10:00:00.000Z`, reminderSmsDate: `${later}` });
  check(r.status === 400 && /późniejszy/.test(r.json?.error ?? ''), `jawny zły dzień przypomnienia → 400 (${r.status})`, r.json);

  r = await A.req('POST', '/api/visits', { customerId: cust, visitDate: `${later}T10:00:00.000Z`, reminderSmsDate: isoPlus(later, -1) });
  const vid3 = r.json.visit.id;
  const before = sql(`select reminder_sms_date from visits where id='${vid3}'`);
  sql(`update visits set reminder_sms_status='sent' where id='${vid3}'`);
  r = await A.req('PATCH', `/api/visits/${vid3}`, { visitDate: `${D}T10:00:00.000Z` });
  check(r.status === 200 && sql(`select reminder_sms_date from visits where id='${vid3}'`) === before, 'wysłane przypomnienie bez zmian');

  // ------------------------------------------------------------ (2) klucz idempotencji
  section('wysyłka grupowa: ten sam klucz = ta sama kampania, nowy klucz z nową treścią = nowa kampania');
  const k1 = `rfs-${Date.now()}-a`;
  const k2 = `rfs-${Date.now()}-b`;
  const first = await A.req('POST', '/api/sms/campaigns', { message: 'Pierwsza {name}', customerIds: [cust], idempotencyKey: k1 });
  const retry = await A.req('POST', '/api/sms/campaigns', { message: 'Pierwsza {name}', customerIds: [cust], idempotencyKey: k1 });
  const changed = await A.req('POST', '/api/sms/campaigns', { message: 'Druga {name}', customerIds: [cust], idempotencyKey: k2 });
  check(first.status === 201 && retry.status === 200 && retry.json.campaign.id === first.json.campaign.id, `ponowienie identyczne → ta sama kampania (${first.status}/${retry.status})`);
  check(changed.json?.campaign?.id && changed.json.campaign.id !== first.json.campaign.id && changed.json.campaign.message === 'Druga {name}', 'nowy klucz z inną treścią → nowa kampania');

  // ------------------------------------------------------------ (3) niezależny stan „przeczytane”
  section('dzwonek: wpis bramki i wpis kampanii mają osobny stan');
  const B = await salon('RB');
  const mkCampaign = (failed, total, id = 'gen_random_uuid()') =>
    sql(`insert into sms_campaigns (id, business_id, message, total, failed, status, created_at, finished_at) values (${id}, '${B.biz}', 'T', ${total}, ${failed}, 'done', now(), now()) returning id`).split('\n')[0];
  const mixed = mkCampaign(3, 3);
  sql(`insert into sms_campaign_recipients (id, campaign_id, customer_name, phone, status, error_message, reason_code) values
    (gen_random_uuid(), '${mixed}', 'A', '+48500000001', 'failed', 'Unauthorized', 'auth'),
    (gen_random_uuid(), '${mixed}', 'B', '+48999000002', 'failed', 'Invalid phone number', 'bad_phone'),
    (gen_random_uuid(), '${mixed}', 'C', '+48999000003', 'failed', 'Invalid phone number', 'bad_phone')`);
  let n = (await B.req('GET', '/api/notifications')).json;
  const gw = n.items.find((i) => i.kind === 'sms_gateway');
  const camp = n.items.find((i) => i.kind === 'sms_campaign');
  check(!!gw && gw.count === 1 && !!camp && camp.count === 2 && n.unreadCount === 2, 'dwa wpisy: bramka (1) i kampania (2)', n.items);
  await B.req('POST', '/api/notifications/read', { ids: ['gateway'] });
  n = (await B.req('GET', '/api/notifications')).json;
  check(n.items.find((i) => i.kind === 'sms_gateway')?.read === true && n.items.find((i) => i.kind === 'sms_campaign')?.read === false && n.unreadCount === 1, 'przeczytana bramka nie przeczytała kampanii');
  await B.req('POST', '/api/notifications/read', { ids: [`campaign:${mixed}`] });
  n = (await B.req('GET', '/api/notifications')).json;
  check(n.unreadCount === 0, 'kampania przeczytana osobno');
  sql(`update sms_campaigns set failures_acknowledged_at = null, gateway_acknowledged_at = null where id='${mixed}'`);
  await B.req('POST', '/api/notifications/read', { ids: [`campaign:${mixed}`] });
  n = (await B.req('GET', '/api/notifications')).json;
  check(n.items.find((i) => i.kind === 'sms_gateway')?.read === false && n.items.find((i) => i.kind === 'sms_campaign')?.read === true, 'przeczytana kampania nie przeczytała bramki');

  // ------------------------------------------------------------ (4) więcej niż 50 wpisów
  section('dzwonek: licznik i „oznacz wszystkie” obejmują wszystkie wpisy');
  const C = await salon('RC');
  sql(`insert into sms_campaigns (id, business_id, message, total, failed, status, created_at, finished_at)
       select gen_random_uuid(), '${C.biz}', 'T', 2, 2, 'done', now() - (g || ' minutes')::interval, now() from generate_series(1, 60) g`);
  n = (await C.req('GET', '/api/notifications')).json;
  check(n.items.length === 50 && n.unreadCount === 60, `lista 50, licznik 60 (${n.items.length}/${n.unreadCount})`);
  await C.req('POST', '/api/notifications/read', {});
  n = (await C.req('GET', '/api/notifications')).json;
  check(n.unreadCount === 0, `po „oznacz wszystkie” licznik = ${n.unreadCount}`);
  check(sql(`select count(*) from sms_campaigns where business_id='${C.biz}' and failures_acknowledged_at is null`) === '0', 'wszystkie 60 kampanii potwierdzone w bazie');
});
