// Polskie dni wolne od pracy. Funkcje działają na dniach kalendarzowych „yyyy-mm-dd”
// (bez godzin i stref czasowych), więc wynik nie zależy od strefy komputera.
import { addDaysIso, isIsoDay, weekdayIndex } from '@/lib/time';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Niedziela Wielkanocna (kalendarz gregoriański, algorytm anonimowy): yyyy-mm-dd. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** Dni ustawowo wolne od pracy w danym roku (yyyy-mm-dd), z Wigilią (od 2025 r.). */
export function polishHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  return new Set([
    ymd(year, 1, 1),
    ymd(year, 1, 6),
    easter,
    addDaysIso(easter, 1), // Poniedziałek Wielkanocny
    ymd(year, 5, 1),
    ymd(year, 5, 3),
    addDaysIso(easter, 49), // Zielone Świątki
    addDaysIso(easter, 60), // Boże Ciało
    ymd(year, 8, 15),
    ymd(year, 11, 1),
    ymd(year, 11, 11),
    ymd(year, 12, 24),
    ymd(year, 12, 25),
    ymd(year, 12, 26),
  ]);
}

export function isHoliday(day: string): boolean {
  if (!isIsoDay(day)) throw new Error(`Nieprawidłowa data: ${day}`);
  return polishHolidays(Number(day.slice(0, 4))).has(day);
}

/** Dzień roboczy dla salonu: nie niedziela i nie święto (sobota jest dniem roboczym). */
export function isWorkingDay(day: string): boolean {
  return weekdayIndex(day) !== 0 && !isHoliday(day);
}

/** Ostatni dzień roboczy przed dniem wizyty (yyyy-mm-dd → yyyy-mm-dd). */
export function previousWorkingDay(visitDay: string): string {
  let day = addDaysIso(visitDay, -1);
  while (!isWorkingDay(day)) day = addDaysIso(day, -1);
  return day;
}
