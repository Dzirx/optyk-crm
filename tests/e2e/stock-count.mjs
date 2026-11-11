// Cena zakupu, inwentaryzacja (spis z natury): reguły zamknięcia, 409, izolacja salonów, wydruk i CSV.
import { Client, BASE, PASSWORD, check, section, run } from './lib.mjs';

async function setupSalon(tag) {
  const c = new Client(tag);
  const email = `sc-${tag.toLowerCase()}-${Date.now()}@test.local`;
  let r = await c.req('POST', '/api/auth/register', { name: `Salon ${tag}`, email, password: PASSWORD });
  if (r.status >= 300) throw new Error(`register ${tag}: ${r.status}`);
  if (!(await c.login(email, PASSWORD))) throw new Error(`login ${tag}`);
  r = await c.req('POST', '/api/business', { name: `Optyk ${tag}`, googleReviewUrl: 'https://g.page/test', phone: '500600700' });
  if (r.status >= 300) throw new Error(`business ${tag}: ${r.status}`);
  return c;
}

const norm = (s) => s.replace(/ |&nbsp;/g, ' ').replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const getRaw = (c, path) => fetch(BASE + path, { headers: { cookie: c.cookie() }, redirect: 'manual' });
const qty = async (c, id) => Number((await c.req('GET', `/api/inventory/${id}`)).json.item.quantity);

