// Bezpieczna wysyłka SMS dla wizyt: najwyżej jeden SMS danego typu na wizytę.
//
// Kolejność: 1) rezerwacja (status → sent atomowo), 2) wysyłka, 3) przy błędzie status → failed,
// 4) log. Zapis logu nigdy nie blokuje statusu — inaczej status zostawał „pending”
// i cron wysyłał ten sam SMS przy każdym uruchomieniu.

import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { SMS_SEND_TIMEOUT_MS, SMS_TIMEOUT_ERROR, type ISmsProvider, type SmsResult } from './providers/interface';

export type VisitSmsType = 'reminder' | 'review';

/**
 * Rezerwuje wysyłkę SMS dla wizyty. Zwraca false, gdy SMS jest już wysłany
 * albo zarezerwowany przez inny proces (np. równoległe uruchomienie crona).
 *
 * mode 'pending' — tylko zaplanowane (cron); 'notSent' — każdy status oprócz 'sent' (wysyłka ręczna).
 */
export async function claimVisitSms(visitId: string, type: VisitSmsType, mode: 'pending' | 'notSent'): Promise<boolean> {
  const now = new Date();
  let where: Prisma.VisitWhereInput;
  let data: Prisma.VisitUpdateManyMutationInput;

  if (type === 'reminder') {
    where =
      mode === 'pending'
        ? { id: visitId, reminderSmsStatus: 'pending' }
        : { id: visitId, OR: [{ reminderSmsStatus: { not: 'sent' } }, { reminderSmsStatus: null }] };
    data = { reminderSmsStatus: 'sent', reminderSmsSentAt: now };
  } else {
    where =
      mode === 'pending'
        ? { id: visitId, reviewSmsStatus: 'pending' }
        : { id: visitId, OR: [{ reviewSmsStatus: { not: 'sent' } }, { reviewSmsStatus: null }] };
    data = { reviewSmsStatus: 'sent', reviewSmsSentAt: now };
  }

  const res = await db.visit.updateMany({ where, data });
  return res.count === 1;
}

/** Oznacza SMS wizyty jako nieudany (po rezerwacji, gdy dostawca zwrócił błąd). */
export async function markVisitSmsFailed(visitId: string, type: VisitSmsType): Promise<void> {
  await db.visit.update({
    where: { id: visitId },
    data:
      type === 'reminder'
        ? { reminderSmsStatus: 'failed', reminderSmsSentAt: null }
        : { reviewSmsStatus: 'failed', reviewSmsSentAt: null },
  });
}

/**
 * Wysyłka, która nigdy nie rzuca wyjątku — błąd zawsze wraca jako { success: false }.
 * Twardy limit czasu (SMS_SEND_TIMEOUT_MS) działa też, gdy dostawca nie przerwie żądania sam.
 * Przekroczenie limitu to błąd bez ponawiania: bramka mogła już dostarczyć wiadomość.
 */
export async function sendSafely(provider: ISmsProvider, phone: string, message: string, timeoutMs = SMS_SEND_TIMEOUT_MS): Promise<SmsResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<SmsResult>((resolve) => {
      timer = setTimeout(() => resolve({ success: false, error: SMS_TIMEOUT_ERROR }), timeoutMs + 1000);
    });
    const send = provider.sendSms(phone, message).then((r) => r ?? { success: false, error: 'Brak odpowiedzi dostawcy SMS' });
    // Spóźniony wynik (po limicie) jest ignorowany, ale jego błąd nie może zostać nieobsłużony.
    send.catch(() => undefined);
    return await Promise.race([send, timeout]);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Nieznany błąd wysyłki' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Kolumna sms_logs.cost jest typu Int, a SMSAPI zwraca koszt w punktach jako ułamek (np. 0.16).
 * Zmiana typu kolumny blokuje `prisma db push` w entrypoint.sh, gdy tabela ma dane,
 * więc zapisujemy koszt tylko wtedy, gdy jest liczbą całkowitą.
 */
function costForDb(cost: unknown): number | null {
  return typeof cost === 'number' && Number.isInteger(cost) ? cost : null;
}

interface SmsLogEntry {
  smsType: VisitSmsType;
  phone: string;
  message: string;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
  messageId?: string | null;
  cost?: unknown;
}

