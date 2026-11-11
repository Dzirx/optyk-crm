import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTouched, closedSheetQty, countDiff, countMoment, correctionMoment, endOfCountDay, shelf, summarize, valueCents, parsePriceBasis } from '../../lib/stock-count/math';
import { formatMoneyCents, formatMoney, csvMoney, toCsv } from '../../lib/stock-count/format';
import { parseCountDate } from '../../lib/api/schemas/stock-counts';
import { yearEndDate, endOfZonedDay } from '../../lib/time';

test('countDiff: stary spis bez danych = null', () => {
  assert.equal(countDiff({ countedQty: null, systemQtyAtCount: null }), null);
  assert.equal(countDiff({ countedQty: 7, systemQtyAtCount: 10 }), -3);
});

test('summarize: różnice, wartość, zmiana wartości, brak ceny', () => {
  const s = summarize([
    { countedQty: 7, systemQtyAtCount: 10, price: 10.5 }, // -3
    { countedQty: 12, systemQtyAtCount: 10, price: 2 }, // +2
    { countedQty: 5, systemQtyAtCount: 5, price: null }, // 0, bez ceny
    { countedQty: 0, systemQtyAtCount: 4, price: null }, // -4, ilość 0: bez wpływu na wartość
    { countedQty: 3, systemQtyAtCount: 3, price: 9 }, // zgadza się
  ]);
  assert.equal(s.totalLines, 5);
  assert.equal(s.linesWithDiff, 3);
  assert.equal(s.shortageUnits, 7);
  assert.equal(s.surplusUnits, 2);
  assert.equal(s.diffValueCents, -3 * 1050 + 2 * 200);
  assert.equal(s.valueCents, 7 * 1050 + 12 * 200 + 3 * 900);
  assert.equal(s.pricelessLines, 1);
});

test('summarize: wszystkie pozycje pre-wypełnione = zero różnic', () => {
  const s = summarize([
    { countedQty: 4, systemQtyAtCount: 4, price: 5 },
    { countedQty: 0, systemQtyAtCount: 0, price: null },
  ]);
  assert.equal(s.linesWithDiff, 0);
  assert.equal(s.shortageUnits + s.surplusUnits + s.diffValueCents, 0);
});

test('valueCents: bez błędów zmiennoprzecinkowych', () => {
  assert.equal(valueCents(3, 0.1), 30);
  assert.equal(valueCents(3, 19.99), 5997);
  assert.equal(valueCents(2, null), null);
});

test('parsePriceBasis: domyślnie zakup', () => {
  assert.equal(parsePriceBasis(undefined), 'purchase');
  assert.equal(parsePriceBasis('x'), 'purchase');
  assert.equal(parsePriceBasis('sale'), 'sale');
});

test('formatowanie kwot po polsku', () => {
  assert.equal(formatMoneyCents(123450), '1 234,50 zł');
  assert.equal(formatMoneyCents(5), '0,05 zł');
  assert.equal(formatMoney(12345678.9), '12 345 678,90 zł');
  assert.equal(csvMoney(123450), '1234,50');
});

test('CSV: BOM, średniki, cudzysłowy i ochrona przed formułami', () => {
  const csv = toCsv([['a', 'b;c', 'd"e'], ['=1+1', '-5', 'zwykły']]);
  assert.ok(csv.startsWith('﻿a;'));
  assert.equal(csv, '﻿a;"b;c";"d""e"\r\n\'=1+1;-5;zwykły\r\n');
});

test('data inwentaryzacji: poprawna i błędna', () => {
  assert.equal(parseCountDate('2026-12-31')?.toISOString(), '2026-12-31T00:00:00.000Z');
  assert.equal(parseCountDate('2026-02-30'), null);
  assert.equal(parseCountDate('31.12.2026'), null);
  assert.equal(parseCountDate('1999-01-01'), null);
});

test('domyślna data: 31 grudnia roku w Polsce, w styczniu poprzedniego roku', () => {
  assert.equal(yearEndDate(new Date('2026-11-09T10:00:00Z')), '2026-12-31');
  assert.equal(yearEndDate(new Date('2026-06-15T10:00:00Z')), '2026-12-31');
  assert.equal(yearEndDate(new Date('2026-12-31T10:00:00Z')), '2026-12-31');
  assert.equal(yearEndDate(new Date('2026-12-31T23:30:00Z')), '2026-12-31'); // 1 stycznia 2027 w Polsce → poprzedni rok
  assert.equal(yearEndDate(new Date('2027-01-15T10:00:00Z')), '2026-12-31');
  assert.equal(yearEndDate(new Date('2027-01-31T23:30:00Z')), '2027-12-31'); // już 1 lutego w Polsce
});

