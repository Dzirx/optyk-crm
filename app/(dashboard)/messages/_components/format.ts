import { formatDatePadded, formatTimePl } from '@/lib/time';

/** „dd.mm gg:mm” w strefie salonu. */
export function formatShortDateTime(value: string): string {
  return `${formatDatePadded(value).slice(0, 5)} ${formatTimePl(value)}`;
}
