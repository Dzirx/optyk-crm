// Automatyczny dzień przypomnienia: poprzedni dzień roboczy, ale nigdy w przeszłości.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoReminderDay } from '../../app/(dashboard)/visits/_lib/reminder';

test('autoReminderDay: poprzedni dzień roboczy', () => {
  assert.equal(autoReminderDay('2026-11-25T10:00', '2026-11-11'), '2026-11-24');
  assert.equal(autoReminderDay('2026-11-16T10:00', '2026-11-11'), '2026-11-14'); // poniedziałek → sobota
});

test('autoReminderDay: dzień w przeszłości daje pusty wynik', () => {
  assert.equal(autoReminderDay('2026-11-12T10:00', '2026-11-12'), ''); // wizyta dziś: poprzedni dzień minął
  assert.equal(autoReminderDay('2026-11-12T10:00', '2026-11-13'), '');
});

test('autoReminderDay: dzisiejsza data jest dozwolona', () => {
  assert.equal(autoReminderDay('2026-11-13T10:00', '2026-11-12'), '2026-11-12');
});

test('autoReminderDay: bez daty wizyty', () => {
  assert.equal(autoReminderDay('', '2026-11-11'), '');
});
