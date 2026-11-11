// Powiadomienia o nieudanych SMS-ach (dzwonek): lista, zwijanie problemów bramki, przeczytane, izolacja.
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

async function salon(tag) {
  const c = new Client(tag);
  const email = `${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  r = await c.req('GET', '/api/auth/csrf');
  await c.req('POST', '/api/auth/callback/credentials', undefined, { csrfToken: r.json.csrfToken, email, password: PASSWORD, callbackUrl: BASE });
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  return c;
}

let n = 0;
async function visit(c, { consent = true, day = '2027-01-15' } = {}) {
  const cust = await c.req('POST', '/api/customers', { name: 'Jan', surname: `Nowak${++n}`, phone: '+48500000000', smsConsent: consent });
  const v = await c.req('POST', '/api/visits', { customerId: cust.json.customer.id, visitDate: `${day}T10:00:00.000Z`, visitType: 'badanie' });
  if (v.status >= 300) throw new Error(`visit: ${v.status} ${JSON.stringify(v.json)}`);
  return v.json.visit.id;
}

/** Nieudany SMS: status wizyty + wpis w sms_logs (jak robi cron / ręczna wysyłka). */
function fail(visitId, error, type = 'reminder') {
  const col = type === 'reminder' ? 'reminder_sms_status' : 'review_sms_status';
  sql(`UPDATE visits SET ${col}='failed' WHERE id='${visitId}'`);
  sql(`INSERT INTO sms_logs (id, visit_id, sms_type, phone, message, status, error_message) VALUES (gen_random_uuid(), '${visitId}', '${type}', '+48500000000', 'x', 'failed', '${error}')`);
}

const get = async (c) => (await c.req('GET', '/api/notifications')).json;

await run(async () => {
  section('401 bez sesji');
  const anon = new Client('anon');
  check((await anon.req('GET', '/api/notifications')).status === 401, 'GET bez sesji → 401');
  check((await anon.req('POST', '/api/notifications/read', {})).status === 401, 'POST read bez sesji → 401');

  const A = await salon('NA');
  const B = await salon('NB');

  section('pusta lista');
  let d = await get(A);
  check(d.unreadCount === 0 && d.items.length === 0, 'brak powiadomień na start', d);

  section('konkretny błąd dostawcy → sms_failed');
  const v1 = await visit(A);
  fail(v1, 'Invalid phone number');
  d = await get(A);
  check(d.items.length === 1 && d.items[0].kind === 'sms_failed', 'jeden wpis sms_failed', d);
  check(d.items[0].reason === 'Nieprawidłowy numer telefonu' && d.items[0].visitId === v1 && d.items[0].smsType === 'reminder', 'powód po polsku, wizyta, typ', d.items[0]);
  check(d.items[0].customerName.startsWith('Jan Nowak') && d.items[0].visitDate && d.items[0].createdAt, 'klient, daty');
  check(d.items[0].visitDay === '2027-01-15', 'dzień wizyty (Warszawa)', d.items[0].visitDay);
  check(d.unreadCount === 1, 'unreadCount = 1');

  section('pominięcie z braku zgody nie powiadamia');
  const vc = await visit(A, { consent: false });
  fail(vc, 'Customer has not consented to SMS');
  d = await get(A);
  check(d.items.length === 1, 'wpis o braku zgody pominięty', d.items.length);

  section('problemy bramki zwijają się w jeden wpis');
  const g1 = await visit(A);
  const g2 = await visit(A);
  const g3 = await visit(A);
  fail(g1, 'Business SMS provider not configured');
  fail(g2, 'SMS template not configured');
  fail(g3, 'Authorization failed', 'review');
  d = await get(A);
  const gw = d.items.filter((i) => i.kind === 'sms_gateway');
  check(gw.length === 1 && gw[0].count === 3, 'jeden wpis bramki z count=3', gw);
  check(d.items.length === 2 && d.unreadCount === 2, 'razem 2 wpisy (bramka + sms_failed)', d.items.length);

  section('sortowanie najnowsze pierwsze');
  const times = d.items.map((i) => i.createdAt);
  check(times[0] >= times[1], 'malejąco po createdAt', times);

  section('rozwiązany SMS znika');
  sql(`UPDATE visits SET reminder_sms_status='sent' WHERE id='${g1}'`);
  d = await get(A);
  check(d.items.find((i) => i.kind === 'sms_gateway')?.count === 2, 'bramka: count spada do 2');
  sql(`UPDATE visits SET reminder_sms_status='sent' WHERE id='${v1}'`);
  d = await get(A);
  check(!d.items.some((i) => i.kind === 'sms_failed'), 'wysłany SMS znika z listy');

  section('izolacja salonów');
  const db = await get(B);
  check(db.items.length === 0 && db.unreadCount === 0, 'salon B nie widzi wpisów A', db);
  const vb = await visit(B);
  fail(vb, 'Not enough credits');
  check((await get(B)).items[0]?.reason === 'Brak środków na koncie SMS', 'salon B ma własny wpis');
  check((await get(A)).items.every((i) => i.visitId !== vb), 'salon A nie widzi wpisu B');
  const idB = (await get(B)).items[0].id;
  await A.req('POST', '/api/notifications/read', { ids: [idB] });
  check((await get(B)).unreadCount === 1, 'A nie oznaczy przeczytanych wpisów B');

  section('przeczytane');
  d = await get(A);
  check(d.unreadCount === 1, 'przed: 1 nieprzeczytane (bramka)');
  let r = await A.req('POST', '/api/notifications/read', { ids: ['gateway'] });
  check(r.status === 200, 'POST read ids', r.json);
  d = await get(A);
  check(d.unreadCount === 0 && d.items.length === 1 && d.items[0].read === true, 'wpis zostaje, przeczytany', d);
  const v2 = await visit(A);
  fail(v2, 'Invalid number');
  check((await get(A)).unreadCount === 1, 'nowa porażka → nieprzeczytane');
  r = await A.req('POST', '/api/notifications/read', {});
  d = await get(A);
  check(d.unreadCount === 0 && d.items.length === 2, 'read bez ids → wszystkie przeczytane, nadal widoczne', d);
  check((await A.req('POST', '/api/notifications/read', { ids: 'x' })).status === 400, 'zły body → 400');
});
