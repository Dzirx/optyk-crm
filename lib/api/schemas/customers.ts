import { z } from 'zod';
import { isIsoDay } from '@/lib/time';
import { pageParam, pageSizeParam, searchParam } from './common';

const REQUIRED = 'Imię, nazwisko i telefon są wymagane';
const PHONE_RE = /^\+?[1-9]\d{1,14}$/; // E.164
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_SHORT = 'Imię musi mieć co najmniej 2 znaki';
const SURNAME_SHORT = 'Nazwisko musi mieć co najmniej 2 znaki';
const EMAIL_BAD = 'Nieprawidłowy adres e-mail';

const email = z
  .string()
  .nullish()
  .refine((v) => !v || EMAIL_RE.test(v), EMAIL_BAD);

export const createCustomerSchema = z.object({
  name: z.string({ error: REQUIRED }).min(1, REQUIRED).min(2, NAME_SHORT),
  surname: z.string({ error: REQUIRED }).min(1, REQUIRED).min(2, SURNAME_SHORT),
  phone: z
    .string({ error: REQUIRED })
    .min(1, REQUIRED)
    .regex(PHONE_RE, 'Nieprawidłowy numer telefonu. Użyj formatu E.164 (np. +48123456789)'),
  email,
  smsConsent: z.boolean().optional(),
});

// PATCH: puste pola (name, surname, phone) oznaczają „bez zmiany”.
export const updateCustomerSchema = z.object({
  name: z.string().nullish().refine((v) => !v || v.length >= 2, NAME_SHORT),
  surname: z.string().nullish().refine((v) => !v || v.length >= 2, SURNAME_SHORT),
  phone: z.string().nullish().refine((v) => !v || PHONE_RE.test(v), 'Nieprawidłowy numer telefonu'),
  email,
  smsConsent: z.boolean().optional(),
});

// GET /api/customers: bez `page` zwraca całą listę (stary kształt), z `page` jedną stronę.
// `visitRanges`, `visitFrom`, `visitTo`, `sort`: patrz lib/customers/list-filter.ts.
// `smsConsent` zawęża listę (zakładki „ze zgodą” / „bez zgody”); `withVisits=1` dodaje tablicę wizyt.
export const listCustomersQuerySchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam,
  q: searchParam,
  smsConsent: z.enum(['true', 'false'], { error: 'Nieprawidłowa wartość „smsConsent” (true lub false)' }).optional(),
  withVisits: z.string().optional(),
  // Filtry strony wiadomości: przedziały liczby wizyt („0,2”), wizyta w dniach od–do, sortowanie.
  visitRanges: z.string().regex(/^[0-3](,[0-3]){0,3}$/, 'Nieprawidłowa wartość „visitRanges” (np. 0,2)').optional(),
  visitFrom: dayParam('visitFrom'),
  visitTo: dayParam('visitTo'),
  sort: z
    .enum(['name-asc', 'name-desc', 'visits-desc', 'visits-asc', 'date-desc', 'date-asc'], { error: 'Nieprawidłowa wartość „sort”' })
    .optional(),
});

function dayParam(name: string) {
  return z
    .string()
    .refine(isIsoDay, `Nieprawidłowa data „${name}” (oczekiwano yyyy-mm-dd)`)
    .optional();
}