test('shelf: ujemny stan (zamówione u dostawcy) = 0 na półce', () => {
  assert.equal(shelf(-2), 0);
  assert.equal(shelf(0), 0);
  assert.equal(shelf(7), 7);
});

test('closedSheetQty: arkusz = stan po zamknięciu, „powinno być” = ilość − różnica', () => {
  // policzone 8 z 10, sprzedaż 1 (stan teraz 9) → stan 7
  assert.deepEqual(closedSheetQty(9, -2), { countedQty: 7, systemQtyAtCount: 9 });
  assert.deepEqual(closedSheetQty(5, 0), { countedQty: 5, systemQtyAtCount: 5 });
  // backorder: stan −2, bez różnicy → arkusz 0
  assert.deepEqual(closedSheetQty(-2, 0), { countedQty: 0, systemQtyAtCount: 0 });
  assert.equal(closedSheetQty(-2, 0).countedQty - closedSheetQty(-2, 0).systemQtyAtCount, 0);
  // backorder: stan −2, na półce znaleziono 1 → arkusz 1 („powinno być” 0, nadwyżka 1), magazyn −1
  assert.deepEqual(closedSheetQty(-2, 1), { countedQty: 1, systemQtyAtCount: 0 });
});

import { applyResponse, edit, initialEdit, isBlocking, reconcile, requestRestore, requestSave, shouldFlush, validateCountText, MSG_INVALID, MSG_MAX } from '../../lib/stock-count/save-queue';
import { MAX_COUNT_QTY, setLineCountSchema } from '../../lib/api/schemas/stock-counts';

test('save-queue: zapis wysyła numerowane żądanie, odpowiedź przyjmuje wartość serwera', () => {
  const s = edit(initialEdit(null), '5');
  const step = requestSave(s);
  assert.equal(step.send?.seq, 1);
  assert.equal(step.send?.countedQty, 5);
  const r = applyResponse(step.state, 1, { ok: true, countedQty: 5 });
  assert.equal(r.applied, true);
  assert.equal(r.state.status, 'saved');
  assert.equal(r.state.serverText, '5');
  assert.equal(isBlocking(r.state), false);
});

test('save-queue: zmiana w trakcie zapisu kolejkuje dokładnie jeden zapis następczy z najnowszym tekstem', () => {
  let s = requestSave(edit(initialEdit(null), '1')).state;
  s = edit(s, '12');
  let step = requestSave(s);
  assert.equal(step.send, null);
  s = edit(step.state, '123');
  step = requestSave(s);
  assert.equal(step.send, null);
  const r = applyResponse(step.state, 1, { ok: true, countedQty: 1 });
  assert.equal(r.send?.seq, 2);
  assert.equal(r.send?.countedQty, 123);
  assert.equal(r.state.text, '123'); // tekst użytkownika nie został nadpisany
  assert.equal(r.state.queued, null);
});

test('save-queue: odpowiedź starsza niż ostatnie żądanie jest ignorowana', () => {
  const first = requestSave(edit(initialEdit(null), '1'));
  const afterFirst = applyResponse(first.state, 1, { ok: true, countedQty: 1 });
  const second = requestSave(edit(afterFirst.state, '2'));
  const stale = applyResponse(second.state, 1, { ok: true, countedQty: 1 });
  assert.equal(stale.applied, false);
  assert.deepEqual(stale.state, second.state);
  const fresh = applyResponse(second.state, 2, { ok: true, countedQty: 2 });
  assert.equal(fresh.state.serverText, '2');
});

test('save-queue: tekst zmieniony po wysłaniu nie jest nadpisany, gdy odpowiedź nie ma zapisu następczego', () => {
  const s = requestSave(edit(initialEdit(null), '7')).state;
  const typed = edit(s, '78');
  const r = applyResponse({ ...typed, queued: null }, 1, { ok: true, countedQty: 7 });
  assert.equal(r.state.text, '78');
  assert.equal(isBlocking(r.state), true);
});

test('save-queue: błąd zostaje w stanie i blokuje; zapis następczy mimo to leci', () => {
  const s = requestSave(edit(initialEdit(null), '5')).state;
  const err = applyResponse(s, 1, { ok: false, message: 'Błąd' });
  assert.equal(err.state.status, 'error');
  assert.equal(err.state.message, 'Błąd');
  assert.equal(isBlocking(err.state), true);
  const queued = applyResponse(requestSave(edit(s, '6')).state, 1, { ok: false, message: 'Błąd' });
  assert.equal(queued.send?.countedQty, 6);
});

test('save-queue: nieprawidłowy tekst daje błąd bez żądania', () => {
  const step = requestSave(edit(initialEdit(null), 'abc'));
  assert.equal(step.send, null);
  assert.equal(step.state.status, 'error');
});

