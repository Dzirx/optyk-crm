// Pole datetime-local nie ma strefy czasowej. Serwer działa w UTC, więc wysyłamy
// pełną datę ISO policzoną w przeglądarce, a do edycji zamieniamy ISO na czas lokalny.
export const localInputToIso = (value: string): string | null => (value ? new Date(value).toISOString() : null);
export const isoToLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
