// Strefa czasowa salonu. Serwer (Docker) działa w UTC, więc daty dla ludzi
// (treść SMS, „wizyty dziś”, numer roku w zleceniu) liczymy jawnie w tej strefie.
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Europe/Warsaw';

/** Data w formacie dd.mm.rrrr w strefie salonu. */
export function formatDatePl(value: Date | string): string {
  return new Date(value).toLocaleDateString('pl-PL', { timeZone: APP_TIME_ZONE });
}

/** Godzina w formacie gg:mm w strefie salonu. */
export function formatTimePl(value: Date | string): string {
  return new Date(value).toLocaleTimeString('pl-PL', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Przesunięcie strefy salonu względem UTC (w ms) w danej chwili. */
function zoneOffsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Chwila (UTC), w której w strefie salonu zaczyna się dany dzień. */
function startOfZonedDay(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  // Dwa przybliżenia wystarczają też w dni zmiany czasu.
  let ts = guess - zoneOffsetMs(new Date(guess));
  ts = guess - zoneOffsetMs(new Date(ts));
  return new Date(ts);
}

/** Granice dzisiejszego dnia w strefie salonu: [start, koniec). */
export function todayRange(now = new Date()): { start: Date; end: Date } {
  const p = zonedParts(now);
  return { start: startOfZonedDay(p.year, p.month, p.day), end: startOfZonedDay(p.year, p.month, p.day + 1) };
}

/** Bieżący rok w strefie salonu. */
export function currentYear(now = new Date()): number {
  return zonedParts(now).year;
}
