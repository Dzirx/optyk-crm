// Prośba o opinię SMS: ostatnia prośba klienta, ponowna wysyłka, rezerwacja atomowa, logi zleceń, dzwonek.
// Bramka SMS jest podmieniona w fake-sms.cjs: klucz "fail-key" = błąd, inny = sukces (opóźnienie 300 ms).
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

async function salon(tag, apiKey = 'ok-key') {
  const c = new Client(tag);
  const email = `${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  r = await c.req('GET', '/api/auth/csrf');
  await c.req('POST', '/api/auth/callback/credentials', undefined, { csrfToken: r.json.csrfToken, email, password: PASSWORD, callbackUrl: BASE });
  r = await c.req('POST', '/api/business', {
    name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', smsProvider: 'smsplanet', smsConfig: { apiKey },
    reminderSmsTemplate: 'Przypomnienie {name} {date} - {staff}',
    reviewSmsTemplate: 'Cześć {name}! Opinia: {link} - {staff}',
  });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  return c;
}

let n = 0;
const customer = async (c) => (await c.req('POST', '/api/customers', { name: 'Anna', surname: `Rev${++n}`, phone: '+48500000001', smsConsent: true })).json.customer;
const visit = async (c, cust, day = '2026-11-05') =>
  (await c.req('POST', '/api/visits', { customerId: cust.id, visitDate: `${day}T10:00:00.000Z`, visitType: 'badanie' })).json.visit;
const order = async (c, cust) => {
  const r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', framePrice: '1', ownFrame: true }] });
  if (r.status >= 300) throw new Error(`order: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.workOrder ?? r.json.order;
};
const last = async (c, id) => c.req('GET', `/api/customers/${id}/last-review-request`);
const row = (table, id, cols) => sql(`SELECT ${cols} FROM ${table} WHERE id='${id}'`);

