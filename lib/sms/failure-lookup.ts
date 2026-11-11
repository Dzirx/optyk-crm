// Powód ostatniego nieudanego SMS dla list wizyt i zleceń (jedno zapytanie na stronę, bez N+1).

import { db } from '@/lib/db';
import { classifySmsFailure, type SmsFailureCode } from '@/lib/sms/failure-reason';

export interface SmsFailureInfo {
  reasonCode: SmsFailureCode;
  reason: string;
  /** Problem konfiguracji (bramka, szablon, klucz) — salon naprawia go w Ustawieniach. */
  isConfig: boolean;
  at: string;
}

type Kind = 'reminder' | 'review';

function toInfo(errorMessage: string | null, sentAt: Date): SmsFailureInfo {
  const f = classifySmsFailure(errorMessage);
  return { reasonCode: f.code, reason: f.reason, isConfig: f.gateway, at: sentAt.toISOString() };
}

/** Dodaje `reminderSmsFailure` / `reviewSmsFailure` (null, gdy status nie jest 'failed' albo brak logu). */
export async function withVisitSmsFailures<
  V extends { id: string; reminderSmsStatus: string | null; reviewSmsStatus: string | null },
>(visits: V[]): Promise<Array<V & { reminderSmsFailure: SmsFailureInfo | null; reviewSmsFailure: SmsFailureInfo | null }>> {
  const failed = visits.filter((v) => v.reminderSmsStatus === 'failed' || v.reviewSmsStatus === 'failed');
  const latest = new Map<string, SmsFailureInfo>();
  if (failed.length > 0) {
    const logs = await db.smsLog.findMany({
      where: { status: 'failed', visitId: { in: failed.map((v) => v.id) } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      distinct: ['visitId', 'smsType'],
      select: { visitId: true, smsType: true, errorMessage: true, sentAt: true },
    });
    for (const l of logs) if (l.visitId) latest.set(`${l.visitId}:${l.smsType}`, toInfo(l.errorMessage, l.sentAt));
  }
  const pick = (v: V, kind: Kind, status: string | null) => (status === 'failed' ? latest.get(`${v.id}:${kind}`) ?? null : null);
  return visits.map((v) => ({
    ...v,
    reminderSmsFailure: pick(v, 'reminder', v.reminderSmsStatus),
    reviewSmsFailure: pick(v, 'review', v.reviewSmsStatus),
  }));
}

export async function withOrderSmsFailures<O extends { id: string; reviewSmsStatus: string | null }>(
  orders: O[],
): Promise<Array<O & { reviewSmsFailure: SmsFailureInfo | null }>> {
  const failed = orders.filter((o) => o.reviewSmsStatus === 'failed');
  const latest = new Map<string, SmsFailureInfo>();
  if (failed.length > 0) {
    const logs = await db.smsLog.findMany({
      where: { status: 'failed', smsType: 'review', workOrderId: { in: failed.map((o) => o.id) } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      distinct: ['workOrderId'],
      select: { workOrderId: true, errorMessage: true, sentAt: true },
    });
    for (const l of logs) if (l.workOrderId) latest.set(l.workOrderId, toInfo(l.errorMessage, l.sentAt));
  }
  return orders.map((o) => ({ ...o, reviewSmsFailure: o.reviewSmsStatus === 'failed' ? latest.get(o.id) ?? null : null }));
}
