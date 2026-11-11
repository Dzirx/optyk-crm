import { z } from 'zod';
import { ValidationError, optionalNumber } from '@/lib/api/validation';
import { MAX_COUNT_QTY } from '@/lib/stock-count/limits';
import { trimmedOrNull } from './common';

export { MAX_COUNT_QTY };

const BAD_DATE = 'Nieprawidłowa data inwentaryzacji (oczekiwano rrrr-mm-dd)';
const COUNTED = { label: 'Policzona ilość', min: 0, max: MAX_COUNT_QTY, integer: true };

/** Data kalendarzowa yyyy-mm-dd → północ UTC (kolumna @db.Date). */
export function parseCountDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  const year = d.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? d : null;
}

export const startStockCountSchema = z.object({
  countDate: z
    .string({ error: BAD_DATE })
    .transform((v, ctx) => {
      const d = parseCountDate(v.trim());
      if (!d) {
        ctx.addIssue({ code: 'custom', message: BAD_DATE });
        return z.NEVER;
      }
      return d;
    }),
  notes: trimmedOrNull,
});

// Pole musi być obecne: null albo pusty tekst czyści liczenie, liczba całkowita >= 0 je zapisuje.
export const setLineCountSchema = z.object({
  countedQty: z
    .unknown()
    .refine((v) => v !== undefined, 'Pole „countedQty” jest wymagane')
    .transform((v, ctx): number | null => {
      try {
        return optionalNumber(v, COUNTED);
      } catch (error) {
        if (error instanceof ValidationError) {
          ctx.addIssue({ code: 'custom', message: error.message });
          return z.NEVER;
        }
        throw error;
      }
    }),
});
