import { minutesOfDay } from '@/lib/time';

export const DEFAULT_WINDOW_START = 540; // 09:00
export const DEFAULT_WINDOW_END = 1020; // 17:00

/** Czy w strefie salonu jest teraz godzina z okna wysyłki [start, koniec): minuty od północy. */
export function isWithinSendWindow(now: Date, startMinutes: number, endMinutes: number): boolean {
  const m = minutesOfDay(now);
  return m >= startMinutes && m < endMinutes;
}
