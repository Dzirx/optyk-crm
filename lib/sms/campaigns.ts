// Kampanie SMS: wysyłka grupowa w tle z historią, statusem każdego odbiorcy i powodami błędów.
//
// Tworzenie (createCampaign) zapisuje kampanię i odbiorców w jednej transakcji i wraca od razu.
// Wysyłkę prowadzi processCampaign: wywołuje ją kickCampaign tuż po utworzeniu oraz
// runScheduledSms (harmonogram chmury, licznik Windows, endpoint crona) przez processCampaigns.
// Odbiorcy są rezerwowani atomowo (FOR UPDATE SKIP LOCKED), więc równoległe procesy
// nigdy nie wysyłają do tej samej osoby dwa razy. Rezerwacja starsza niż 5 min jest porzucona.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { activeUserWhere } from '@/lib/access';
import { ValidationError } from '@/lib/api/validation';
import { isUuid } from '@/lib/api/ownership';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import type { ISmsProvider } from '@/lib/sms/providers/interface';
import { sendSafely } from '@/lib/sms/delivery';
import { classifySmsFailure } from '@/lib/sms/failure-reason';
import { MAX_BULK_RECIPIENTS } from '@/lib/sms/limits';
import {
  CLAIM_BATCH_SIZE, KICK_BUDGET_MS, RUN_BUDGET_MS, SEND_CONCURRENCY, renderCampaignMessage, uniqueIds,
} from '@/lib/sms/campaign-helpers';
import type { Business } from '@/lib/api/handler';
import { smsGatewayConfigured } from '@/lib/sms/configured';

export type CampaignRow = Awaited<ReturnType<typeof db.smsCampaign.findFirstOrThrow>>;

export function serializeCampaign(c: CampaignRow) {
  return {
    id: c.id,
    message: c.message,
    status: c.status,
    total: c.total,
    sent: c.sent,
    failed: c.failed,
    createdAt: c.createdAt.toISOString(),
    startedAt: c.startedAt?.toISOString() ?? null,
    finishedAt: c.finishedAt?.toISOString() ?? null,
    failuresAcknowledgedAt: c.failuresAcknowledgedAt?.toISOString() ?? null,
  };
}

// --- Tworzenie -------------------------------------------------------------------------------------

interface CreateInput {
  message: string;
  customerIds: string[];
  idempotencyKey: string;
  userId?: string | null;
}

/**
 * Tworzy kampanię (status 'queued') z odbiorcami ze zgodą SMS. Ten sam klucz idempotencji
 * zwraca istniejącą kampanię (created=false) bez duplikatów.
 */