test('save-queue: przywróć wysyła null, a po odpowiedzi pokazuje wartość serwera', () => {
  const s = edit(initialEdit(3), '9');
  const step = requestRestore(s);
  assert.equal(step.send?.countedQty, null);
  assert.equal(step.send?.kind, 'restore');
  const r = applyResponse(step.state, 1, { ok: true, countedQty: 10 });
  assert.equal(r.state.text, '10');
  assert.equal(r.state.serverText, '10');
});

test('save-queue: przywróć w trakcie zapisu idzie do kolejki, a wpisanie czegoś po nim zastępuje je zapisem tekstu', () => {
  const s = requestSave(edit(initialEdit(null), '4')).state;
  const step = requestRestore(s);
  assert.equal(step.send, null);
  assert.equal(step.state.queued, 'restore');
  const r = applyResponse(step.state, 1, { ok: true, countedQty: 4 });
  assert.equal(r.send?.kind, 'restore');
  assert.equal(r.send?.countedQty, null);
  const typed = edit(step.state, '8');
  assert.equal(typed.queued, 'text');
});

test('save-queue: tekst w połowie wpisany (2, 5. 1e -) to błąd, a nie przywrócenie; nic nie leci', () => {
  for (const text of ['2,', '5.', '1e', '-', '1 2', '-3', 'abc']) {
    const step = requestSave(edit(initialEdit(4), text));
    assert.equal(step.send, null, text);
    assert.equal(step.state.status, 'error', text);
    assert.equal(step.state.message, MSG_INVALID, text);
    assert.equal(step.state.text, text, text); // tekst użytkownika zostaje
    assert.equal(isBlocking(step.state), true);
  }
  // tylko puste pole przywraca (wysyła null)
  const empty = requestSave(edit(initialEdit(4), '  '));
  assert.equal(empty.send?.countedQty, null);
});

test('save-queue: limit ilości zgodny z serwerem', () => {
  assert.equal(MAX_COUNT_QTY, 1_000_000);
  assert.equal(validateCountText('1000000'), null);
  assert.equal(validateCountText('1000001'), MSG_MAX);
  assert.equal(validateCountText('99999999999999999999'), MSG_MAX);
  assert.equal(requestSave(edit(initialEdit(null), '1000001')).send, null);
  assert.equal(requestSave(edit(initialEdit(null), '1000000')).send?.countedQty, 1_000_000);
  assert.equal(setLineCountSchema.safeParse({ countedQty: 1_000_000 }).success, true);
  assert.equal(setLineCountSchema.safeParse({ countedQty: 1_000_001 }).success, false);
});

test('save-queue: zapis następczy z błędnym tekstem daje błąd z komunikatem', () => {
  const s = requestSave(edit(initialEdit(null), '1')).state;
  const typed = edit(s, '1,');
  const r = applyResponse(requestSave(typed).state, 1, { ok: true, countedQty: 1 });
  assert.equal(r.send, null);
  assert.equal(r.state.status, 'error');
  assert.equal(r.state.message, MSG_INVALID);
});

test('save-queue: flush ponawia poprawny tekst w błędzie, ale nie błędny ani zajęty', () => {
  const failed = applyResponse(requestSave(edit(initialEdit(null), '5')).state, 1, { ok: false, message: 'sieć' }).state;
  assert.equal(failed.status, 'error');
  assert.equal(shouldFlush(failed), true);
  const retry = requestSave(failed);
  assert.equal(retry.send?.countedQty, 5);
  assert.equal(shouldFlush(retry.state), false); // w locie
  assert.equal(shouldFlush(requestSave(edit(initialEdit(null), 'x')).state), false); // błędny tekst
  assert.equal(shouldFlush(edit(initialEdit(null), '3')), true); // niezapisany tekst
  assert.equal(shouldFlush(initialEdit(3)), false);
});

test('save-queue: reconcile aktualizuje wartość serwera i tekst, o ile użytkownik go nie zmienił', () => {
  const clean = reconcile(initialEdit(3), 7);
  assert.equal(clean.serverText, '7');
  assert.equal(clean.text, '7');
  const typed = reconcile(edit(initialEdit(3), '9'), 7);
  assert.equal(typed.serverText, '7');
  assert.equal(typed.text, '9');
  const busy = requestSave(edit(initialEdit(3), '9')).state;
  assert.equal(reconcile(busy, 7), busy); // w locie: bez zmian
});

