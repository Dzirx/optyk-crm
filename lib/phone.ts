/**
 * Numer telefonu do wyświetlenia: +48500100200 → „+48 500 100 200”, 500100200 → „500 100 200”.
 * Dawniej grupy po 3 cyfry liczone były razem z kierunkowym („+485 001 002 00”).
 */
export function formatPhone(value: string): string {
  const clean = value.replace(/\s/g, '');
  const group = (digits: string) => digits.replace(/(\d{3})(?=\d)/g, '$1 ');
  const pl = clean.match(/^(?:\+48|0048)(\d{9})$/);
  if (pl) return `+48 ${group(pl[1])}`;
  if (/^\d{9}$/.test(clean)) return group(clean);
  // Inne kraje: kierunkowy (1–3 cyfry) trudno odróżnić bez tabeli — zostawiamy numer bez zmian.
  return clean;
}
