import { z } from 'zod';

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
