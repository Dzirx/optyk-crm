import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeliveryDate } from '../../lib/stock/delivery-date';

import type { DeliveryBounds } from '../../lib/stock/delivery-date';
import { deliveryMinimum } from '../../lib/stock/delivery-date';

const start = new Date('2026-05-01T10:00:00Z');
const created = new Date('2026-04-20T10:00:00Z'); // towar założony przed historią
const bounds = (over: Partial<DeliveryBounds> = {}): DeliveryBounds => ({ historyStart: start, itemCreatedAt: created, lastCountAsOf: null, ...over });
const now = new Date('2026-05-10T12:00:00Z');

test('brak daty = teraz', () => {
  assert.equal(resolveDeliveryDate(undefined, now, bounds()).getTime(), now.getTime());
});
test('data wsteczna po początku historii przechodzi bez zmian', () => {
  const d = new Date('2026-05-05T08:00:00Z');
  assert.equal(resolveDeliveryDate(d, now, bounds()).getTime(), d.getTime());
});
test('data równa początkowi historii jest dozwolona', () => {
  assert.equal(resolveDeliveryDate(start, now, bounds()).getTime(), start.getTime());
});
test('data sprzed początku historii → błąd', () => {
  assert.throws(() => resolveDeliveryDate(new Date('2026-04-29T23:59:59Z'), now, bounds()), /początku historii/);
});
test('data z przyszłości → błąd', () => {
  assert.throws(() => resolveDeliveryDate(new Date('2026-05-11T12:00:00Z'), now, bounds()), /z przyszłości/);
});
test('kilka sekund w przyszłość (zegar przeglądarki) = teraz', () => {
  const d = new Date(now.getTime() + 30_000);
  assert.equal(resolveDeliveryDate(d, now, bounds()).getTime(), now.getTime());
});

test('minimum: największe z historii, założenia towaru i spisu + 1 ms', () => {
  assert.equal(deliveryMinimum(bounds()).reason, 'history');
  const item = new Date('2026-05-03T09:00:00Z');
  assert.deepEqual([deliveryMinimum(bounds({ itemCreatedAt: item })).at.getTime(), deliveryMinimum(bounds({ itemCreatedAt: item })).reason], [item.getTime(), 'item']);
  const asOf = new Date('2026-05-04T23:59:59.999Z');
  const m = deliveryMinimum(bounds({ itemCreatedAt: item, lastCountAsOf: asOf }));
  assert.equal(m.at.getTime(), asOf.getTime() + 1);
  assert.equal(m.reason, 'count');
  // spis starszy niż założenie towaru nie wyznacza minimum
  assert.equal(deliveryMinimum(bounds({ itemCreatedAt: item, lastCountAsOf: new Date('2026-05-02T00:00:00Z') })).reason, 'item');
  // brak historii (null) nie ogranicza
  assert.equal(deliveryMinimum(bounds({ historyStart: null })).reason, 'item');
});
test('dostawa sprzed zakończonej inwentaryzacji → błąd z datą spisu', () => {
  const b = bounds({ lastCountAsOf: new Date('2026-05-07T21:59:59.999Z') }); // koniec 7.05 w Warszawie
  assert.throws(() => resolveDeliveryDate(new Date('2026-05-07T10:00:00Z'), now, b), /sprzed zakończonej inwentaryzacji \(\d{1,2}\.05\.2026\)/);
  assert.equal(resolveDeliveryDate(new Date('2026-05-08T10:00:00Z'), now, b).getTime(), new Date('2026-05-08T10:00:00Z').getTime());
});
test('dostawa sprzed dodania towaru → błąd; ten sam dzień → minimum', () => {
  const b = bounds({ itemCreatedAt: new Date('2026-05-08T12:00:00Z') });
  assert.throws(() => resolveDeliveryDate(new Date('2026-05-07T12:00:00Z'), now, b), /sprzed dodania towaru \(8\.05\.2026\)/);
  // ten sam dzień (08.05 w Warszawie), ale wcześniej niż założenie (formularz wysyła południe lokalne = 10:00Z)
  assert.equal(resolveDeliveryDate(new Date('2026-05-08T10:00:00Z'), now, b).getTime(), b.itemCreatedAt.getTime());
});
test('ten sam dzień co zakończony spis, ale przed nim → błąd (bez przesuwania, towar mógł być policzony)', () => {
  const asOf = new Date('2026-05-08T13:00:00Z');
  const b = bounds({ lastCountAsOf: asOf });
  assert.throws(() => resolveDeliveryDate(new Date('2026-05-08T10:00:00Z'), now, b), /sprzed zakończonej inwentaryzacji/);
  // po spisie tego samego dnia → bez zmian
  assert.equal(resolveDeliveryDate(new Date('2026-05-08T14:00:00Z'), now, b).getTime(), new Date('2026-05-08T14:00:00Z').getTime());
});
test('ten sam dzień co początek historii → początek historii', () => {
  assert.equal(resolveDeliveryDate(new Date('2026-05-01T08:00:00Z'), now, bounds()).getTime(), start.getTime());
});
test('inny dzień sprzed minimum nie jest przycinany', () => {
  assert.throws(() => resolveDeliveryDate(new Date('2026-04-30T10:00:00Z'), now, bounds()), /początku historii/);
});
