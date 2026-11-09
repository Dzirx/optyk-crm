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

export const createBusinessSchema = z.object({
  name: z.string({ error: REQUIRED }).min(1, REQUIRED),
  phone: z.string().nullish(),
  googleReviewUrl: z.string({ error: REQUIRED }).min(1, REQUIRED).regex(GOOGLE_URL_RE, BAD_URL),
  smsProvider: z.string().nullish(),
  smsConfig: smsConfig.nullish(),
  reminderSmsTemplate: z.string().nullish(),
  reviewSmsTemplate: z.string().nullish(),
});

// PATCH: brak pola = bez zmiany.
export const updateBusinessSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullish(),
  googleReviewUrl: z.string().optional().refine((v) => !v || GOOGLE_URL_RE.test(v), BAD_URL),
  smsProvider: z.string().optional(),
  smsConfig: smsConfig.optional(),
  reminderSmsTemplate: z.string().nullish(),
  reviewSmsTemplate: z.string().nullish(),
});