export async function createCampaign(
  business: Business,
  input: CreateInput,
): Promise<{ campaign: CampaignRow; created: boolean }> {
  const existing = await db.smsCampaign.findUnique({
    where: { businessId_idempotencyKey: { businessId: business.id, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) return { campaign: existing, created: false };

  const message = input.message.trim();
  if (!message) throw new ValidationError('Treść wiadomości jest wymagana');
  const ids = uniqueIds(input.customerIds);
  if (ids.length === 0) throw new ValidationError('Nie wybrano odbiorców');
  if (ids.length > MAX_BULK_RECIPIENTS) {
    throw new ValidationError(`Jednorazowo można wysłać SMS do najwyżej ${MAX_BULK_RECIPIENTS} odbiorców`);
  }
  if (!smsGatewayConfigured(business.smsProvider, business.smsConfig)) throw new ValidationError('Dostawca SMS nie jest skonfigurowany');

  // Tylko klienci tego salonu ze zgodą na SMS; obce i nieistniejące id są pomijane.
  const customers = await db.customer.findMany({
    where: { id: { in: ids.filter(isUuid) }, businessId: business.id, smsConsent: true },
    select: { id: true, name: true, surname: true, phone: true },
    orderBy: [{ surname: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });
  if (customers.length === 0) throw new ValidationError('Brak klientów z zgodą na SMS');

  try {
    const campaign = await db.$transaction(
      async (tx) => {
        const created = await tx.smsCampaign.create({
          data: {
            businessId: business.id,
            message,
            total: customers.length,
            createdByUserId: input.userId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await tx.smsCampaignRecipient.createMany({
          data: customers.map((c) => {
            const name = `${c.name} ${c.surname}`.trim();
            return {
              campaignId: created.id,
              customerId: c.id,
              customerName: name,
              phone: c.phone,
              renderedMessage: renderCampaignMessage(message, name, business.name),
            };
          }),
        });
        return created;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return { campaign, created: true };
  } catch (error) {
    // Równoległe żądanie z tym samym kluczem wygrało wyścig o unikalny klucz.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await db.smsCampaign.findUnique({
        where: { businessId_idempotencyKey: { businessId: business.id, idempotencyKey: input.idempotencyKey } },
      });
      if (winner) return { campaign: winner, created: false };
    }
    throw error;
  }
}

/** Uruchamia wysyłkę w tle bez blokowania odpowiedzi (błędy tylko w logu; bezpieczne dzięki rezerwacjom). */
export function kickCampaign(campaignId: string): void {
  void processCampaign(campaignId, { deadline: Date.now() + KICK_BUDGET_MS }).catch((error) => {
    console.error(`[SMS campaign ${campaignId}] Błąd wysyłki w tle:`, error);
  });
}

// --- Wysyłka ---------------------------------------------------------------------------------------

interface ClaimedRecipient {
  id: string;
  phone: string;
  renderedMessage: string | null;
}

/** Atomowo rezerwuje do `limit` odbiorców (oczekujących albo z porzuconą rezerwacją). */
async function claimBatch(campaignId: string, limit: number): Promise<ClaimedRecipient[]> {
  return db.$queryRaw<ClaimedRecipient[]>`
    UPDATE sms_campaign_recipients
       SET status = 'sending', claimed_at = (now() AT TIME ZONE 'UTC')
     WHERE id IN (
       SELECT id FROM sms_campaign_recipients
        WHERE campaign_id = ${campaignId}::uuid
          AND (status = 'pending'
               OR (status = 'sending' AND claimed_at < (now() AT TIME ZONE 'UTC') - interval '5 minutes'))
        ORDER BY customer_name, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, phone, rendered_message AS "renderedMessage"`;
}

/** Zapisuje wynik odbiorcy i zwiększa licznik kampanii w jednej transakcji (tylko raz na odbiorcę). */
async function finishRecipient(
  campaignId: string,
  recipientId: string,
  result: { ok: true; messageId?: string; cost?: number } | { ok: false; error: string },
): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const res = result.ok
      ? await tx.smsCampaignRecipient.updateMany({
          where: { id: recipientId, status: 'sending' },
          data: {
            status: 'sent', sentAt: now, errorMessage: null, reasonCode: null,
            providerMessageId: result.messageId != null ? String(result.messageId).slice(0, 255) : null,
            cost: typeof result.cost === 'number' ? result.cost : null,
          },
        })
      : await tx.smsCampaignRecipient.updateMany({
          where: { id: recipientId, status: 'sending' },
          data: { status: 'failed', errorMessage: result.error, reasonCode: classifySmsFailure(result.error).code },
        });
    if (res.count === 1) {
      await tx.smsCampaign.update({
        where: { id: campaignId },
        data: result.ok ? { sent: { increment: 1 } } : { failed: { increment: 1 } },
      });
    }
  });
}

/** Oznacza wszystkich jeszcze oczekujących odbiorców jako nieudanych z jednym powodem (błąd bramki). */
async function failAllPending(campaignId: string, error: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const res = await tx.smsCampaignRecipient.updateMany({
      where: { campaignId, status: 'pending' },
      data: { status: 'failed', errorMessage: error, reasonCode: classifySmsFailure(error).code },
    });
    if (res.count > 0) await tx.smsCampaign.update({ where: { id: campaignId }, data: { failed: { increment: res.count } } });
    return res.count;
  });
}

/** Kończy kampanię, gdy nikt już nie czeka ani nie jest w trakcie wysyłki. */
async function finishIfDone(campaignId: string): Promise<boolean> {
  const open = await db.smsCampaignRecipient.count({ where: { campaignId, status: { in: ['pending', 'sending'] } } });
  if (open > 0) return false;
  await db.smsCampaign.updateMany({
    where: { id: campaignId, status: { in: ['queued', 'sending'] } },
    data: { status: 'done', finishedAt: new Date() },
  });
  return true;
}

export interface ProcessResult {
  sent: number;
  failed: number;
  /** false = przerwano z powodu limitu czasu albo liczby; kampania jest w toku. */
  finished: boolean;
}

interface ProcessOptions {
  /** Moment (ms epoch), po którym nie pobieramy kolejnych partii. */
  deadline?: number;
  /** Najwyżej tylu odbiorców w tym uruchomieniu. */
  maxRecipients?: number;
}

/** Wysyła oczekujących odbiorców jednej kampanii. Bezpieczne przy równoległych wywołaniach. */
export async function processCampaign(campaignId: string, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const deadline = opts.deadline ?? Date.now() + RUN_BUDGET_MS;
  const maxRecipients = opts.maxRecipients ?? Infinity;
  const out: ProcessResult = { sent: 0, failed: 0, finished: false };

  // Salony po końcu okresu próbnego nie wysyłają SMS (jak zaplanowane SMS-y).
  const campaign = await db.smsCampaign.findFirst({
    where: { id: campaignId, status: { in: ['queued', 'sending'] }, business: { user: activeUserWhere(new Date()) } },
    include: { business: { select: { name: true, smsProvider: true, smsConfig: true } } },
  });
  if (!campaign) return out;
  const { business } = campaign;

  let provider: ISmsProvider | null = null;
  let configError: string | null = null;
  try {
    if (!smsGatewayConfigured(business.smsProvider, business.smsConfig)) throw new Error('Business SMS provider not configured');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider = SmsProviderFactory.create(business.smsProvider as any, business.smsConfig as any);
  } catch (error) {
    configError = error instanceof Error ? error.message : 'Provider creation failed';
  }

  await db.smsCampaign.updateMany({
    where: { id: campaignId, status: 'queued' },
    data: { status: 'sending', startedAt: new Date() },
  });

  if (configError) {
    // Błąd konfiguracji bramki: nie próbujemy każdego odbiorcy osobno.
    const n = await failAllPending(campaignId, configError);
    out.failed += n;
    out.finished = await finishIfDone(campaignId);
    return out;
  }

  let processed = 0;
  let gatewayError: string | null = null;
  while (Date.now() < deadline && processed < maxRecipients && !gatewayError) {
    const batch = await claimBatch(campaignId, Math.min(CLAIM_BATCH_SIZE, maxRecipients - processed));
    if (batch.length === 0) break;
    processed += batch.length;

    // Mała pula równoległych wysyłek w partii.
    let next = 0;
    const worker = async () => {
      while (next < batch.length) {
        const r = batch[next++];
        if (gatewayError) {
          await finishRecipient(campaignId, r.id, { ok: false, error: gatewayError });
          out.failed++;
          continue;
        }
        const message = r.renderedMessage ?? renderCampaignMessage(campaign.message, '', business.name);
        const res = await sendSafely(provider!, r.phone, message);
        if (res.success) {
          await finishRecipient(campaignId, r.id, { ok: true, messageId: res.messageId, cost: res.cost });
          out.sent++;
        } else {
          const error = res.error || 'Nieznany błąd';
          await finishRecipient(campaignId, r.id, { ok: false, error });
          out.failed++;
          if (classifySmsFailure(error).gateway) gatewayError = error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, batch.length) }, worker));
  }

  if (gatewayError) out.failed += await failAllPending(campaignId, gatewayError);
  out.finished = await finishIfDone(campaignId);
  return out;
}

/**
 * Prowadzi wszystkie kampanie w toku (od najstarszej). Wywołuje to runScheduledSms.
 * Jedno uruchomienie ma limit czasu (domyślnie ~2 min) i liczby odbiorców; resztę dokończy następne.
 */
export async function processCampaigns(opts: { maxPerRun?: number; budgetMs?: number } = {}) {
  const maxPerRun = opts.maxPerRun ?? 2000;
  const deadline = Date.now() + (opts.budgetMs ?? RUN_BUDGET_MS);
  const campaigns = await db.smsCampaign.findMany({
    where: { status: { in: ['queued', 'sending'] }, business: { user: activeUserWhere(new Date()) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const total = { campaigns: campaigns.length, sent: 0, failed: 0, finished: 0 };
  let left = maxPerRun;
  for (const { id } of campaigns) {
    if (Date.now() >= deadline || left <= 0) break;
    try {
      const r = await processCampaign(id, { deadline, maxRecipients: left });
      total.sent += r.sent;
      total.failed += r.failed;
      if (r.finished) total.finished++;
      left -= r.sent + r.failed;
    } catch (error) {
      console.error(`[SMS campaign ${id}] Błąd przetwarzania:`, error);
    }
  }
  return total;
}

// --- Anulowanie i ponowienie -----------------------------------------------------------------------

/** Anuluje kampanię w toku: oczekujący odbiorcy → 'cancelled'. Zwraca false, gdy kampania nie jest w toku. */
export async function cancelCampaign(businessId: string, campaignId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const res = await tx.smsCampaign.updateMany({
      where: { id: campaignId, businessId, status: { in: ['queued', 'sending'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    if (res.count !== 1) return false;
    await tx.smsCampaignRecipient.updateMany({ where: { campaignId, status: 'pending' }, data: { status: 'cancelled' } });
    return true;
  });
}

interface RetryOptions {
  /** Tylko wskazani odbiorcy (muszą być nieudanymi odbiorcami tej kampanii); brak = wszyscy nieudani. */
  recipientIds?: string[];
}

/** Nieudani odbiorcy do ponowienia; null = nie ma takiej kampanii w salonie. Zły wybór → ValidationError. */
async function collectFailed(businessId: string, campaignId: string, opts: RetryOptions) {
  const source = await db.smsCampaign.findFirst({ where: { id: campaignId, businessId } });
  if (!source) return null;
  const wanted = opts.recipientIds ? uniqueIds(opts.recipientIds) : null;
  if (wanted && !wanted.every(isUuid)) throw new ValidationError('Nieprawidłowy odbiorca do ponowienia');
  const failed = await db.smsCampaignRecipient.findMany({
    where: { campaignId, status: 'failed', ...(wanted ? { id: { in: wanted } } : {}) },
    select: { customerId: true },
  });
  if (wanted && failed.length !== wanted.length) {
    throw new ValidationError('Wybrani odbiorcy nie są nieudanymi odbiorcami tej wysyłki');
  }
  if (failed.length === 0) throw new ValidationError('Brak nieudanych odbiorców do ponowienia');
  const ids = failed.map((f) => f.customerId).filter((id): id is string => !!id);
  return { source, ids, requested: failed.length };
}

/** Podgląd ponowienia: ilu odbiorców dostanie SMS, a ilu pominięto (usunięci klienci albo bez zgody na SMS). */
export async function previewRetry(business: Business, campaignId: string, opts: RetryOptions = {}) {
  const found = await collectFailed(business.id, campaignId, opts);
  if (!found) return null;
  const count = await db.customer.count({ where: { id: { in: found.ids }, businessId: business.id, smsConsent: true } });
  return { count, skipped: found.requested - count };
}

/** Nowa kampania tylko z nieudanymi odbiorcami (ta sama treść); zgoda i dane klientów sprawdzane od nowa. */
export async function retryFailed(business: Business, campaignId: string, idempotencyKey: string, userId?: string, opts: RetryOptions = {}) {
  const found = await collectFailed(business.id, campaignId, opts);
  if (!found) return null;
  if (found.ids.length === 0) throw new ValidationError('Brak odbiorców z zgodą na SMS do ponowienia');
  const res = await createCampaign(business, { message: found.source.message, customerIds: found.ids, idempotencyKey, userId });
  return { ...res, skipped: found.requested - res.campaign.total };
}
