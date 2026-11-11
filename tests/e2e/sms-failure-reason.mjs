// Powód nieudanego SMS na listach wizyt i zleceń: reminderSmsFailure / reviewSmsFailure.
import { Client, PASSWORD, check, section, run, sql } from './lib.mjs';

async function salon(tag) {
  const c = new Client(tag);
  const email = `sfr-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  const cust = await c.req('POST', '/api/customers', { name: 'Jan', surname: `Test${tag}`, phone: '+48500000000', smsConsent: true });
  return { c, customerId: cust.json.customer.id };
}

const visit = async (s, day) => (await s.c.req('POST', '/api/visits', { customerId: s.customerId, visitDate: `${day}T10:00:00.000Z`, visitType: 'badanie' })).json.visit.id;
const order = async (s) => (await s.c.req('POST', '/api/work-orders', { customerId: s.customerId, receivedAt: '2026-11-08', totalAmount: '100', deposit: '', items: [] })).json.workOrder.id;

function failVisit(id, type, error, at = 'now()') {
  const col = type === 'reminder' ? 'reminder_sms_status' : 'review_sms_status';
  sql(`UPDATE visits SET ${col}='failed' WHERE id='${id}'`);
  sql(`INSERT INTO sms_logs (id, visit_id, sms_type, phone, message, status, error_message, sent_at) VALUES (gen_random_uuid(), '${id}', '${type}', '+48500000000', 'x', 'failed', '${error}', ${at})`);
}

await run(async () => {
  const A = await salon('A');
  const B = await salon('B');
  const range = '?from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z';

  const v1 = await visit(A, '2027-03-01');
  const v2 = await visit(A, '2027-03-01');
  const v3 = await visit(A, '2027-03-01');
  failVisit(v1, 'reminder', 'Business SMS provider not configured');
  failVisit(v2, 'review', 'Invalid phone number');
  // v3: starszy błąd (auth) i nowszy (brak środków) — liczy się najnowszy
  failVisit(v3, 'reminder', 'Authorization failed', "now() - interval '1 hour'");
  sql(`INSERT INTO sms_logs (id, visit_id, sms_type, phone, message, status, error_message) VALUES (gen_random_uuid(), '${v3}', 'reminder', '+48500000000', 'x', 'failed', 'Not enough credits')`);

  section('lista wizyt (zakres dni)');
  let r = await A.c.req('GET', `/api/visits${range}`);
  const by = (list) => Object.fromEntries(list.map((v) => [v.id, v]));
  let m = by(r.json.visits);
  const f1 = m[v1].reminderSmsFailure;
  check(f1?.reasonCode === 'not_configured' && f1.isConfig === true && f1.reason && f1.at, 'przypomnienie: not_configured, isConfig', f1);
  check(m[v1].reviewSmsFailure === null, 'review bez błędu → null');
  const f2 = m[v2].reviewSmsFailure;
  check(f2?.reasonCode === 'bad_phone' && f2.isConfig === false, 'opinia: bad_phone, nie config', f2);
  check(m[v2].reminderSmsFailure === null, 'reminder bez błędu → null');
  check(m[v3].reminderSmsFailure?.reasonCode === 'no_credits', 'najnowszy log wygrywa (no_credits)', m[v3].reminderSmsFailure);

  section('tryb klienta (paginacja)');
  r = await A.c.req('GET', `/api/visits?customerId=${A.customerId}&page=1&pageSize=10`);
  m = by(r.json.visits);
  check(m[v1].reminderSmsFailure?.reasonCode === 'not_configured' && m[v2].reviewSmsFailure?.reasonCode === 'bad_phone', 'obiekty błędu także w trybie klienta');

  section('brak błędu → null; wysłane po błędzie → null');
  const v4 = await visit(A, '2027-03-01');
  sql(`UPDATE visits SET reminder_sms_status='sent' WHERE id='${v1}'`);
  r = await A.c.req('GET', `/api/visits${range}`);
  m = by(r.json.visits);
  check(m[v4].reminderSmsFailure === null && m[v4].reviewSmsFailure === null, 'wizyta bez błędu → null');
  check(m[v1].reminderSmsFailure === null, 'status sent → null mimo starego logu');

  section('brak zgody');
  const v5 = await visit(A, '2027-03-01');
  failVisit(v5, 'reminder', 'Customer has not consented to SMS');
  r = await A.c.req('GET', `/api/visits${range}`);
  const f5 = by(r.json.visits)[v5].reminderSmsFailure;
  check(f5?.reasonCode === 'consent' && f5.isConfig === false, 'consent, bez linku konfiguracji', f5);

  section('izolacja salonów');
  r = await B.c.req('GET', `/api/visits${range}`);
  check(r.json.visits.length === 0, 'B nie widzi wizyt A');
  const vb = await visit(B, '2027-03-01');
  r = await B.c.req('GET', `/api/visits${range}`);
  check(r.json.visits.length === 1 && r.json.visits[0].id === vb && r.json.visits[0].reminderSmsFailure === null, 'B widzi tylko swoją wizytę, bez cudzych błędów');

  section('zlecenia');
  const o1 = await order(A);
  const o2 = await order(A);
  sql(`UPDATE work_orders SET review_sms_status='failed' WHERE id='${o1}'`);
  sql(`INSERT INTO sms_logs (id, work_order_id, sms_type, phone, message, status, error_message) VALUES (gen_random_uuid(), '${o1}', 'review', '+48500000000', 'x', 'failed', 'SMS template not configured')`);
  r = await A.c.req('GET', '/api/work-orders');
  m = by(r.json.workOrders);
  check(m[o1].reviewSmsFailure?.reasonCode === 'no_template' && m[o1].reviewSmsFailure.isConfig === true, 'zlecenie: no_template, isConfig', m[o1].reviewSmsFailure);
  check(m[o2].reviewSmsFailure === null, 'zlecenie bez błędu → null');
  r = await A.c.req('GET', '/api/work-orders?page=1&pageSize=10');
  check(by(r.json.workOrders)[o1].reviewSmsFailure?.reasonCode === 'no_template', 'także ze stronicowaniem');
  r = await B.c.req('GET', '/api/work-orders');
  check(r.json.workOrders.length === 0, 'B nie widzi zleceń A');
});
