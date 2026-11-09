import { z } from 'zod';
import { ValidationError } from '@/lib/api/validation';
import { dateWithMessage, fromValidator } from './common';

const BAD_VISIT_DATE = 'Nieprawidłowa data wizyty';
const BAD_REMINDER_DATE = 'Nieprawidłowa data SMS z przypomnieniem';
const BAD_REVIEW_DATE = 'Nieprawidłowa data SMS z prośbą o opinię';
export const REMINDER_BEFORE_VISIT = 'Data SMS z przypomnieniem powinna być przed datą wizyty';
export const REVIEW_AFTER_VISIT = 'Data SMS z prośbą o opinię powinna być po dacie wizyty';

const reminderDate = fromValidator(dateWithMessage(BAD_REMINDER_DATE));
const reviewDate = fromValidator(dateWithMessage(BAD_REVIEW_DATE));
const reminderDatePatch = fromValidator(dateWithMessage(BAD_REMINDER_DATE), true);
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
    if (data.reminderSmsDate && data.reminderSmsDate >= data.visitDate) {
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
// Bez parametrów zwraca wszystkie wizyty salonu.
const BAD_FROM = 'Nieprawidłowa data „from” (oczekiwano daty ISO z godziną)';
const BAD_TO = 'Nieprawidłowa data „to” (oczekiwano daty ISO z godziną)';
const BAD_CUSTOMER_ID = 'Nieprawidłowe ID klienta';

export const listVisitsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true, error: BAD_FROM }).transform((v) => new Date(v)).optional(),
  to: z.iso.datetime({ offset: true, error: BAD_TO }).transform((v) => new Date(v)).optional(),
  customerId: z.string({ error: BAD_CUSTOMER_ID }).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, BAD_CUSTOMER_ID).optional(),
});
