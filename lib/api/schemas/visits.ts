import { z } from 'zod';
import { ValidationError } from '@/lib/api/validation';
import { dayBounds, isIsoDay, todayIso } from '@/lib/time';
import { dateWithMessage, fromValidator, pageParam, pageSizeParam } from './common';

const BAD_VISIT_DATE = 'Nieprawidłowa data wizyty';
const BAD_REMINDER_DATE = 'Nieprawidłowa data SMS z przypomnieniem';
const BAD_REVIEW_DATE = 'Nieprawidłowa data SMS z prośbą o opinię';
export const REMINDER_BEFORE_VISIT = 'Dzień SMS z przypomnieniem nie może być późniejszy niż dzień wizyty';
export const REVIEW_AFTER_VISIT = 'Data SMS z prośbą o opinię powinna być po dacie wizyty';

/** Dzień przypomnienia „yyyy-mm-dd” = początek tego dnia w strefie salonu; pełna data ISO bez zmian (wstecz zgodność). */
const reminderValue = (v: unknown): Date | null => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    if (!isIsoDay(v)) throw new ValidationError(BAD_REMINDER_DATE);
    return dayBounds(v).start;
  }
  return dateWithMessage(BAD_REMINDER_DATE)(v);
};

/** Czy dzień przypomnienia (strefa salonu) wypada po dniu wizyty. */
export const reminderAfterVisitDay = (reminder: Date, visit: Date): boolean => todayIso(reminder) > todayIso(visit);

const reminderDate = fromValidator(reminderValue);
const reviewDate = fromValidator(dateWithMessage(BAD_REVIEW_DATE));
const reminderDatePatch = fromValidator(reminderValue, true);
const reviewDatePatch = fromValidator(dateWithMessage(BAD_REVIEW_DATE), true);

const REQUIRED_CUSTOMER = 'Wymagane ID klienta';

export const createVisitSchema = z
  .object({
    customerId: z.string({ error: REQUIRED_CUSTOMER }).min(1, REQUIRED_CUSTOMER),
    visitDate: fromValidator((v) => {
      if (!v) throw new ValidationError('Data wizyty jest wymagana');
      return dateWithMessage(BAD_VISIT_DATE)(v)!;
    }),
    visitType: z.string().nullish(),
    notes: z.string().nullish(),
    reminderSmsDate: reminderDate,
    reviewSmsDate: reviewDate,
  })
  .superRefine((data, ctx) => {
    if (data.reminderSmsDate && reminderAfterVisitDay(data.reminderSmsDate, data.visitDate)) {
      ctx.addIssue({ code: 'custom', message: REMINDER_BEFORE_VISIT });
    } else if (data.reviewSmsDate && data.reviewSmsDate <= data.visitDate) {
      ctx.addIssue({ code: 'custom', message: REVIEW_AFTER_VISIT });
    }
  });

// PATCH: brak pola = bez zmiany; pusta data SMS = wyczyść. Puste `visitDate` jest ignorowane.
// Kolejność dat względem zapisanej wizyty sprawdza handler (zależy od stanu w bazie).
export const updateVisitSchema = z.object({
  customerId: z.string().optional(),
  visitDate: fromValidator(dateWithMessage(BAD_VISIT_DATE), true),
  visitType: z.string().nullish(),
  notes: z.string().nullish(),
  reminderSmsDate: reminderDatePatch,
  reviewSmsDate: reviewDatePatch,
});

export const sendVisitSmsSchema = z.object({
  smsType: z.enum(['reminder', 'review'], { error: 'Typ SMS musi być "reminder" lub "review"' }),
});

// GET /api/visits: filtry w query string. `from` włącznie, `to` wyłącznie (ISO z datą i godziną).
// Bez parametrów zwraca wszystkie wizyty salonu. `page` + `pageSize` (domyślnie 50, max 200) włączają paginację.
const BAD_FROM = 'Nieprawidłowa data „from” (oczekiwano daty ISO z godziną)';
const BAD_TO = 'Nieprawidłowa data „to” (oczekiwano daty ISO z godziną)';
const BAD_CUSTOMER_ID = 'Nieprawidłowe ID klienta';

export const listVisitsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true, error: BAD_FROM }).transform((v) => new Date(v)).optional(),
  to: z.iso.datetime({ offset: true, error: BAD_TO }).transform((v) => new Date(v)).optional(),
  customerId: z.string({ error: BAD_CUSTOMER_ID }).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, BAD_CUSTOMER_ID).optional(),
  page: pageParam,
  pageSize: pageSizeParam,
});
