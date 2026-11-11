// Walidacja liczb z formularzy. Zły format daje błąd 400, a nie 500 z bazy.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Zasób nie istnieje (albo nie należy do salonu): odpowiedź 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

interface NumberRule {
  label: string;
  min?: number;
  max?: number;
  integer?: boolean;
}

/** Pusta wartość → null. Wartość nie-liczbowa albo poza zakresem → ValidationError. */
export function optionalNumber(value: unknown, rule: NumberRule): number | null {
  if (value === undefined || value === null || value === '') return null;
  const text = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  if (text === '') return null;
  const n = typeof text === 'number' ? text : Number(text);
  if (!Number.isFinite(n)) throw new ValidationError(`Nieprawidłowa wartość: ${rule.label}`);
  if (rule.integer && !Number.isInteger(n)) throw new ValidationError(`${rule.label}: wymagana liczba całkowita`);
  if (rule.min !== undefined && n < rule.min) throw new ValidationError(`${rule.label}: wartość nie może być mniejsza niż ${rule.min}`);
  if (rule.max !== undefined && n > rule.max) throw new ValidationError(`${rule.label}: wartość nie może być większa niż ${rule.max}`);
  return n;
}

/** Jak optionalNumber, ale pusta wartość też jest błędem. */
export function requiredNumber(value: unknown, rule: NumberRule): number {
  const n = optionalNumber(value, rule);
  if (n === null) throw new ValidationError(`${rule.label} jest wymagana`);
  return n;
}

/** Data z formularza. Pusta → null, nieprawidłowa → ValidationError. */
export function optionalDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) throw new ValidationError(`Nieprawidłowa data: ${label}`);
  return d;
}

/** Kwoty w złotych: 0 … 10 mln, maks. 2 miejsca po przecinku (zgodnie z Decimal(10,2)). */
export const MONEY = { min: 0, max: 99_999_999.99 };