test('endOfZonedDay: koniec dnia w Warszawie (ostatnia ms)', () => {
  // zwykły dzień zimowy (UTC+1): 2026-11-10 23:59:59.999 CET = 22:59:59.999Z
  assert.equal(endOfZonedDay('2026-11-10').toISOString(), '2026-11-10T22:59:59.999Z');
  // zwykły dzień letni (UTC+2)
  assert.equal(endOfZonedDay('2026-07-15').toISOString(), '2026-07-15T21:59:59.999Z');
});

test('endOfZonedDay: dni zmiany czasu', () => {
  // 2026-03-29: przejście na czas letni (dzień ma 23 h), koniec dnia już w UTC+2
  assert.equal(endOfZonedDay('2026-03-29').toISOString(), '2026-03-29T21:59:59.999Z');
  assert.equal(endOfZonedDay('2026-03-28').toISOString(), '2026-03-28T22:59:59.999Z');
  // 2026-10-25: powrót na czas zimowy (dzień ma 25 h), koniec dnia w UTC+1
  assert.equal(endOfZonedDay('2026-10-25').toISOString(), '2026-10-25T22:59:59.999Z');
  assert.equal(endOfZonedDay('2026-10-24').toISOString(), '2026-10-24T21:59:59.999Z');
});

test('endOfZonedDay: 31.12 i przełom miesięcy/lat', () => {
  assert.equal(endOfZonedDay('2026-12-31').toISOString(), '2026-12-31T22:59:59.999Z');
  assert.equal(endOfZonedDay('2027-02-28').toISOString(), '2027-02-28T22:59:59.999Z');
  assert.equal(endOfZonedDay('2028-02-29').toISOString(), '2028-02-29T22:59:59.999Z'); // rok przestępny
  assert.throws(() => endOfZonedDay('31.12.2026'));
});

test('endOfCountDay: kolumna @db.Date (północ UTC) → koniec dnia w Warszawie', () => {
  assert.equal(endOfCountDay(new Date('2026-12-31T00:00:00.000Z')).toISOString(), '2026-12-31T22:59:59.999Z');
  assert.equal(endOfCountDay(new Date('2026-03-29T00:00:00.000Z')).toISOString(), '2026-03-29T21:59:59.999Z');
});

test('countMoment T = min(teraz, koniec dnia spisu); τ liczy się tak samo', () => {
  const end = endOfCountDay(new Date('2026-12-31T00:00:00.000Z'));
  const before = new Date('2026-11-10T09:00:00Z');
  const after = new Date('2027-01-03T09:00:00Z');
  assert.equal(countMoment(before, end).getTime(), before.getTime()); // spis „żywy”
  assert.equal(countMoment(after, end).getTime(), end.getTime()); // spis na minioną datę
  assert.equal(countMoment(end, end).getTime(), end.getTime());
  // τ: edycja przed końcem dnia = chwila edycji, po końcu dnia = koniec dnia
  assert.equal(correctionMoment(new Date('2026-12-31T10:00:00Z'), end).toISOString(), '2026-12-31T10:00:00.000Z');
  assert.equal(correctionMoment(new Date('2027-01-05T10:00:00Z'), end).toISOString(), end.toISOString());
});

test('arkusz po zamknięciu = max(0, stan po korekcie), także przy ujemnym stanie', () => {
  const sheet = (after: number, applied: number) => closedSheetQty(after - applied, applied);
  // stan po korekcie 7 (korekta −3) → 7, „powinno być” 10
  assert.deepEqual(sheet(7, -3), { countedQty: 7, systemQtyAtCount: 10 });
  // sprzedaż po liczeniu zostaje w arkuszu na T_close: 10 → 9, policzone 7 (diff −3): po korekcie 6
  assert.deepEqual(sheet(6, -3), { countedQty: 6, systemQtyAtCount: 9 });
  // backorder: stan −2, znaleziono 1 → po korekcie −1, arkusz 1
  assert.deepEqual(sheet(-1, 1), { countedQty: 1, systemQtyAtCount: 0 });
  // nigdy ujemny arkusz
  assert.ok(sheet(-3, -2).countedQty >= 0);
});

test('isTouched: wpisana wartość (także równa stanowi) i pozycje sprzed pola', () => {
  assert.equal(isTouched({ touched: false, countedQty: 5, systemQtyAtCount: 5 }), false);
  assert.equal(isTouched({ touched: true, countedQty: 5, systemQtyAtCount: 5 }), true); // potwierdzona zgodność
  assert.equal(isTouched({ touched: false, countedQty: 3, systemQtyAtCount: 5 }), true); // stary spis z różnicą
  assert.equal(isTouched({ touched: false, countedQty: null, systemQtyAtCount: null }), false);
  assert.equal(isTouched({ touched: false, countedQty: 3, systemQtyAtCount: null }), false);
});