await run(async () => {
  const A = await setupSalon('A');
  const B = await setupSalon('B');

  section('cena zakupu');
  let r = await A.req('POST', '/api/inventory', { name: 'Oprawka X', quantity: 10, price: '199,90', purchasePrice: '80,50', category: '  Oprawki  ' });
  check(r.status === 201 && Number(r.json.item.purchasePrice) === 80.5, `create z przecinkiem → ${r.status}`, r.json);
  check(Number(r.json.item.price) === 199.9 && r.json.item.category === 'Oprawki', 'cena sprzedaży i kategoria po trim');
  const frame = r.json.item.id;
  r = await A.req('PATCH', `/api/inventory/${frame}`, { purchasePrice: '90,25' });
  check(r.status === 200 && Number(r.json.item.purchasePrice) === 90.25 && Number(r.json.item.price) === 199.9, 'update purchasePrice z przecinkiem, cena sprzedaży bez zmian', r.json);
  r = await A.req('PATCH', `/api/inventory/${frame}`, { purchasePrice: '' });
  check(r.status === 200 && r.json.item.purchasePrice === null, 'pusta cena zakupu → null');
  r = await A.req('PATCH', `/api/inventory/${frame}`, { purchasePrice: '90,25' });
  r = await A.req('POST', '/api/inventory', { name: 'Zły', quantity: 1, purchasePrice: 'abc' });
  check(r.status === 400, `zła cena zakupu → ${r.status}`, r.json);
  r = await A.req('POST', '/api/inventory', { name: 'Zły', quantity: 1, purchasePrice: '-1' });
  check(r.status === 400, `ujemna cena zakupu → ${r.status}`, r.json);

  section('dane do inwentaryzacji');
  const mk = async (body) => (await A.req('POST', '/api/inventory', body)).json.item.id;
  const lens = await mk({ name: 'Szkło Hoya', quantity: 5, purchasePrice: '100', price: '250', category: 'Szkła' });
  const cheap = await mk({ name: 'Ściereczka', quantity: 20, category: 'Inne' }); // bez ceny
  const skipped = await mk({ name: 'Nieliczony', quantity: 3, purchasePrice: '10' });
  const cust = await A.req('POST', '/api/customers', { name: 'Jan', surname: 'Test', phone: '+48500000000', smsConsent: false });

  section('start');
  r = await A.req('POST', '/api/stock-counts', { countDate: '2026-12-31' });
  check(r.status === 201 && r.json.stockCount.status === 'open', `start → ${r.status}`, r.json);
  const countId = r.json.stockCount.id;
  r = await A.req('POST', '/api/stock-counts', { countDate: '2026-12-31' });
  check(r.status === 409 && /już rozpoczęta/.test(r.json.error), `drugi start → 409 (${r.status})`, r.json);
  r = await A.req('POST', '/api/stock-counts', { countDate: '31.12.2026' });
  check(r.status === 400, `zła data → ${r.status}`, r.json);
  // równoległe starty: dokładnie jeden się uda
  const B2 = await setupSalon('C');
  const race = await Promise.all([1, 2, 3, 4].map(() => B2.req('POST', '/api/stock-counts', { countDate: '2026-12-31' })));
  check(race.filter((x) => x.status === 201).length === 1 && race.filter((x) => x.status === 409).length === 3, `równoległe starty: ${race.map((x) => x.status)}`);

  // towar dodany po starcie pojawia się w spisie
  const late = await mk({ name: 'Dodany po starcie', quantity: 2, purchasePrice: '1' });
  r = await A.req('GET', `/api/stock-counts/${countId}`);
  check(r.status === 200 && r.json.lines.length === 5, `GET dosypuje pozycje (${r.json?.lines?.length}/5)`);
  const line = (name) => r.json.lines.find((l) => l.name === name);
  check(r.json.lines.every((l) => l.countedQty !== null && l.diff === 0), 'wszystkie pozycje pre-wypełnione, różnica 0');
  check(line('Oprawka X').countedQty === 10 && line('Oprawka X').systemQtyAtCount === 10, 'pozycja z startu: policzone = stan = 10');
  check(line('Dodany po starcie').countedQty === 2 && line('Dodany po starcie').diff === 0, 'towar dodany po starcie pre-wypełniony (2)');
  check(r.json.summary.linesWithDiff === 0, 'podsumowanie: 0 pozycji z różnicą');
  const L = { frame: line('Oprawka X').id, lens: line('Szkło Hoya').id, cheap: line('Ściereczka').id, skipped: line('Nieliczony').id, late: line('Dodany po starcie').id };

  section('liczenie');
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.frame}`, { countedQty: 8 });
  check(r.status === 200 && r.json.line.countedQty === 8 && r.json.line.systemQtyAtCount === 10, 'zapis liczenia: policzone 8, stan 10', r.json);
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.frame}`, { countedQty: -1 });
  check(r.status === 400, `ujemna ilość → ${r.status}`, r.json);
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.frame}`, { countedQty: 1.5 });
  check(r.status === 400, `ułamek → ${r.status}`, r.json);
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.frame}`, {});
  check(r.status === 400, `brak pola → ${r.status}`, r.json);
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.frame}`, { countedQty: 1000001 });
  check(r.status === 400, `ilość 1000001 → ${r.status}`, r.json);
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/nie-uuid`, { countedQty: 1 });
  check(r.status === 404, `zły lineId → ${r.status}`);

  // sprzedaż po policzeniu: zlecenie pobiera 1 szt. oprawki
  r = await A.req('POST', '/api/work-orders', { customerId: cust.json.customer.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', framePrice: '100', inventoryItemIdFrame: frame }] });
  check(r.status === 201, `zlecenie pobiera oprawkę → ${r.status}`, r.json);
  check((await qty(A, frame)) === 9, 'stan oprawki po sprzedaży: 9');

  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.lens}`, { countedQty: '7' });
  check(r.status === 200 && r.json.line.countedQty === 7, 'zapis liczenia z tekstu');
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.cheap}`, { countedQty: 20 });
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.late}`, { countedQty: 5 });
  check(r.status === 200 && r.json.line.countedQty === 5, 'zmiana pozycji na 5');
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.late}`, { countedQty: null });
  check(r.status === 200 && r.json.line.countedQty === 2 && r.json.line.systemQtyAtCount === 2, 'wyczyszczenie → stan z programu (2)', r.json);
  r = await A.req('GET', `/api/stock-counts/${countId}`);
  check(r.json.lines.find((l) => l.id === L.late).diff === 0, 'po wyczyszczeniu różnica 0');
  check(r.json.summary.linesWithDiff === 2 && r.json.lines.find((l) => l.id === L.cheap).diff === 0, 'pozycje z różnicą: oprawka i szkło (2)', r.json.summary);

  section('wydruk i CSV (otwarty spis)');
  let res = await getRaw(A, `/api/stock-counts/${countId}/export`);
  let csv = Buffer.from(await res.arrayBuffer());
  check(res.status === 200 && csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf, 'CSV zaczyna się od BOM UTF-8');
  const csvText = csv.toString('utf8');
  check(csvText.split('\r\n')[0] === '﻿Lp.;Nazwa;Kategoria;J.m.;Powinno być;Jest na półce;Brak (-) / nadwyżka (+);Cena jedn.;Wartość', 'nagłówek CSV', csvText.split('\r\n')[0]);
  check(csvText.includes('Oprawka X;Oprawki;szt.;10;8;-2;90,25;722,00'), 'wiersz oprawki w CSV', csvText);
  res = await getRaw(A, `/api/stock-counts/${countId}/print`.replace('/api/stock-counts', '/inventory/stock-counts'));
  let html = norm(await res.text());
  check(res.status === 200, `wydruk otwartego spisu → ${res.status}`);
  check(html.includes('Arkusz spisu z natury') && html.includes('PROJEKT'), 'wydruk: tytuł i PROJEKT');
  check(html.includes('Data spisu: 31.12.2026'), 'wydruk: data spisu');
  // zakup: 8*90,25 + 7*100 + 3*10 (Nieliczony) + 2*1 (late) = 722 + 700 + 30 + 2 = 1 454,00; ściereczka bez ceny
  check(html.includes('Razem 1 454,00 zł'), 'wydruk: suma wg ceny zakupu 1 454,00 zł', html.slice(-600));
  check(html.includes('1 pozycja bez ceny — nie wliczono do sumy'), 'wydruk: notka o pozycji bez ceny');
  check(html.includes('Osoby spisujące') && html.includes('Osoba materialnie odpowiedzialna') && html.includes('Data i podpis'), 'wydruk: linie podpisów');
  check(html.includes('Nieliczony'), 'wydruk: pozycje bez zmian też są na arkuszu');
  check(/Spis przeprowadzono: od \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}, w toku/.test(html), 'wydruk otwartego: „od …, w toku”');
  check(html.indexOf('Nieliczony') < html.indexOf('Oprawka X') && html.indexOf('Oprawka X') < html.indexOf('Szkło Hoya'), 'wydruk: pozycje wg nazwy (pl)');
  res = await getRaw(A, `/inventory/stock-counts/${countId}/print?price=sale`);
  html = norm(await res.text());
  check(html.includes('1 599,20 zł'), 'wydruk wg ceny sprzedaży: oprawka 8 × 199,90', html.slice(-500));

  section('zmiany magazynu w trakcie spisu');
  r = await A.req('PATCH', `/api/inventory/${cheap}`, { quantity: 99 });
  check(r.status === 409 && r.json.error === 'Trwa inwentaryzacja. Zmień ilość w inwentaryzacji albo ją zakończ.', `ręczna zmiana ilości → ${r.status}`, r.json);
  check((await qty(A, cheap)) === 20, 'ilość nietknięta po odrzuceniu');
  r = await A.req('PATCH', `/api/inventory/${cheap}`, { name: 'Ściereczka 2', quantity: 20 });
  check(r.status === 200 && r.json.item.name === 'Ściereczka 2', `zmiana nazwy (ilość bez zmian) → ${r.status}`, r.json);
  r = await A.req('PATCH', `/api/inventory/${cheap}`, { name: 'Ściereczka' });
  check(r.status === 200, 'zmiana nazwy → 200');

  section('izolacja salonów (404)');
  const other = [
    ['GET', `/api/stock-counts/${countId}`],
    ['DELETE', `/api/stock-counts/${countId}`],
    ['POST', `/api/stock-counts/${countId}/close`],
    ['GET', `/api/stock-counts/${countId}/export`],
  ];
  for (const [m, p] of other) {
    r = await B.req(m, p);
    check(r.status === 404, `${m} ${p.replace(countId, ':id')} z innego salonu → ${r.status}`, r.json);
  }
  r = await B.req('PATCH', `/api/stock-counts/${countId}/lines/${L.lens}`, { countedQty: 0 });
  check(r.status === 404, `PATCH liczenia z innego salonu → ${r.status}`);
  res = await getRaw(B, `/inventory/stock-counts/${countId}/print`);
  check(res.status === 404, `wydruk z innego salonu → ${res.status}`);
  r = await B.req('GET', '/api/stock-counts');
  check(r.status === 200 && r.json.stockCounts.length === 0, 'lista salonu B pusta');
  check((await qty(A, lens)) === 5, 'stany A nietknięte przez ataki');

  section('zakończenie');
  r = await A.req('GET', '/api/stock-counts');
  const row = r.json.stockCounts[0];
  check(row.totalLines === 5 && row.linesWithDiff === 2 && row.totalValueCents === 8 * 9025 + 7 * 10000 + 3 * 1000 + 2 * 100, 'lista: 2 pozycje z różnicą, wartość', row);
  r = await A.req('POST', `/api/stock-counts/${countId}/close`);
  check(r.status === 200 && r.json.stockCount.status === 'closed', `close → ${r.status}`, r.json);
  check((await qty(A, frame)) === 7, 'oprawka: policzone 8 − sprzedaż 1 = 7 (nie 8, nie 9)');
  check((await qty(A, lens)) === 7, 'szkło: 7');
  check((await qty(A, cheap)) === 20, 'ściereczka: 20');
  check((await qty(A, skipped)) === 3, 'pozycja bez zmian (3)');
  check((await qty(A, late)) === 2, 'wyczyszczona pozycja bez zmian (2)');
  r = await A.req('GET', `/api/stock-counts/${countId}`);
  const f = r.json.lines.find((l) => l.name === 'Oprawka X');
  check(r.json.stockCount.status === 'closed' && f.diff === -2 && f.appliedDiff === -2 && f.countedQty === 7 && f.systemQty === 9,
    'zamknięty spis: arkusz = stan po zamknięciu (7), powinno być 9, różnica −2', f);
  res = await getRaw(A, `/api/stock-counts/${countId}/export`);
  csv = Buffer.from(await res.arrayBuffer()).toString('utf8');
  check(csv.includes('Oprawka X;Oprawki;szt.;9;7;-2;90,25;631,75'), 'CSV zamkniętego spisu: ilość = stan po zamknięciu (7)', csv);
  check(r.json.lines.find((l) => l.name === 'Nieliczony').appliedDiff === 0, 'pozycja bez zmian: appliedDiff 0');

  section('spis zamknięty jest tylko do odczytu');
  r = await A.req('PATCH', `/api/stock-counts/${countId}/lines/${L.lens}`, { countedQty: 1 });
  check(r.status === 409, `zapis liczenia → ${r.status}`, r.json);
  r = await A.req('POST', `/api/stock-counts/${countId}/close`);
  check(r.status === 409, `drugie zamknięcie → ${r.status}`, r.json);
  r = await A.req('DELETE', `/api/stock-counts/${countId}`);
  check(r.status === 409, `usunięcie zamkniętego → ${r.status}`, r.json);
  check((await qty(A, lens)) === 7, 'stan szkła po odrzuconych zapisach bez zmian');
  res = await getRaw(A, `/inventory/stock-counts/${countId}/print`);
  html = norm(await res.text());
  check(res.status === 200 && !html.includes('PROJEKT') && html.includes('Razem 1 363,75 zł'), 'wydruk zamkniętego: bez PROJEKT, suma 1 363,75 zł (stan po zamknięciu)', html.slice(-500));
  check(/Spis przeprowadzono: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} – \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/.test(html), 'wydruk: czas przeprowadzenia spisu');
  check(html.includes('Spis zakończono na pozycji nr 5.'), 'wydruk: spis zakończono na pozycji nr 5', html.slice(-600));

  section('zamknięcie bez zmian, sprzedaż w trakcie');
  r = await A.req('POST', '/api/stock-counts', { countDate: '2027-06-30' });
  const idZero = r.json.stockCount.id;
  const before = { frame: await qty(A, frame), lens: await qty(A, lens), cheap: await qty(A, cheap), late: await qty(A, late) };
  r = await A.req('GET', `/api/stock-counts/${idZero}`);
  check(r.json.lines.length === 5 && r.json.summary.linesWithDiff === 0, 'nowy spis: 5 pozycji, 0 różnic');
  // sprzedaż w trakcie liczenia bez ruszania pozycji: stan ma zostać po sprzedaży
  r = await A.req('POST', '/api/work-orders', { customerId: cust.json.customer.id, receivedAt: '2026-11-09', items: [{ type: 'do_dali', framePrice: '100', inventoryItemIdFrame: frame }] });
  check(r.status === 201 && (await qty(A, frame)) === before.frame - 1, 'sprzedaż w trakcie spisu');
  r = await A.req('GET', `/api/stock-counts/${idZero}`);
  const frameLineOpen = r.json.lines.find((l) => l.inventoryItemId === frame);
  check(frameLineOpen.countedQty === before.frame - 1 && frameLineOpen.systemQty === before.frame - 1 && frameLineOpen.diff === 0,
    'nieruszona pozycja idzie za sprzedażą (jest na półce = powinno być)', frameLineOpen);
  r = await A.req('POST', `/api/stock-counts/${idZero}/close`);
  check(r.status === 200, `close bez zmian → ${r.status}`, r.json);
  check((await qty(A, frame)) === before.frame - 1, 'sprzedaż zachowana po zamknięciu');
  r = await A.req('GET', `/api/stock-counts/${idZero}`);
  const frameLineClosed = r.json.lines.find((l) => l.inventoryItemId === frame);
  check(frameLineClosed.countedQty === before.frame - 1, 'zamknięty spis (arkusz) ma ilość po sprzedaży', frameLineClosed);
  check((await qty(A, lens)) === before.lens && (await qty(A, cheap)) === before.cheap && (await qty(A, late)) === before.late, 'zamknięcie bez zmian: stany identyczne');

  section('nowy spis po zamknięciu i anulowanie');
  r = await A.req('POST', '/api/stock-counts', { countDate: '2027-12-31' });
  check(r.status === 201, `nowy start po zamknięciu → ${r.status}`, r.json);
  const id2 = r.json.stockCount.id;
  r = await A.req('DELETE', `/api/stock-counts/${id2}`);
  check(r.status === 200, `anulowanie otwartego → ${r.status}`, r.json);
  r = await A.req('GET', `/api/stock-counts/${id2}`);
  check(r.status === 404, 'anulowany spis nie istnieje');

  // ---------------------------------------------------------------------------
  section('towar usunięty w trakcie spisu, stan ujemny, zlecenie w trakcie spisu');
  const D = await setupSalon('D');
  const mkD = async (body) => (await D.req('POST', '/api/inventory', body)).json.item.id;
  const sold = await mkD({ name: 'Sprzedawany', quantity: 10, purchasePrice: '10' });
  const doomed = await mkD({ name: 'Do usunięcia', quantity: 4, purchasePrice: '10' });
  const keep = await mkD({ name: 'Zostaje', quantity: 5, purchasePrice: '10' });
  const back0 = await mkD({ name: 'Zamówiony zero', quantity: 0, purchasePrice: '10' });
  const back1 = await mkD({ name: 'Zamówiony jeden', quantity: 0, purchasePrice: '10' });
  const custD = await D.req('POST', '/api/customers', { name: 'Ewa', surname: 'Test', phone: '+48500000001', smsConsent: false });
  const orderD = (frameId, ordered, date) => D.req('POST', '/api/work-orders', {
    customerId: custD.json.customer.id,
    receivedAt: date,
    items: [{ type: 'do_dali', framePrice: '100', inventoryItemIdFrame: frameId, frameOrdered: ordered }],
  });
  // dwie sztuki zamówione u dostawcy → stan −2 (dwa zlecenia po 1 szt.)
  for (const id of [back0, back1]) {
    for (let i = 0; i < 2; i++) {
      r = await orderD(id, true, '2026-11-01');
      check(r.status === 201, `zlecenie „do zamówienia” → ${r.status}`, r.json);
    }
  }
  check((await qty(D, back0)) === -2 && (await qty(D, back1)) === -2, 'stan ujemny −2 (zamówione u dostawcy)');
  r = await D.req('POST', '/api/stock-counts', { countDate: '2026-12-31' });
  const cD = r.json.stockCount.id;
  r = await D.req('GET', `/api/stock-counts/${cD}`);
  const lineD = (name) => r.json.lines.find((l) => l.name === name);
  check(r.json.lines.length === 5, 'start: 5 pozycji', r.json.lines.length);
  check(lineD('Zamówiony zero').countedQty === 0 && lineD('Zamówiony zero').systemQty === 0 && lineD('Zamówiony zero').diff === 0, 'stan −2: na półce 0, różnica 0', lineD('Zamówiony zero'));
  const LD = { sold: lineD('Sprzedawany').id, doomed: lineD('Do usunięcia').id, back1: lineD('Zamówiony jeden').id };
  // „Zamówiony jeden”: znaleziono 1 sztukę (półka 0 → 1) → stan −1
  r = await D.req('PATCH', `/api/stock-counts/${cD}/lines/${LD.back1}`, { countedQty: 1 });
  check(r.status === 200 && r.json.line.countedQty === 1 && r.json.line.systemQtyAtCount === 0, 'stan −2, wpisano 1: powinno być 0 (nie −2)', r.json);
  r = await D.req('PATCH', `/api/stock-counts/${cD}/lines/${LD.back1}`, { countedQty: null });
  check(r.json.line.countedQty === 0 && r.json.line.systemQtyAtCount === 0, 'przywrócenie przy stanie −2 → 0', r.json);
  r = await D.req('PATCH', `/api/stock-counts/${cD}/lines/${LD.back1}`, { countedQty: 1 });
  // wpisano 8 dla „Sprzedawany”, potem sprzedaż 1 szt. w trakcie spisu (zlecenie przechodzi)
  r = await D.req('PATCH', `/api/stock-counts/${cD}/lines/${LD.sold}`, { countedQty: 8 });
  r = await orderD(sold, false, '2026-11-10');
  check(r.status === 201 && (await qty(D, sold)) === 9, `zlecenie w trakcie spisu → ${r.status}, stan 9`, r.json);
  // usunięcie towaru w trakcie spisu
  r = await D.req('DELETE', `/api/inventory/${doomed}`);
  check(r.status === 200, `usunięcie towaru w trakcie spisu → ${r.status}`, r.json);
  // nowy towar w trakcie spisu: dozwolony, trafia do spisu
  const fresh = await mkD({ name: 'Nowy w trakcie', quantity: 3, purchasePrice: '10' });
  r = await D.req('GET', `/api/stock-counts/${cD}`);
  check(!r.json.lines.some((l) => l.name === 'Do usunięcia') && r.json.lines.length === 5, 'usunięty towar zniknął ze spisu, nowy jest (5 pozycji)', r.json.lines.map((l) => l.name));
  check(r.json.lines.some((l) => l.inventoryItemId === fresh), 'nowy towar jest pozycją spisu');
  res = await getRaw(D, `/inventory/stock-counts/${cD}/print`);
  html = norm(await res.text());
  // zakup: Sprzedawany 8×10 + Zostaje 5×10 + Zamówiony jeden 1×10 + Nowy 3×10 = 170 (zero: pominięte, usunięty: brak)
  check(html.includes('Razem 170,00 zł') && !html.includes('Do usunięcia'), 'wydruk: bez usuniętego towaru, suma 170,00 zł', html.slice(-500));
  check(html.includes('Spis zakończono na pozycji nr 4.'), 'wydruk: 4 pozycje z ilością');
  res = await getRaw(D, `/api/stock-counts/${cD}/export`);
  csv = Buffer.from(await res.arrayBuffer()).toString('utf8');
  check(!csv.includes('Do usunięcia'), 'CSV: bez usuniętego towaru');
  const dataRows = csv.split('\r\n').slice(1).filter(Boolean).map((l) => l.split(';'));
  check(dataRows.every((c) => Number(c[4]) >= 0 && Number(c[5]) >= 0), 'CSV: ilości nigdy ujemne', csv);
  r = await D.req('POST', `/api/stock-counts/${cD}/close`);
  check(r.status === 200, `close → ${r.status}`, r.json);
  check((await qty(D, sold)) === 7, 'Sprzedawany: policzone 8 − sprzedaż 1 = 7');
  check((await qty(D, back0)) === -2, 'backorder bez zmian po zamknięciu: −2');
  check((await qty(D, back1)) === -1, 'backorder −2 i znaleziona 1 szt. → −1');
  check((await qty(D, keep)) === 5, 'Zostaje: 5');
  r = await D.req('GET', `/api/stock-counts/${cD}`);
  const sd = r.json.lines.find((l) => l.name === 'Sprzedawany');
  check(sd.countedQty === 7 && sd.systemQty === 9 && sd.diff === -2, 'zamknięty: Sprzedawany arkusz 7 (stan po zamknięciu)', sd);
  check(r.json.lines.every((l) => l.countedQty >= 0), 'zamknięty: żadnej ujemnej ilości w arkuszu');
  res = await getRaw(D, `/inventory/stock-counts/${cD}/print`);
  html = norm(await res.text());
  // 7×10 + 5×10 + 3×10 + 1×10 (zamówiony, ale 1 szt. znaleziona na półce) = 160; „Zamówiony zero”: arkusz 0
  const bj = r.json.lines.find((l) => l.name === 'Zamówiony jeden');
  check(bj.countedQty === 1 && bj.systemQty === 0 && bj.diff === 1, 'zamknięty: zamówiony z 1 szt. na półce → arkusz 1, powinno być 0', bj);
  check(html.includes('Razem 160,00 zł') && !html.includes('PROJEKT'), 'wydruk po zamknięciu: suma 160,00 zł, bez ujemnych', html.slice(-500));
  res = await getRaw(D, `/api/stock-counts/${cD}/export`);
  csv = Buffer.from(await res.arrayBuffer()).toString('utf8');
  check(csv.includes('Sprzedawany;;szt.;9;7;-2;10,00;70,00'), 'CSV po zamknięciu: ilość 7', csv);
  // po zamknięciu ręczna zmiana ilości znów jest dozwolona
  r = await D.req('PATCH', `/api/inventory/${keep}`, { quantity: 6 });
  check(r.status === 200 && (await qty(D, keep)) === 6, `po zamknięciu zmiana ilości → ${r.status}`);

  section('otwarty spis: edycja ceny, usunięcie klienta, nowy towar');
  const E = await setupSalon('E');
  let rE = await E.req('POST', '/api/inventory', { name: 'Oprawka E', quantity: 10, price: '100' });
  const itE = rE.json.item.id;
  const custE = await E.req('POST', '/api/customers', { name: 'Ola', surname: 'Test', phone: '+48500000002', smsConsent: false });
  rE = await E.req('POST', '/api/work-orders', { customerId: custE.json.customer.id, receivedAt: '2026-11-08', items: [{ type: 'do_dali', framePrice: '100', inventoryItemIdFrame: itE }] });
  check(rE.status === 201 && (await qty(E, itE)) === 9, `zlecenie przed spisem → ${rE.status}, stan 9`, rE.json);
  rE = await E.req('POST', '/api/stock-counts', { countDate: '2026-12-31' });
  const cE = rE.json.stockCount.id;
  rE = await E.req('PATCH', `/api/inventory/${itE}`, { price: '120', quantity: 9 });
  check(rE.status === 200 && Number(rE.json.item.price) === 120 && (await qty(E, itE)) === 9, `sama cena przy tej samej ilości → ${rE.status}`, rE.json);
  rE = await E.req('PATCH', `/api/inventory/${itE}`, { quantity: 4 });
  check(rE.status === 409 && (await qty(E, itE)) === 9, `zmiana ilości przy otwartym spisie → ${rE.status}`, rE.json);
  rE = await E.req('POST', '/api/inventory', { name: 'Nowy w spisie', quantity: 3 });
  check(rE.status === 201, `create przy otwartym spisie → ${rE.status}`, rE.json);
  const newE = rE.json.item.id;
  rE = await E.req('GET', `/api/stock-counts/${cE}`);
  check(rE.json.lines.some((l) => l.inventoryItemId === newE), 'nowy towar ma linię w otwartym spisie');
  // usunięcie towaru w otwartym spisie: pozycja zostaje w spisie (bez towaru), drugi DELETE towaru → 404
  rE = await E.req('GET', `/api/stock-counts/${cE}`);
  const delLine = rE.json.lines.find((l) => l.inventoryItemId === newE).id;
  rE = await E.req('DELETE', `/api/inventory/${newE}`);
  check(rE.status === 200, `usunięcie towaru przy otwartym spisie → ${rE.status}`, rE.json);
  rE = await E.req('PATCH', `/api/stock-counts/${cE}/lines/${delLine}`, { countedQty: 1 });
  check(rE.status === 200 && rE.json.line.countedQty === 1, `PATCH linii usuniętego towaru (pozycja zostaje) → ${rE.status}`, rE.json);
  rE = await E.req('DELETE', `/api/inventory/${newE}`);
  check(rE.status === 404, `ponowne usunięcie towaru → ${rE.status}`, rE.json);
  rE = await E.req('DELETE', `/api/customers/${custE.json.customer.id}`);
  check(rE.status === 200 && (await qty(E, itE)) === 10, `usunięcie klienta przy otwartym spisie → ${rE.status}, stan wrócił do 10`, rE.json);
  // anulowany spis: PATCH jego linii → 404 (strona pokazuje komunikat i odświeża)
  rE = await E.req('DELETE', `/api/stock-counts/${cE}`);
  check(rE.status === 200, `anulowanie spisu → ${rE.status}`, rE.json);
  rE = await E.req('PATCH', `/api/stock-counts/${cE}/lines/${delLine}`, { countedQty: 2 });
  check(rE.status === 404, `PATCH linii anulowanego spisu → ${rE.status}`, rE.json);
});