/** Zapis do historii SMS. Błąd zapisu tylko w logach serwera — nie przerywa wysyłki. */
async function writeSmsLog(target: { visitId: string } | { workOrderId: string }, entry: SmsLogEntry): Promise<void> {
  try {
    await db.smsLog.create({
      data: {
        ...target,
        smsType: entry.smsType,
        phone: entry.phone,
        message: entry.message,
        status: entry.status,
        errorMessage: entry.errorMessage ?? null,
        smsapiMessageId: entry.messageId != null ? String(entry.messageId) : null,
        cost: costForDb(entry.cost),
      },
    });
  } catch (error) {
    console.error(`[SMS] Nie udało się zapisać logu SMS (${JSON.stringify(target)}):`, error);
  }
}

export const logVisitSms = (entry: SmsLogEntry & { visitId: string }) => writeSmsLog({ visitId: entry.visitId }, entry);

/** Log SMS z prośbą o opinię wysłanego ze zlecenia (smsType zawsze 'review'). */
export const logWorkOrderSms = (entry: Omit<SmsLogEntry, 'smsType'> & { workOrderId: string }) =>
  writeSmsLog({ workOrderId: entry.workOrderId }, { ...entry, smsType: 'review' });

// --- Ręczna wysyłka prośby o opinię (wizyta / zlecenie) -------------------------------------------
// Przycisk jest zawsze dostępny (także po 'sent'), więc rezerwacja jest przejściowym stanem 'sending':
// compare-and-set na (status, czas) odczytanych przed wysyłką. Równoległe żądania widzą 'sending'
// albo inny czas i dostają 409. Porzucone 'sending' (awaria między rezerwacją a wynikiem) starsze niż
// 2 minuty można zarezerwować ponownie. W 'sending' czas oznacza chwilę rezerwacji.

export const REVIEW_CLAIM_STALE_MS = 2 * 60 * 1000;

export interface ReviewPrev {
  status: 'pending' | 'sent' | 'failed' | 'sending' | null;
  sentAt: Date | null;
}

/** Czy świeża rezerwacja innego żądania nadal trwa (wtedy odpowiadamy 409 bez próby rezerwacji). */
export function reviewClaimInFlight(prev: ReviewPrev, now = Date.now()): boolean {
  return prev.status === 'sending' && !!prev.sentAt && now - prev.sentAt.getTime() < REVIEW_CLAIM_STALE_MS;
}

/** Czas w kolumnie ma mikrosekundy, JS milisekundy — porównujemy w zakresie 1 ms. */
export function sentAtWhere(prev: Date | null): null | { gte: Date; lt: Date } {
  return prev ? { gte: prev, lt: new Date(prev.getTime() + 1) } : null;
}

/** Stan po zakończeniu: sukces → 'sent' + nowy czas; błąd → poprzednie 'sent' albo 'failed'. */
function reviewOutcome(ok: boolean, prev: ReviewPrev) {
  if (ok) return { reviewSmsStatus: 'sent' as const, reviewSmsSentAt: new Date() };
  if (prev.status === 'sent') return { reviewSmsStatus: 'sent' as const, reviewSmsSentAt: prev.sentAt };
  return { reviewSmsStatus: 'failed' as const, reviewSmsSentAt: null };
}

export async function claimVisitReview(visitId: string, prev: ReviewPrev): Promise<boolean> {
  if (reviewClaimInFlight(prev)) return false;
  const res = await db.visit.updateMany({
    where: { id: visitId, reviewSmsStatus: prev.status, reviewSmsSentAt: sentAtWhere(prev.sentAt) },
    data: { reviewSmsStatus: 'sending', reviewSmsSentAt: new Date() },
  });
  return res.count === 1;
}

export async function finishVisitReview(visitId: string, ok: boolean, prev: ReviewPrev): Promise<void> {
  await db.visit.update({ where: { id: visitId }, data: reviewOutcome(ok, prev) });
}

export async function claimOrderReview(orderId: string, businessId: string, prev: ReviewPrev): Promise<boolean> {
  if (reviewClaimInFlight(prev)) return false;
  const res = await db.workOrder.updateMany({
    where: { id: orderId, businessId, reviewSmsStatus: prev.status ?? undefined, reviewSmsSentAt: sentAtWhere(prev.sentAt) },
    data: { reviewSmsStatus: 'sending', reviewSmsSentAt: new Date() },
  });
  return res.count === 1;
}

export async function finishOrderReview(orderId: string, ok: boolean, prev: ReviewPrev): Promise<void> {
  await db.workOrder.update({ where: { id: orderId }, data: reviewOutcome(ok, prev) });
}
