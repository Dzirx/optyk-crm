// Strefa czasowa salonu. Serwer (Docker) działa w UTC, więc daty dla ludzi
// (treść SMS, „wizyty dziś”, numer roku w zleceniu) liczymy jawnie w tej strefie.
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Europe/Warsaw';

/** Data w formacie dd.mm.rrrr w strefie salonu. */
export function formatDatePl(value: Date | string): string {
  return new Date(value).toLocaleDateString('pl-PL', { timeZone: APP_TIME_ZONE });
}

/** Data dd.mm.rrrr z zerami wiodącymi (np. 05.11.2026) w strefie salonu. */
export function formatDatePadded(value: Date | string): string {
  return new Date(value).toLocaleDateString('pl-PL', { timeZone: APP_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Data i godzina „dd.mm.rrrr, gg:mm” z zerami wiodącymi. */
export function formatDateTimePadded(value: Date | string): string {
  return `${formatDatePadded(value)}, ${formatTimePl(value)}`;
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

/**
 * Domyślna data inwentaryzacji rocznej (yyyy-mm-dd, strefa salonu): 31 grudnia bieżącego roku;
 * w styczniu 31 grudnia roku poprzedniego (spis robi się po zamknięciu starego roku).
 */
export function yearEndDate(now = new Date()): string {
  const { year, month } = zonedParts(now);
  return `${month === 1 ? year - 1 : year}-12-31`;
}

/** Data i godzina „dd.mm.rrrr, gg:mm” w strefie salonu. */
export function formatDateTimePl(value: Date | string): string {
  return `${formatDatePl(value)}, ${formatTimePl(value)}`;
}

/** Minuty od północy w strefie salonu (0-1439). */
export function minutesOfDay(now = new Date()): number {
  const p = zonedParts(now);
  return p.hour * 60 + p.minute;
}

/** Dzisiejsza data (yyyy-mm-dd) w strefie salonu. */
export function todayIso(now = new Date()): string {
  const p = zonedParts(now);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Ostatnia chwila (ms) dnia kalendarzowego yyyy-mm-dd w strefie salonu: początek następnego dnia minus 1 ms. */
export function endOfZonedDay(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`Nieprawidłowa data: ${isoDate}`);
  return new Date(startOfZonedDay(Number(m[1]), Number(m[2]), Number(m[3]) + 1).getTime() - 1);
}

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Czy tekst to istniejąca data kalendarzowa yyyy-mm-dd (np. 2026-02-30 nie jest). */
export function isIsoDay(value: string): boolean {
  const m = ISO_DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Dokładne granice dnia kalendarzowego yyyy-mm-dd w strefie salonu: [start, end). W dni zmiany czasu dzień ma 23 lub 25 godzin. */
export function dayBounds(isoDate: string): { start: Date; end: Date } {
  if (!isIsoDay(isoDate)) throw new Error(`Nieprawidłowa data: ${isoDate}`);
  const [y, m, d] = isoDate.split('-').map(Number);
  return { start: startOfZonedDay(y, m, d), end: startOfZonedDay(y, m, d + 1) };
}

/** Dzień kalendarzowy przesunięty o `days` (może być ujemne): yyyy-mm-dd → yyyy-mm-dd. */
export function addDaysIso(isoDate: string, days: number): string {
  if (!isIsoDay(isoDate)) throw new Error(`Nieprawidłowa data: ${isoDate}`);
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Dzień tygodnia dla daty kalendarzowej: 0 = niedziela … 6 = sobota. */
export function weekdayIndex(isoDate: string): number {
  if (!isIsoDay(isoDate)) throw new Error(`Nieprawidłowa data: ${isoDate}`);
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const WEEKDAYS = {
  pl: ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** Nazwa dnia tygodnia z wielkiej litery („Środa” / „Wednesday”). */
export function weekdayName(isoDate: string, language: string): string {
  return WEEKDAYS[language === 'en' ? 'en' : 'pl'][weekdayIndex(isoDate)];
}

/** „Środa, 11.11.2026” (EN: „Wednesday, 11.11.2026”). */
export function formatDayHeading(isoDate: string, language: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${weekdayName(isoDate, language)}, ${d}.${m}.${y}`;
}
