// Uruchamiany z TZ=UTC (patrz skrypt test:unit): serwer produkcyjny działa w UTC,
// a aplikacja ma liczyć dni według czasu polskiego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayRange, formatDatePl, currentYear } from '../../lib/time';
import { renderSmsTemplate } from '../../lib/sms/render';

const cases: [string, string, string, string][] = [
  ['zmiana na czas letni', '2026-03-29T12:00:00Z', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z'],
  ['zmiana na czas zimowy', '2026-10-25T12:00:00Z', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z'],
  ['sylwester po północy w Polsce', '2026-12-31T23:30:00Z', '2026-12-31T23:00:00.000Z', '2027-01-01T23:00:00.000Z'],
];

for (const [name, now, start, end] of cases) {
  test(`todayRange: ${name}`, () => {
    const r = todayRange(new Date(now));
    assert.equal(r.start.toISOString(), start);
    assert.equal(r.end.toISOString(), end);
  });
}

test('currentYear: rok w Polsce o 00:30 1 stycznia', () => {
  assert.equal(currentYear(new Date('2026-12-31T23:30:00Z')), 2027);
});

test('renderSmsTemplate: data i godzina w czasie polskim', () => {
  const msg = renderSmsTemplate('{name}: {date} o {time}', {
    name: 'Jan',
    staff: '',
    link: '',
    date: new Date('2027-01-15T09:00:00Z'),
  });
  assert.equal(msg, 'Jan: 15.01.2027 o 10:00');
});

test('formatDatePl: data w czasie polskim', () => {
  assert.equal(formatDatePl('2026-07-01T22:30:00Z'), '2.07.2026');
});
