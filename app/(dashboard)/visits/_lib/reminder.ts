import { previousWorkingDay } from '@/lib/holidays-pl';
import { isIsoDay, todayIso } from '@/lib/time';

/**
 * Domyślny dzień przypomnienia dla wartości pola datetime-local (yyyy-mm-ddThh:mm): poprzedni dzień roboczy.
 * Zwraca '' bez daty wizyty oraz gdy ten dzień jest już za nami (klient dopiero się umówił).
 */
export function autoReminderDay(visitDateInput: string, today = todayIso()): string {
  const day = visitDateInput.slice(0, 10);
  if (!isIsoDay(day)) return '';
  const reminder = previousWorkingDay(day);
  return reminder < today ? '' : reminder;
}

/** Zapisane przypomnienie (ISO) jako dzień yyyy-mm-dd w strefie salonu. */
export function storedReminderDay(iso: string | null): string {
  return iso ? todayIso(new Date(iso)) : '';
}
