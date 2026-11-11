// Formatowanie kwot i CSV po polsku.

const NBSP = ' ';

/** Grosze → „1 234,50 zł” (spacja twarda jako separator tysięcy). */
export function formatMoneyCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const zl = Math.floor(abs / 100);
  const gr = String(abs % 100).padStart(2, '0');
  const grouped = String(zl).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? '-' : ''}${grouped},${gr}${NBSP}zł`;
}

/** Kwota w złotych → „1 234,50 zł”. */
export function formatMoney(value: number): string {
  return formatMoneyCents(Math.round(value * 100));
}

/** Liczba z przecinkiem dziesiętnym, bez separatora tysięcy (do CSV). */
export function csvMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  // Ochrona przed formułami w Excelu (nazwa pozycji zaczynająca się od = + @ albo -tekst).
  if (typeof value === 'string' && /^([=+@\t\r]|-(?!\d))/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV dla polskiego Excela: BOM UTF-8, średnik, CRLF. */
export function toCsv(rows: (string | number | null)[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/** Data (Date z kolumny @db.Date = północ UTC) → dd.mm.rrrr. */
export function formatCountDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}