await run(async () => {
  const A = await salon('RA');
  const B = await salon('RB');
  const F = await salon('RF', 'fail-key');

  section('endpoint last-review-request: brak, 404, 401');
  const c1 = await customer(A);
  let r = await last(A, c1.id);
  check(r.status === 200 && r.json.lastSentAt === null && r.json.source === null, 'nowy klient: null/null', r.json);
  check((await last(B, c1.id)).status === 404, 'cudzy klient → 404');
  check((await last(A, '00000000-0000-0000-0000-000000000000')).status === 404, 'nieistniejący klient → 404');
  check((await last(A, 'nie-uuid')).status === 404, 'zły id → 404');
  check((await new Client('anon').req('GET', `/api/customers/${c1.id}/last-review-request`)).status === 401, 'bez sesji → 401');

  section('wizyta: udana wysyłka aktualizuje klienta');
  const v1 = await visit(A, c1);
  r = await A.req('POST', `/api/visits/${v1.id}/send-sms`, { smsType: 'review' });
  check(r.status === 200, 'SMS z wizyty wysłany', r);
  r = await last(A, c1.id);
  check(r.json.lastSentAt && r.json.source === 'wizyta 05.11.2026', 'kolumna: źródło „wizyta 05.11.2026”', r.json);
  const t1 = r.json.lastSentAt;
  check(sql(`SELECT count(*) FROM sms_logs WHERE visit_id='${v1.id}' AND status='sent'`) === '1', 'log wizyty sent');

  section('ponowna wysyłka po sent (wizyta)');
  await new Promise((x) => setTimeout(x, 50));
  r = await A.req('POST', `/api/visits/${v1.id}/send-sms`, { smsType: 'review' });
  check(r.status === 200, 'ponowna wysyłka po sent → 200', r);
  check((await last(A, c1.id)).json.lastSentAt > t1, 'lastReviewSmsAt przesunięte');
  check(sql(`SELECT count(*) FROM sms_logs WHERE visit_id='${v1.id}' AND status='sent'`) === '2', 'dwa logi sent');
  // Wizyta v1 już się odbyła: przypomnienie nie ma sensu (400), prośbę o opinię można wysyłać dalej.
  r = await A.req('POST', `/api/visits/${v1.id}/send-sms`, { smsType: 'reminder' });
  check(r.status === 400 && /już się odbyła/.test(r.json?.error ?? ''), 'przypomnienie po wizycie → 400', r);

  section('równoległe wysyłki: dokładnie jedna rezerwacja');
  const par = await Promise.all([1, 2, 3].map(() => A.req('POST', `/api/visits/${v1.id}/send-sms`, { smsType: 'review' })));
  const codes = par.map((p) => p.status).sort();
  check(codes.filter((s) => s === 200).length === 1 && codes.filter((s) => s === 409).length === 2, 'wizyta: 1× 200, 2× 409', codes);

  section('porzucona rezerwacja (sending)');
  sql(`UPDATE visits SET review_sms_status='sending', review_sms_sent_at=now() AT TIME ZONE 'utc' WHERE id='${v1.id}'`);
  r = await A.req('POST', `/api/visits/${v1.id}/send-sms`, { smsType: 'review' });
  check(r.status === 409, 'świeże sending → 409', r);
  sql(`UPDATE visits SET review_sms_sent_at=(now() AT TIME ZONE 'utc') - interval '3 minutes' WHERE id='${v1.id}'`);
  r = await A.req('POST', `/api/visits/${v1.id}/send-sms`, { smsType: 'review' });
  check(r.status === 200 && row('visits', v1.id, 'review_sms_status') === 'sent', 'sending starsze niż 2 min → można wysłać', r);

  section('zlecenie: wysyłka, log, źródło');
  const c2 = await customer(A);
  const o1 = await order(A, c2);
  r = await A.req('POST', `/api/work-orders/${o1.id}/send-sms`);
  check(r.status === 200, 'SMS ze zlecenia wysłany', r);
  r = await last(A, c2.id);
  check(r.json.source === `zlecenie ${o1.orderNumber}` && r.json.lastSentAt, 'źródło „zlecenie …”', r.json);
  check(sql(`SELECT count(*) FROM sms_logs WHERE work_order_id='${o1.id}' AND status='sent' AND sms_type='review'`) === '1', 'log zlecenia sent');
  r = await A.req('POST', `/api/work-orders/${o1.id}/send-sms`);
  check(r.status === 200, 'ponowna wysyłka zlecenia po sent → 200', r);
  const parO = await Promise.all([1, 2, 3].map(() => A.req('POST', `/api/work-orders/${o1.id}/send-sms`)));
  const codesO = parO.map((p) => p.status).sort();
  check(codesO.filter((s) => s === 200).length === 1 && codesO.filter((s) => s === 409).length === 2, 'zlecenie: 1× 200, 2× 409', codesO);
  check(row('work_orders', o1.id, 'review_sms_status') === 'sent', 'status zlecenia nadal sent');
  check((await B.req('POST', `/api/work-orders/${o1.id}/send-sms`)).status === 404, 'cudze zlecenie → 404');

  sql(`UPDATE work_orders SET review_sms_status='sending', review_sms_sent_at=now() AT TIME ZONE 'utc' WHERE id='${o1.id}'`);
  check((await A.req('POST', `/api/work-orders/${o1.id}/send-sms`)).status === 409, 'zlecenie: świeże sending → 409');
  sql(`UPDATE work_orders SET review_sms_sent_at=(now() AT TIME ZONE 'utc') - interval '3 minutes' WHERE id='${o1.id}'`);
  check((await A.req('POST', `/api/work-orders/${o1.id}/send-sms`)).status === 200, 'zlecenie: stare sending → 200');

  section('zapasowe wyliczenie (kolumna pusta)');
  const c3 = await customer(A);
  const v3 = await visit(A, c3, '2026-10-01');
  const o3 = await order(A, c3);
  check((await last(A, c3.id)).json.lastSentAt === null, 'brak wysłanych → null');
  sql(`UPDATE visits SET review_sms_status='sent', review_sms_sent_at='2026-10-02 08:00:00.123456' WHERE id='${v3.id}'`);
  sql(`UPDATE work_orders SET review_sms_status='sent', review_sms_sent_at='2026-11-03 09:15:00' WHERE id='${o3.id}'`);
  const list = (await A.req('GET', '/api/customers?page=1&pageSize=50')).json.customers;
  const inList = list.find((c) => c.id === c3.id);
  check(inList.lastReviewSmsAt?.startsWith('2026-11-03T09:15') && inList.lastReviewSmsSource === `zlecenie ${o3.orderNumber}`, 'lista klientów: zapas ze zlecenia (nowsze)', inList);
  check(row('customers', c3.id, 'last_review_sms_at') === '', 'lista nie zapisuje kolumny');
  r = await last(A, c3.id);
  check(r.json.source === `zlecenie ${o3.orderNumber}` && r.json.lastSentAt.startsWith('2026-11-03T09:15'), 'endpoint: zapas ze zlecenia', r.json);
  check(row('customers', c3.id, 'last_review_sms_at').startsWith('2026-11-03 09:15'), 'endpoint zapisał kolumnę');
  const c4 = await customer(A);
  const v4 = await visit(A, c4, '2026-09-09');
  sql(`UPDATE visits SET review_sms_status='sent', review_sms_sent_at='2026-09-10 10:00:00' WHERE id='${v4.id}'`);
  r = await last(A, c4.id);
  check(r.json.source === 'wizyta 09.09.2026', 'zapas z wizyty', r.json);
  check((await B.req('GET', '/api/customers?page=1')).json.customers.length === 0, 'salon B nie widzi klientów A');

  section('ponowna wysyłka po wpisie SQL (mikrosekundy) i brak zgody');
  const rs = await A.req('POST', `/api/visits/${v4.id}/send-sms`, { smsType: 'review' });
  check(rs.status === 200, 'resend po sent_at z mikrosekundami OK', rs);
  const cn = (await A.req('POST', '/api/customers', { name: 'Bez', surname: 'Zgody', phone: '+48500000002', smsConsent: false })).json.customer;
  const vn = await visit(A, cn);
  check((await A.req('POST', `/api/visits/${vn.id}/send-sms`, { smsType: 'review' })).status === 400, 'brak zgody → 400');

  section('nieudana wysyłka: zlecenie → dzwonek, log, rozwiązanie');
  const cf = await customer(F);
  const of = await order(F, cf);
  r = await F.req('POST', `/api/work-orders/${of.id}/send-sms`);
  check(r.status === 500, 'bramka zwraca błąd → 500', r);
  check(row('work_orders', of.id, 'review_sms_status') === 'failed', 'status zlecenia failed');
  check(sql(`SELECT count(*) FROM sms_logs WHERE work_order_id='${of.id}' AND status='failed' AND error_message <> ''`) === '1', 'log failed z komunikatem');
  check(row('customers', cf.id, 'last_review_sms_at') === '', 'nieudana wysyłka nie rusza klienta');
  let d = (await F.req('GET', '/api/notifications')).json;
  let it = d.items.find((i) => i.workOrderId === of.id);
  check(it && it.target === 'work_order' && it.smsType === 'review' && it.orderNumber === of.orderNumber && it.customerId === cf.id, 'zlecenie w dzwonku', d.items);
  check(d.unreadCount >= 1, 'nieprzeczytane');
  check((await A.req('GET', '/api/notifications')).json.items.every((i) => i.workOrderId !== of.id), 'salon A nie widzi wpisu F');
  const ack = await A.req('POST', '/api/notifications/read', { ids: [it.id] });
  check((await F.req('GET', '/api/notifications')).json.unreadCount === d.unreadCount, 'A nie oznaczy wpisu F jako przeczytany', ack.json);
  // F nie ma poprawnego klucza, więc retry też zawodzi; „rozwiązanie” = status zlecenia przestaje być failed.
  r = await F.req('POST', `/api/work-orders/${of.id}/send-sms`);
  check(r.status === 500, 'ponowna próba też zwraca błąd', r.status);
  sql(`UPDATE work_orders SET review_sms_status='sent' WHERE id='${of.id}'`);
  d = (await F.req('GET', '/api/notifications')).json;
  check(!d.items.some((i) => i.workOrderId === of.id), 'po rozwiązaniu znika z dzwonka');
  r = await F.req('POST', '/api/notifications/read', {});
  check(r.status === 200, 'read bez ids OK');

  section('nieudany resend nie psuje wysłanego rekordu');
  const cg = await customer(F);
  const vg = await visit(F, cg);
  sql(`UPDATE visits SET review_sms_status='sent', review_sms_sent_at='2026-11-01 10:00:00' WHERE id='${vg.id}'`);
  r = await F.req('POST', `/api/visits/${vg.id}/send-sms`, { smsType: 'review' });
  check(r.status === 500, 'resend z błędem bramki → 500');
  check(row('visits', vg.id, 'review_sms_status || \'|\' || review_sms_sent_at') === 'sent|2026-11-01 10:00:00', 'rekord wraca do poprzedniego „sent”', row('visits', vg.id, 'review_sms_status, review_sms_sent_at'));
});
