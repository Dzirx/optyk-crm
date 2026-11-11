// Uruchamiany z TZ=UTC (patrz skrypt test:unit): serwer produkcyjny działa w UTC,
// a aplikacja ma liczyć dni według czasu polskiego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesToHhmm, todayRange, formatDatePl, currentYear, dayBounds, addDaysIso, isIsoDay, weekdayName, formatDayHeading } from '../../lib/time';
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

const dayCases: [string, string, string, string][] = [
  ['zwykły dzień zimą', '2026-11-11', '2026-11-10T23:00:00.000Z', '2026-11-11T23:00:00.000Z'],
  ['zwykły dzień latem', '2026-07-01', '2026-06-30T22:00:00.000Z', '2026-07-01T22:00:00.000Z'],
  ['zmiana na czas letni (23 h)', '2026-03-29', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z'],
  ['zmiana na czas zimowy (25 h)', '2026-10-25', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z'],
  ['sylwester', '2026-12-31', '2026-12-30T23:00:00.000Z', '2026-12-31T23:00:00.000Z'],
];
for (const [name, day, start, end] of dayCases) {
  test(`dayBounds: ${name}`, () => {
    const r = dayBounds(day);
    assert.equal(r.start.toISOString(), start);
    assert.equal(r.end.toISOString(), end);
  });
}

test('dayBounds: dni sąsiednie stykają się bez luki', () => {
  for (const day of ['2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25']) {
    assert.equal(dayBounds(day).end.getTime(), dayBounds(addDaysIso(day, 1)).start.getTime(), day);
  }
});

test('dayBounds: 23:30 i 00:30 czasu polskiego trafiają do właściwego dnia', () => {
  const inDay = (iso: string, day: string) => {
    const t = new Date(iso).getTime();
    const b = dayBounds(day);
    return t >= b.start.getTime() && t < b.end.getTime();
  };
  assert.ok(inDay('2026-11-11T22:30:00Z', '2026-11-11')); // 23:30 PL
  assert.ok(inDay('2026-11-11T23:30:00Z', '2026-11-12')); // 00:30 PL
  assert.ok(inDay('2026-03-28T23:30:00Z', '2026-03-29')); // 00:30 PL w dniu zmiany na letni
  assert.ok(inDay('2026-03-29T21:30:00Z', '2026-03-29')); // 23:30 PL (CEST)
  assert.ok(inDay('2026-10-25T22:30:00Z', '2026-10-25')); // 23:30 PL (CET) w dniu zmiany na zimowy
});

test('dayBounds i isIsoDay: nieprawidłowa data', () => {
  for (const bad of ['', '2026-2-3', '2026-02-30', '2026-13-01', 'jutro', '2026-11-11T10:00']) {
    assert.equal(isIsoDay(bad), false, bad);
    assert.throws(() => dayBounds(bad), bad);
  }
  assert.equal(isIsoDay('2028-02-29'), true);
  assert.equal(isIsoDay('2027-02-29'), false);
});

test('addDaysIso: miesiąc, rok, rok przestępny', () => {
  assert.equal(addDaysIso('2026-11-30', 1), '2026-12-01');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysIso('2027-01-01', -1), '2026-12-31');
  assert.equal(addDaysIso('2028-02-28', 1), '2028-02-29');
  assert.equal(addDaysIso('2027-02-28', 1), '2027-03-01');
  assert.equal(addDaysIso('2026-03-29', 0), '2026-03-29');
});

test('weekdayName i formatDayHeading: PL i EN', () => {
  assert.equal(weekdayName('2026-11-11', 'pl'), 'Środa');
  assert.equal(weekdayName('2026-11-11', 'en'), 'Wednesday');
  assert.equal(weekdayName('2026-11-15', 'pl'), 'Niedziela');
  assert.equal(weekdayName('2026-11-16', 'pl'), 'Poniedziałek');
  assert.equal(weekdayName('2026-11-14', 'pl'), 'Sobota');
  assert.equal(formatDayHeading('2026-11-11', 'pl'), 'Środa, 11.11.2026');
  assert.equal(formatDayHeading('2026-03-05', 'en'), 'Thursday, 05.03.2026');
});

test('minutesToHhmm: zero na początku, 1440 i więcej to 23:59', () => {
  assert.equal(minutesToHhmm(0), '00:00');
  assert.equal(minutesToHhmm(540), '09:00');
  assert.equal(minutesToHhmm(1439), '23:59');
  assert.equal(minutesToHhmm(1440), '23:59');
  assert.equal(minutesToHhmm(-5), '00:00');
});
