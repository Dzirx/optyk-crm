// Uruchamiany z TZ=UTC: dni robocze liczymy na datach kalendarzowych, okno wysyłki według czasu polskiego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, isHoliday, isWorkingDay, polishHolidays, previousWorkingDay } from '../../lib/holidays-pl';
import { isWithinSendWindow } from '../../lib/sms/window';

test('Wielkanoc 2025-2027', () => {
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
});

test('święta ruchome 2026', () => {
  const h = polishHolidays(2026);
  assert.ok(h.has('2026-04-06')); // Poniedziałek Wielkanocny
  assert.ok(h.has('2026-05-24')); // Zielone Świątki
  assert.ok(h.has('2026-06-04')); // Boże Ciało
});

test('święta stałe 2025-2027: 14 dni rocznie', () => {
  for (const year of [2025, 2026, 2027]) {
    const h = polishHolidays(year);
    assert.equal(h.size, 14, `rok ${year}`);
    for (const md of ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26']) {
      assert.ok(h.has(`${year}-${md}`), `${year}-${md}`);
    }
  }
});

test('isWorkingDay: sobota tak, niedziela i święto nie', () => {
  assert.equal(isWorkingDay('2025-12-13'), true); // sobota
  assert.equal(isWorkingDay('2025-12-14'), false); // niedziela
  assert.equal(isWorkingDay('2025-11-11'), false); // święto w poniedziałek
  assert.equal(isWorkingDay('2025-12-10'), true);
  assert.equal(isHoliday('2027-03-29'), true);
});

test('previousWorkingDay', () => {
  assert.equal(previousWorkingDay('2025-12-10'), '2025-12-09');
  assert.equal(previousWorkingDay('2025-12-11'), '2025-12-10');
  assert.equal(previousWorkingDay('2025-12-15'), '2025-12-13'); // poniedziałek → sobota
  assert.equal(previousWorkingDay('2025-12-27'), '2025-12-23'); // 26, 25, 24 święta
  assert.equal(previousWorkingDay('2025-11-12'), '2025-11-10'); // 11.11 święto
  assert.equal(previousWorkingDay('2026-01-01'), '2025-12-31');
  assert.equal(previousWorkingDay('2026-04-07'), '2026-04-04'); // po Wielkanocy: pon. i niedz. wolne → sobota
});

const at = (iso: string) => new Date(iso);

test('okno wysyłki 09:00-17:00 zimą (UTC+1)', () => {
  assert.equal(isWithinSendWindow(at('2026-01-15T07:59:00Z'), 540, 1020), false);
  assert.equal(isWithinSendWindow(at('2026-01-15T08:00:00Z'), 540, 1020), true);
  assert.equal(isWithinSendWindow(at('2026-01-15T15:59:00Z'), 540, 1020), true);
  assert.equal(isWithinSendWindow(at('2026-01-15T16:00:00Z'), 540, 1020), false);
});

test('okno wysyłki 09:00-17:00 latem (UTC+2)', () => {
  assert.equal(isWithinSendWindow(at('2026-07-15T06:59:00Z'), 540, 1020), false);
  assert.equal(isWithinSendWindow(at('2026-07-15T07:00:00Z'), 540, 1020), true);
  assert.equal(isWithinSendWindow(at('2026-07-15T14:59:00Z'), 540, 1020), true);
  assert.equal(isWithinSendWindow(at('2026-07-15T15:00:00Z'), 540, 1020), false);
});

test('okno wysyłki w dni zmiany czasu', () => {
  // 2026-03-29: o 01:00 UTC zegar przeskakuje na czas letni (UTC+2).
  assert.equal(isWithinSendWindow(at('2026-03-29T06:59:00Z'), 540, 1020), false); // 08:59
  assert.equal(isWithinSendWindow(at('2026-03-29T07:00:00Z'), 540, 1020), true); // 09:00
  // 2026-10-25: o 01:00 UTC wraca czas zimowy (UTC+1).
  assert.equal(isWithinSendWindow(at('2026-10-25T07:59:00Z'), 540, 1020), false); // 08:59
  assert.equal(isWithinSendWindow(at('2026-10-25T08:00:00Z'), 540, 1020), true); // 09:00
});

test('okno całodobowe 0-1440 i okno puste', () => {
  assert.equal(isWithinSendWindow(at('2026-01-15T22:59:00Z'), 0, 1440), true); // 23:59
  assert.equal(isWithinSendWindow(at('2026-01-15T23:00:00Z'), 0, 1440), true); // 00:00 następnego dnia
  assert.equal(isWithinSendWindow(at('2026-01-15T12:00:00Z'), 600, 600), false);
});

test('Wigilia jest świętem dopiero od 2025 r.', () => {
  assert.equal(isHoliday('2024-12-24'), false);
  assert.equal(isWorkingDay('2024-12-24'), true); // wtorek
  assert.equal(polishHolidays(2024).size, 13);
  assert.equal(isHoliday('2025-12-24'), true);
  assert.equal(previousWorkingDay('2024-12-25'), '2024-12-24');
});
