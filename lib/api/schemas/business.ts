import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const GOOGLE_URL_RE = /^https?:\/\/(www\.)?(g\.page|google\.com\/(maps|search)|goo\.gl)/i;
const BAD_URL = 'Nieprawidłowy format adresu URL Google Reviews';
const REQUIRED = 'Nazwa i URL Google Reviews są wymagane';

/** Ustawienia dostawcy SMS: zwykły obiekt JSON (np. token, nadawca). */
const smsConfig = z.custom<Prisma.InputJsonObject>(
  (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  'Nieprawidłowa konfiguracja dostawcy SMS',
);

// Dane zakładu do wydruków (wszystkie opcjonalne).
const printFields = {
  legalName: z.string().max(255).nullish(),
  street: z.string().max(255).nullish(),
  postalCode: z.string().max(10, 'Kod pocztowy: maks. 10 znaków').nullish(),
  city: z.string().max(100).nullish(),
  nip: z.string().max(20, 'NIP: maks. 20 znaków').nullish(),
};

const BAD_WINDOW = 'Okno wysyłki przypomnień: podaj godziny (od musi być wcześniej niż do)';
export const WINDOW_ORDER_ERROR = 'Godzina „od” musi być wcześniejsza niż „do”';
const windowMinute = z.number({ error: BAD_WINDOW }).int(BAD_WINDOW).min(0, BAD_WINDOW).max(1440, BAD_WINDOW);

export const createBusinessSchema = z.object({
  name: z.string({ error: REQUIRED }).min(1, REQUIRED),
  phone: z.string().nullish(),
  googleReviewUrl: z.string({ error: REQUIRED }).min(1, REQUIRED).regex(GOOGLE_URL_RE, BAD_URL),
  smsProvider: z.string().nullish(),
  smsConfig: smsConfig.nullish(),
  reminderSmsTemplate: z.string().nullish(),
  reviewSmsTemplate: z.string().nullish(),
  reminderWindowStart: windowMinute.optional(),
  reminderWindowEnd: windowMinute.optional(),
  autoReminders: z.boolean().optional(),
  ...printFields,
}).refine((b) => b.reminderWindowStart === undefined || b.reminderWindowEnd === undefined || b.reminderWindowStart < b.reminderWindowEnd, WINDOW_ORDER_ERROR);

// PATCH: brak pola = bez zmiany.
export const updateBusinessSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullish(),
  googleReviewUrl: z.string().optional().refine((v) => !v || GOOGLE_URL_RE.test(v), BAD_URL),
  smsProvider: z.string().optional(),
  smsConfig: smsConfig.optional(),
  reminderSmsTemplate: z.string().nullish(),
  reviewSmsTemplate: z.string().nullish(),
  reminderWindowStart: windowMinute.optional(),
  reminderWindowEnd: windowMinute.optional(),
  autoReminders: z.boolean().optional(),
  ...printFields,
}).refine((b) => b.reminderWindowStart === undefined || b.reminderWindowEnd === undefined || b.reminderWindowStart < b.reminderWindowEnd, WINDOW_ORDER_ERROR);
