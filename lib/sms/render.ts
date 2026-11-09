import { formatDatePl, formatTimePl } from '@/lib/time';

/**
 * Wstawia dane do szablonu SMS. Data i godzina są w strefie salonu (nie w UTC serwera).
 * Pola: {name}, {staff}, {link}, {date}, {time}.
 */
export function renderSmsTemplate(
  template: string,
  data: { name: string; staff: string; link: string; date: Date | string },
): string {
  return template
    .replace(/{name}/g, data.name)
    .replace(/{staff}/g, data.staff)
    .replace(/{link}/g, data.link)
    .replace(/{date}/g, formatDatePl(data.date))
    .replace(/{time}/g, formatTimePl(data.date));
}
