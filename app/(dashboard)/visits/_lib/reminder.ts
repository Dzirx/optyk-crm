import { previousWorkingDay } from '@/lib/holidays-pl';
import { isIsoDay, todayIso } from '@/lib/time';

/** Domyślny dzień przypomnienia dla wartości pola datetime-local (yyyy-mm-ddThh:mm): poprzedni dzień roboczy, albo '' bez daty wizyty. */
export function autoReminderDay(visitDateInput: string): string {
  const day = visitDateInput.slice(0, 10);
  return isIsoDay(day) ? previousWorkingDay(day) : '';
}

/** Zapisane przypomnienie (ISO) jako dzień yyyy-mm-dd w strefie salonu. */
export function storedReminderDay(iso: string | null): string {
  return iso ? todayIso(new Date(iso)) : '';
}
