// Dane zakładu do wydruków: zapis w ustawieniach (API) i widoczność na wydruku zlecenia (odcinek, RODO, ostrzeżenie).
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

async function salon(tag, extra = {}) {
  const c = new Client(tag);
  const email = `${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  r = await c.req('GET', '/api/auth/csrf');
  await c.req('POST', '/api/auth/callback/credentials', undefined, { csrfToken: r.json.csrfToken, email, password: PASSWORD, callbackUrl: BASE });
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', ...extra });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  return { c, business: r.json.business };
}

async function printPage(c) {
  const cust = (await c.req('POST', '/api/customers', { name: 'Ewa', surname: 'Wydruk', phone: '+48600700800', smsConsent: false })).json.customer;
  const r = await c.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', framePrice: '100', ownFrame: false }] });
  if (r.status >= 300) throw new Error(`order: ${r.status} ${JSON.stringify(r.json)}`);
  const order = r.json.workOrder ?? r.json.order;
  // React wstawia komentarze <!-- --> między fragmenty tekstu; usuwamy je i encje, aby szukać zwykłego tekstu.
  return (await c.page(`/work-orders/${order.id}/print`)).replace(/<!-- -->/g, '').replace(/&quot;/g, '"');
}

await run(async () => {
  section('POST: zakład z pełnymi danymi');
  const full = { legalName: 'Zakład Optyczny Jan Testowy', street: 'ul. Lipowa 12', postalCode: '20-001', city: 'Lublin', nip: '9462000000', phone: '+48811234567' };
  const A = await salon('BDA', full);
  for (const [k, v] of Object.entries(full)) check(A.business[k] === v, `zapisane ${k}`, A.business[k]);

  section('PATCH: zmiana, czyszczenie, brak pola = bez zmiany');
  let r = await A.c.req('PATCH', '/api/business', { city: '  Kraków ', nip: '' });
  check(r.status === 200, 'PATCH 200', r);
  check(r.json.business.city === 'Kraków', 'miasto przycięte i zmienione', r.json.business.city);
  check(r.json.business.nip === null, 'pusty NIP → null', r.json.business.nip);
  check(r.json.business.street === 'ul. Lipowa 12', 'ulica bez zmian (brak pola)', r.json.business.street);
  r = await A.c.req('PATCH', '/api/business', { postalCode: '12345678901' });
  check(r.status === 400, 'za długi kod pocztowy → 400', r);
  r = await A.c.req('GET', '/api/business');
  check(r.json.business.legalName === full.legalName && r.json.business.postalCode === '20-001', 'GET zwraca dane zakładu', r.json.business);
  await A.c.req('PATCH', '/api/business', { city: 'Lublin', nip: '9462000000' });

  section('wydruk: pełne dane');
  let html = await printPage(A.c);
  check(html.includes('ul. Lipowa 12, 20-001 Lublin'), 'adres zakładu na wydruku');
  check(html.includes('tel. +48 811 234 567'), 'telefon zakładu na odcinku');
  // Odcinek dla klienta: od tytułu do notki na dole (telefon klienta zostaje tylko w części „zlecenie”).
  const stub = html.slice(html.indexOf('Odcinek dla klienta'), html.indexOf('Prosimy o zachowanie odcinka'));
  check(stub.length > 0 && stub.includes('tel. +48 811 234 567'), 'odcinek: telefon zakładu');
  check(!stub.includes('600 700 800'), 'odcinek: brak telefonu klienta');
  check(html.includes('Administratorem danych osobowych jest Zakład Optyczny Jan Testowy, ul. Lipowa 12, 20-001 Lublin, NIP 9462000000.'), 'RODO: pełny administrator danych');
  check(!html.includes('Uzupełnij dane zakładu'), 'brak ostrzeżenia przy pełnych danych');

  section('wydruk: brak danych zakładu');
  const B = await salon('BDB');
  html = await printPage(B.c);
  check(html.includes('Uzupełnij dane zakładu'), 'ostrzeżenie o brakujących danych');
  check(html.includes('pełna nazwa firmy, ulica, kod pocztowy, miejscowość, telefon'), 'lista brakujących pól');
  check(html.includes('Administratorem danych osobowych jest Optyk BDB.'), 'RODO: nazwa salonu zastępczo');

  section('izolacja: B nie widzi danych A');
  check(sql(`SELECT count(*) FROM businesses WHERE legal_name IS NOT NULL`) === '1', 'tylko A ma pełną nazwę');
  check(!html.includes('Lipowa'), 'wydruk B bez adresu A');
});
