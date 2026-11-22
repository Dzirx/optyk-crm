// Ilość szkieł/soczewek, usługa (montaż) i nowy wydruk zlecenia (A5/C5, odcinek, odwrocie).
import { Client, BASE, PASSWORD, check, section, run, sql } from './lib.mjs';

async function salon(tag) {
  const c = new Client(tag);
  const email = `${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  r = await c.req('GET', '/api/auth/csrf');
  await c.req('POST', '/api/auth/callback/credentials', undefined, { csrfToken: r.json.csrfToken, email, password: PASSWORD, callbackUrl: BASE });
  r = await c.req('POST', '/api/business', {
    name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', phone: '+48811234567',
    legalName: 'Zakład Optyczny Test', street: 'ul. Lipowa 12', postalCode: '20-001', city: 'Lublin',
  });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  return c;
}

const stock = (id) => sql(`SELECT quantity FROM inventory_items WHERE id='${id}'`);
const clean = (html) => html.replace(/<!-- -->/g, '').replace(/&quot;/g, '"');

await run(async () => {
  const A = await salon('QS');
  const inv = (await A.req('POST', '/api/inventory', { name: 'Acuvue Oasys', quantity: 10, price: 120 })).json.item;
  const cust = (await A.req('POST', '/api/customers', { name: 'Ewa', surname: 'Ilość', phone: '+48600700800', smsConsent: false })).json.customer;

  section('POST: ilość × cena, usługa, pobranie z magazynu');
  let r = await A.req('POST', '/api/work-orders', {
    customerId: cust.id, receivedAt: '2026-11-21', deposit: '100',
    items: [
      { type: 'soczewki_kontaktowe', inventoryItemIdOp: inv.id, opLensName: inv.name, opLensPrice: '120', opQty: 2, inventoryItemIdOl: inv.id, olLensName: inv.name, olLensPrice: '120', olQty: '3' },
      { type: 'do_dali', opLensName: 'Hoya', opLensPrice: '250', olLensName: 'Hoya', olLensPrice: '250', frameModel: 'RB2140', framePrice: '400', serviceName: 'Montaż', servicePrice: '50' },
    ],
  });
  check(r.status === 201, 'zlecenie utworzone', r);
  const order = r.json.workOrder;
  check(Number(order.totalAmount) === 1550, 'kwota: 2×120 + 3×120 + 250 + 250 + 400 + 50 = 1550', order.totalAmount);
  const contact = order.items.find((i) => i.type === 'soczewki_kontaktowe');
  const glasses = order.items.find((i) => i.type === 'do_dali');
  check(contact.opQty === 2 && contact.olQty === 3, 'ilości zapisane', contact);
  check(Number(contact.lensPrice) === 600, 'lensPrice = suma z ilością', contact.lensPrice);
  check(glasses.opQty === 1 && glasses.olQty === 1, 'brak ilości = 1');
  check(glasses.serviceName === 'Montaż' && Number(glasses.servicePrice) === 50, 'usługa zapisana', glasses);
  check(stock(inv.id) === '5', 'magazyn: 10 − 2 − 3 = 5', stock(inv.id));

  section('PATCH: zmiana ilości koryguje magazyn');
  const items = order.items.map((i) => (i.id === contact.id ? { ...i, opQty: 1, olQty: 1 } : i));
  r = await A.req('PATCH', `/api/work-orders/${order.id}`, { items, totalAmount: '' });
  check(r.status === 200, 'PATCH 200', r);
  check(stock(inv.id) === '8', 'magazyn po zmniejszeniu ilości: 8', stock(inv.id));
  check(Number(r.json.workOrder.totalAmount) === 1190, 'kwota przeliczona: 1190', r.json.workOrder.totalAmount);

  section('walidacja ilości');
  const bad = async (q) => (await A.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-21', items: [{ type: 'do_dali', opLensPrice: '1', opQty: q }] })).status;
  check(await bad(0) === 400, 'ilość 0 → 400');
  check(await bad(1.5) === 400, 'ilość 1,5 → 400');
  check(await bad(100) === 400, 'ilość 100 → 400');

  section('wydruk A5');
  let html = clean(await A.page(`/work-orders/${order.id}/print`));
  // Wydruk pokazuje stan po PATCH (po 1 sztuce) — tworzymy drugie zlecenie z ilością 2, żeby sprawdzić „2 ×”.
  r = await A.req('POST', '/api/work-orders', { customerId: cust.id, receivedAt: '2026-11-21', items: [{ type: 'soczewki_kontaktowe', opLensName: 'Biofinity', opLensPrice: '120', opQty: 2 }, { type: 'do_dali', serviceName: '', servicePrice: '35' }] });
  const html2 = clean(await A.page(`/work-orders/${r.json.workOrder.id}/print`));
  check(html2.includes('Biofinity (2 × 120,00'), 'ilość na wydruku: „2 × 120,00 zł”');
  check(html2.includes('Usługa: Montaż (35,00'), 'usługa bez nazwy drukowana jako „Montaż”');
  check(html.includes('Usługa: Montaż (50,00'), 'usługa na wydruku');
  check(html.includes('@page { size: 148mm 210mm'), 'format A5 (148 × 210 mm)');
  check(!html.includes('Potwierdzenie odbioru'), 'brak „Potwierdzenia odbioru”');
  check(!/Uwaga: treści/i.test(html), 'brak wiersza „Uwaga: treści…”');
  check(html.includes('Instrukcja użytkowania') && html.includes('Nienoszone okulary należy przechowywać w futerale.'), 'instrukcja użytkowania');
  check(html.includes('gwarancja na okres 24 miesiące od daty odbioru'), 'gwarancja 24 miesiące');
  check(html.includes('wyrobem medycznym'), 'zdanie o wyrobie medycznym');
  check(html.includes('I. Administratorem danych osobowych jest Zakład Optyczny Test, ul. Lipowa 12, 20-001 Lublin.'), 'RODO pkt I');
  check((html.match(/linia cięcia/g) ?? []).length >= 2, 'linia cięcia na obu stronach');

  section('wydruk C5');
  html = clean(await A.page(`/work-orders/${order.id}/print?format=c5`));
  check(html.includes('@page { size: 162mm 229mm'), 'format C5 (162 × 229 mm)');
  html = clean(await A.page(`/work-orders/${order.id}/print?format=xyz`));
  check(html.includes('@page { size: 148mm 210mm'), 'nieznany format → A5');

  section('usunięcie zlecenia zwraca ilość na magazyn');
  r = await A.req('DELETE', `/api/work-orders/${order.id}`);
  check(r.status === 200, 'DELETE 200', r);
  check(stock(inv.id) === '10', 'magazyn wrócił do 10', stock(inv.id));
});
