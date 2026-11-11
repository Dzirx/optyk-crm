// Zaplanowane SMS-y (harmonogram / cron): przypomnienie przed wizytą, prośba o opinię po wizycie.
// Przypomnienie, którego termin minął razem z wizytą (serwer lub komputer był wyłączony), nie wychodzi.
// Przypomnienia wychodzą tylko w oknie godzin salonu (reminder_window_start/end, minuty czasu polskiego).
// Bramka SMS jest podmieniona w fake-sms.cjs, każde wywołanie trafia do FAKE_SMS_LOG.
import { readFileSync } from 'node:fs';
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

const LOG = process.env.FAKE_SMS_LOG;
const callsTo = (phone) => (LOG ? readFileSync(LOG, 'utf8').split('\n').filter((p) => p === phone).length : 0);
const cron = async () => (await fetch(`${BASE}/api/cron/send-scheduled-sms`, { headers: { authorization: 'Bearer cron-test' } })).json();
const UTC = "(now() at time zone 'utc')";

await run(async () => {
  const c = new Client('SCH');
  const email = `sch-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: 'Salon SCH', email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error('login');
  r = await c.req('POST', '/api/business', {
    name: 'Optyk SCH', googleReviewUrl: 'https://g.page/test', smsProvider: 'smsplanet', smsConfig: { apiKey: 'ok-key' },
    reminderSmsTemplate: 'Przypominamy o wizycie {name}', reviewSmsTemplate: 'Oceń nas {link}',
  });
  if (r.status >= 300) throw new Error(`business: ${r.status} ${JSON.stringify(r.json)}`);

  const setWindow = (from, to) => sql(`update businesses set reminder_window_start=${from}, reminder_window_end=${to} where name='Optyk SCH'`);
  setWindow(0, 1440); // okno otwarte całą dobę: wynik nie zależy od godziny uruchomienia testu

  section('domyślnie automatyczne przypomnienia są wyłączone');
  r = await c.req('GET', '/api/business');
  check(r.json.business.autoReminders === false, 'nowy salon: autoReminders = false');
  {
    const pOff = `+48516${String(Date.now()).slice(-6)}`;
    const cOff = (await c.req('POST', '/api/customers', { name: 'Jan', surname: 'Wyłączone', phone: pOff, smsConsent: true })).json.customer.id;
    const vOff = sql(`insert into visits (id, customer_id, visit_date, reminder_sms_date, updated_at)
      values (gen_random_uuid(), '${cOff}', ${UTC} + interval '1 day', ${UTC} - interval '5 minutes', ${UTC}) returning id`).split('\n')[0];
    await cron();
    check(sql(`select reminder_sms_status from visits where id='${vOff}'`) === 'pending' && callsTo(pOff) === 0, 'wyłączone: przypomnienie czeka, brak SMS');
    check(sql(`select count(*) from sms_logs where visit_id='${vOff}'`) === '0', 'wyłączone: brak wpisu w dzienniku (bez błędu)');
    sql(`delete from visits where id='${vOff}'`);
  }
  r = await c.req('PATCH', '/api/business', { autoReminders: true });
  check(r.status === 200 && r.json.business.autoReminders === true, 'włączenie automatycznych przypomnień');

  const stamp = String(Date.now()).slice(-6);
  const phones = { past: `+48511${stamp}`, future: `+48512${stamp}` };
  const cust = async (phone, surname) =>
    (await c.req('POST', '/api/customers', { name: 'Jan', surname, phone, smsConsent: true })).json.customer.id;
  const cPast = await cust(phones.past, 'Minęła');
  const cFuture = await cust(phones.future, 'Jutro');

  // Wizyta 2 godziny temu: termin przypomnienia i opinii już minął.
  const vPast = sql(`insert into visits (id, customer_id, visit_date, reminder_sms_date, review_sms_date, updated_at)
    values (gen_random_uuid(), '${cPast}', ${UTC} - interval '2 hours', ${UTC} - interval '1 day', ${UTC} - interval '1 hour', ${UTC}) returning id`).split('\n')[0];
  // Wizyta jutro: termin przypomnienia już minął, opinia dopiero po wizycie.
  const vFuture = sql(`insert into visits (id, customer_id, visit_date, reminder_sms_date, review_sms_date, updated_at)
    values (gen_random_uuid(), '${cFuture}', ${UTC} + interval '1 day', ${UTC} - interval '5 minutes', ${UTC} + interval '2 days', ${UTC}) returning id`).split('\n')[0];

  section('uruchomienie harmonogramu');
  r = await cron();
  check(r.results?.reminderSms?.processed >= 2, 'przetworzono przypomnienia', r.results?.reminderSms);

  const st = (id, col) => sql(`select ${col} from visits where id='${id}'`);
  check(st(vPast, 'reminder_sms_status') === 'failed', 'przypomnienie po wizycie: nie wysłane (failed)');
  check(callsTo(phones.past) === 1, `do klienta po wizycie poszedł tylko 1 SMS (opinia), było ${callsTo(phones.past)}`);
  check(st(vPast, 'review_sms_status') === 'sent', 'opinia po wizycie: wysłana');
  check(st(vFuture, 'reminder_sms_status') === 'sent', 'przypomnienie przed wizytą: wysłane');
  check(st(vFuture, 'review_sms_status') === 'pending', 'opinia przed wizytą: czeka');
  check(callsTo(phones.future) === 1, 'do klienta z jutrzejszą wizytą: 1 SMS');

  section('powód na liście wizyt');
  r = await c.req('GET', `/api/visits?customerId=${cPast}&page=1&pageSize=10`);
  const f = r.json.visits.find((v) => v.id === vPast)?.reminderSmsFailure;
  check(f?.reasonCode === 'expired' && f.isConfig === false, 'powód: expired (wizyta już się odbyła)', f);

  section('drugie uruchomienie nic nie powtarza');
  await cron();
  check(callsTo(phones.past) === 1 && callsTo(phones.future) === 1, 'brak powtórnych SMS-ów');
  check(sql(`select count(*) from sms_logs where visit_id='${vPast}' and sms_type='reminder'`) === '1', 'jeden wpis w dzienniku dla pominiętego przypomnienia');

  section('okno wysyłki: poza oknem przypomnienie czeka');
  const warsawMinutes = (() => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
  })();
  // Okno zaczynające się za 2 godziny (albo kończące 2 godziny temu, gdy zostało mało dnia): teraz zamknięte.
  const [closedFrom, closedTo] = warsawMinutes < 1200 ? [warsawMinutes + 120, warsawMinutes + 180] : [warsawMinutes - 180, warsawMinutes - 120];
  const pWin = `+48513${stamp}`;
  const cWin = await cust(pWin, 'Okno');
  const vWin = sql(`insert into visits (id, customer_id, visit_date, reminder_sms_date, updated_at)
    values (gen_random_uuid(), '${cWin}', ${UTC} + interval '1 day', ${UTC} - interval '5 minutes', ${UTC}) returning id`).split('\n')[0];
  const pWinPast = `+48514${stamp}`;
  const cWinPast = await cust(pWinPast, 'OknoPrzeszla');
  const vWinPast = sql(`insert into visits (id, customer_id, visit_date, reminder_sms_date, updated_at)
    values (gen_random_uuid(), '${cWinPast}', ${UTC} - interval '1 hour', ${UTC} - interval '1 day', ${UTC}) returning id`).split('\n')[0];
  setWindow(closedFrom, closedTo);
  await cron();
  check(st(vWin, 'reminder_sms_status') === 'pending', 'poza oknem: przypomnienie nadal pending');
  check(callsTo(pWin) === 0, 'poza oknem: brak SMS');
  check(sql(`select count(*) from sms_logs where visit_id='${vWin}'`) === '0', 'poza oknem: brak wpisu w dzienniku');
  check(st(vWinPast, 'reminder_sms_status') === 'failed', 'poza oknem, ale wizyta już była: przypomnienie wygasa (failed)');
  check(callsTo(pWinPast) === 0, 'wygasłe przypomnienie: brak SMS');

  section('okno wysyłki: po otwarciu okna przypomnienie wychodzi');
  setWindow(0, 1440);
  await cron();
  check(st(vWin, 'reminder_sms_status') === 'sent' && callsTo(pWin) === 1, 'w oknie: przypomnienie wysłane (1 SMS)');

  section('API: dzień przypomnienia i okno wysyłki');
  const custApi = await cust(`+48515${stamp}`, 'Api');
  r = await c.req('POST', '/api/visits', { customerId: custApi, visitDate: '2027-01-15T10:00:00Z', reminderSmsDate: '2027-01-14' });
  check(r.status === 201 && new Date(r.json.visit.reminderSmsDate).toISOString() === '2027-01-13T23:00:00.000Z', `dzień zimą = początek dnia w Warszawie (${r.json?.visit?.reminderSmsDate})`);
  r = await c.req('POST', '/api/visits', { customerId: custApi, visitDate: '2027-07-15T10:00:00Z', reminderSmsDate: '2027-07-14' });
  check(r.status === 201 && new Date(r.json.visit.reminderSmsDate).toISOString() === '2027-07-13T22:00:00.000Z', `dzień latem = początek dnia w Warszawie (${r.json?.visit?.reminderSmsDate})`);
  r = await c.req('POST', '/api/visits', { customerId: custApi, visitDate: '2027-01-15T10:00:00Z', reminderSmsDate: '2027-01-15' });
  check(r.status === 201, `ten sam dzień co wizyta → 201 (${r.status})`);
  const vApi = r.json.visit.id;
  r = await c.req('POST', '/api/visits', { customerId: custApi, visitDate: '2027-01-15T10:00:00Z', reminderSmsDate: '2027-01-16' });
  check(r.status === 400 && /późniejszy niż dzień wizyty/.test(r.json.error), `dzień po wizycie → 400 (${r.json?.error})`);
  r = await c.req('POST', '/api/visits', { customerId: custApi, visitDate: '2027-01-15T10:00:00Z', reminderSmsDate: '2027-02-30' });
  check(r.status === 400, `nieistniejący dzień → 400 (${r.status})`);
  r = await c.req('PATCH', `/api/visits/${vApi}`, { reminderSmsDate: '2027-01-16' });
  check(r.status === 400, `PATCH: dzień po wizycie → 400 (${r.status})`);
  r = await c.req('PATCH', `/api/visits/${vApi}`, { reminderSmsDate: '2027-01-14' });
  check(r.status === 200 && new Date(r.json.visit.reminderSmsDate).toISOString() === '2027-01-13T23:00:00.000Z', `PATCH: zmiana dnia → 200 (${r.status})`);
  r = await c.req('PATCH', '/api/business', { reminderWindowStart: 600, reminderWindowEnd: 600 });
  check(r.status === 400, `okno: od = do → 400 (${r.status})`);
  r = await c.req('PATCH', '/api/business', { reminderWindowStart: 1500 });
  check(r.status === 400, `okno: poza dobą → 400 (${r.status})`);
  r = await c.req('PATCH', '/api/business', { reminderWindowStart: 480, reminderWindowEnd: 1080 });
  check(r.status === 200 && r.json.business.reminderWindowStart === 480 && r.json.business.reminderWindowEnd === 1080, 'okno 08:00-18:00 zapisane');
  r = await c.req('PATCH', '/api/business', { reminderWindowStart: 1100 });
  check(r.status === 400, `okno: nowy początek po zapisanym końcu → 400 (${r.status})`);
  r = await c.req('GET', '/api/business');
  check(r.json.business.smsReady === true, 'GET /api/business: smsReady = true');
});
