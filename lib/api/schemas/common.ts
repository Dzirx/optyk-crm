// Wspólne klocki schematów zod. Liczby i daty używają tych samych reguł co lib/api/validation.ts:
// pusta wartość → null, przecinek dziesiętny ("199,50"), zakresy i liczby całkowite.

import { z } from 'zod';
import { ValidationError, optionalDate, optionalNumber, requiredNumber } from '@/lib/api/validation';

type NumberRule = Parameters<typeof optionalNumber>[1];

/**
 * Pole sprawdzane funkcją z lib/api/validation (rzuca ValidationError → błąd zod z tym komunikatem).
 * Brak pola w body: funkcja dostaje undefined, np. optionalNumber(undefined) = null.
 * keepUndefined (PATCH): brak pola zostaje undefined, czyli „nie zmieniaj”.
 */
export function fromValidator<T>(fn: (value: unknown) => T): z.ZodType<T>;
export function fromValidator<T>(fn: (value: unknown) => T, keepUndefined: true): z.ZodType<T | undefined>;
export function fromValidator<T>(fn: (value: unknown) => T, keepUndefined = false): z.ZodType<T | undefined> {
  return z
    .unknown()
    .optional()
    .transform((value, ctx): T | undefined => {
      if (keepUndefined && value === undefined) return undefined;
      try {
        return fn(value);
      } catch (error) {
        if (error instanceof ValidationError) {
          ctx.addIssue({ code: 'custom', message: error.message });
          return z.NEVER;
        }
        throw error;
      }
    });
}

/** Liczba opcjonalna: brak/pusta → null. */
export const optNum = (rule: NumberRule) => fromValidator((v) => optionalNumber(v, rule));
/** Jak optNum, ale w PATCH brak pola = bez zmiany. */
export const patchNum = (rule: NumberRule) => fromValidator((v) => optionalNumber(v, rule), true);
/** Liczba wymagana (pusta → „<etykieta> jest wymagana”). */
export const reqNum = (rule: NumberRule) => fromValidator((v) => requiredNumber(v, rule));
export const patchReqNum = (rule: NumberRule) => fromValidator((v) => requiredNumber(v, rule), true);

/** Data opcjonalna: pusta → null, zła → komunikat „Nieprawidłowa data: <etykieta>”. */
export const optDate = (label: string) => fromValidator((v) => optionalDate(v, label));
export const patchDate = (label: string) => fromValidator((v) => optionalDate(v, label), true);

/** Data o własnym komunikacie błędu (pusta → null). */
export function dateWithMessage(invalidMessage: string) {
  return (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(typeof v === 'number' ? v : String(v));
    if (isNaN(d.getTime())) throw new ValidationError(invalidMessage);
    return d;
  };
}

/** Tekst obcięty do `max` znaków; pusty → null. */
export function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, max);
}

/** Tekst po trim; pusty → null. Brak pola zostaje undefined (w PATCH = bez zmiany). */
export const trimmedOrNull = z
  .string()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v?.trim() || null));

// --- Parametry listy z paginacją (query string) ---

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
const BAD_PAGE = 'Nieprawidłowy numer strony (oczekiwano liczby całkowitej od 1)';
const BAD_PAGE_SIZE = `Nieprawidłowy rozmiar strony (oczekiwano liczby całkowitej od 1 do ${MAX_PAGE_SIZE})`;

/** `page` w query: brak = lista bez paginacji (stary kształt odpowiedzi). */
export const pageParam = z
  .string({ error: BAD_PAGE })
  .regex(/^\d{1,9}$/, BAD_PAGE)
  .transform(Number)
  .refine((n) => n >= 1, BAD_PAGE)
  .optional();

export const pageSizeParam = z
  .string({ error: BAD_PAGE_SIZE })
  .regex(/^\d{1,9}$/, BAD_PAGE_SIZE)
  .transform(Number)
  .refine((n) => n >= 1 && n <= MAX_PAGE_SIZE, BAD_PAGE_SIZE)
  .optional()
  .transform((n) => n ?? DEFAULT_PAGE_SIZE);

/** Szukana fraza: po trim, pusta = brak filtra, max 100 znaków. */
export const searchParam = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length <= 100, 'Szukana fraza może mieć najwyżej 100 znaków')
  .transform((v) => v || undefined)
  .optional();

/** Wartości z URLSearchParams → obiekt dla schematu (brak = undefined). */
export function queryObject(sp: URLSearchParams, keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((k) => [k, sp.get(k) ?? undefined]));
}
