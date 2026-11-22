// Moc szkieł (SPH, CYL, ADD) w formularzu zlecenia: zakresy, odczyt tekstu z klawiatury i wyświetlanie.

export interface PowerRange {
  min: number;
  max: number;
  step: number;
  decimals: number;
}

export const SPH_RANGE: PowerRange = { min: -20, max: 20, step: 0.25, decimals: 2 };
export const CYL_RANGE: PowerRange = { min: -8, max: 8, step: 0.25, decimals: 2 };
export const ADD_RANGE: PowerRange = { min: 0.25, max: 4, step: 0.25, decimals: 2 };

/**
 * Tekst wpisany z klawiatury → wartość pola („-2.50”), albo null, gdy tekstu nie da się odczytać.
 * Akceptuje przecinek i kropkę, znak „+”, minus typograficzny oraz skrót bez separatora
 * („-125” = -1,25), gdy liczba jest poza zakresem. Wynik jest zaokrąglony do kroku i obcięty do zakresu.
 */
export function parsePower(text: string, range: PowerRange): string | null {
  const clean = text.trim().replace(/\s/g, '').replace(/[−–]/g, '-').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  let n = Number(clean);
  if (!Number.isFinite(n)) return null;
  if (!clean.includes('.') && Math.abs(n) > Math.max(Math.abs(range.min), Math.abs(range.max))) n /= 100;
  const stepped = Math.round(n / range.step) * range.step;
  const clamped = Math.min(range.max, Math.max(range.min, stepped));
  return (Math.round(clamped * 100) / 100).toFixed(range.decimals);
}

/** Wartość pola → tekst do wyświetlenia: „+1.25”, „-2.00”, „0.00”; pusta zostaje pusta. */
export function formatPower(value: string): string {
  if (value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n > 0 ? `+${value}` : value;
}
