// Bezpieczna wysyłka SMS dla wizyt: najwyżej jeden SMS danego typu na wizytę.
//
// Kolejność: 1) rezerwacja (status → sent atomowo), 2) wysyłka, 3) przy błędzie status → failed,
// 4) log. Zapis logu nigdy nie blokuje statusu — inaczej status zostawał „pending”
// i cron wysyłał ten sam SMS przy każdym uruchomieniu.

import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { ISmsProvider, SmsResult } from './providers/interface';

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

/** Wysyłka, która nigdy nie rzuca wyjątku — błąd zawsze wraca jako { success: false }. */
export async function sendSafely(provider: ISmsProvider, phone: string, message: string): Promise<SmsResult> {
  try {
    const result = await provider.sendSms(phone, message);
    return result ?? { success: false, error: 'Brak odpowiedzi dostawcy SMS' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Nieznany błąd wysyłki' };
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

/** Zapis do historii SMS. Błąd zapisu tylko w logach serwera — nie przerywa wysyłki. */
export async function logVisitSms(entry: {
  visitId: string;
  smsType: VisitSmsType;
  phone: string;
  message: string;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
  messageId?: string | null;
  cost?: unknown;
}): Promise<void> {
  try {
    await db.smsLog.create({
      data: {
        visitId: entry.visitId,
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
    console.error(`[SMS] Nie udało się zapisać logu SMS dla wizyty ${entry.visitId}:`, error);
  }
}
