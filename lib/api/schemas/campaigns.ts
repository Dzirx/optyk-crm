import { z } from 'zod';
import { MAX_BULK_RECIPIENTS } from '@/lib/sms/limits';
import { isValidIdempotencyKey, RECIPIENT_STATUSES } from '@/lib/sms/campaign-helpers';
import { pageParam } from './common';

const KEY_BAD = 'Nieprawidłowy klucz idempotencji (8–64 znaków: litery, cyfry, „-”, „_”)';

const idempotencyKey = z
  .string({ error: KEY_BAD })
  .refine((v) => isValidIdempotencyKey(v), KEY_BAD);

export const createCampaignSchema = z.object({
  message: z
    .string({ error: 'Treść wiadomości jest wymagana' })
    .refine((v) => v.trim().length > 0, 'Treść wiadomości jest wymagana')
    .refine((v) => v.length <= 1000, 'Treść wiadomości może mieć najwyżej 1000 znaków'),
  customerIds: z
    .array(z.string(), { error: 'Nie wybrano odbiorców' })
    .min(1, 'Nie wybrano odbiorców')
    .max(MAX_BULK_RECIPIENTS, `Jednorazowo można wysłać SMS do najwyżej ${MAX_BULK_RECIPIENTS} odbiorców`),
  idempotencyKey,
});

export const retryCampaignSchema = z.object({
  idempotencyKey,
  recipientIds: z.array(z.string()).min(1, 'Nie wybrano odbiorców').max(MAX_BULK_RECIPIENTS).optional(),
  /** Tylko policz: ilu odbiorców dostanie SMS i ilu pominięto (nic nie tworzy). */
  dryRun: z.boolean().optional(),
});

const BAD_STATUS = 'Nieprawidłowy status odbiorcy';

export const campaignDetailQuerySchema = z.object({
  page: pageParam,
  status: z.enum(RECIPIENT_STATUSES, { error: BAD_STATUS }).optional(),
});

export const campaignListQuerySchema = z.object({ page: pageParam });
