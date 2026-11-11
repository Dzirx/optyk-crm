// Powiadomienia o nieudanych SMS-ach salonu (dzwonek w panelu).
// Źródło: sms_logs ze statusem 'failed' z ostatnich 30 dni, tylko nierozwiązane
// (status SMS na wizycie albo zleceniu nadal 'failed'). Brak zgody klienta pomijamy — to oczekiwane.
// Problemy konfiguracji bramki zbieramy w jeden wpis 'sms_gateway'.

import { db } from '@/lib/db';
import { classifySmsFailure, failureReasonFor, type SmsFailureCode } from '@/lib/sms/failure-reason';
import { todayIso } from '@/lib/time';

const DAYS = 30;
const MAX_ITEMS = 50;
const MAX_LOGS = 500;
export const GATEWAY_ID = 'gateway';
export const CAMPAIGN_PREFIX = 'campaign:';

export interface NotificationItem {
  id: string;
  kind: 'sms_failed' | 'sms_gateway' | 'sms_campaign';
  createdAt: string;
  /** Brak dla wpisu kampanii i dla wpisu bramki zbudowanego tylko z kampanii. */
  customerName?: string;
  phone?: string;
  smsType?: 'reminder' | 'review';
  reason: string;
  reasonCode: SmsFailureCode;
  /** Skąd wysłano SMS: wizyta albo zlecenie (tylko prośba o opinię). */
  target?: 'visit' | 'work_order';
  customerId?: string;
  /** Wysyłka grupowa (kind 'sms_campaign'): id kampanii, liczba odbiorców, a w `count` liczba nieudanych. */
  campaignId?: string;
  campaignTotal?: number;
  visitId?: string;
  visitDate?: string;
  /** Dzień wizyty (yyyy-mm-dd, strefa salonu) — do linku /visits?day=. */
  visitDay?: string;
  workOrderId?: string;
  orderNumber?: string;
  read: boolean;
  count?: number;
}

export async function listSmsFailureNotifications(businessId: string) {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const [campaigns, visitLogs, orderLogs] = await Promise.all([
    db.smsCampaign.findMany({
      where: { businessId, failed: { gt: 0 }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, total: true, failed: true, createdAt: true, finishedAt: true, failuresAcknowledgedAt: true, gatewayAcknowledgedAt: true },
    }),
    db.smsLog.findMany({
      where: { status: 'failed', sentAt: { gte: since }, visit: { customer: { businessId } } },
      orderBy: { sentAt: 'desc' },
      take: MAX_LOGS,
      select: {
        id: true, smsType: true, phone: true, errorMessage: true, sentAt: true, acknowledgedAt: true,
        visit: {
          select: {
            id: true, customerId: true, visitDate: true, reminderSmsStatus: true, reviewSmsStatus: true,
            customer: { select: { name: true, surname: true } },
          },
        },
      },
    }),
    db.smsLog.findMany({
      where: { status: 'failed', sentAt: { gte: since }, workOrder: { businessId } },
      orderBy: { sentAt: 'desc' },
      take: MAX_LOGS,
      select: {
        id: true, smsType: true, phone: true, errorMessage: true, sentAt: true, acknowledgedAt: true,
        workOrder: {
          select: {
            id: true, customerId: true, orderNumber: true, reviewSmsStatus: true,
            customer: { select: { name: true, surname: true } },
          },
        },
      },
    }),
  ]);

  // Jeden wspólny, posortowany strumień wpisów (wizyty i zlecenia).
  type Entry = { log: { id: string; smsType: 'reminder' | 'review'; phone: string; errorMessage: string | null; sentAt: Date; acknowledgedAt: Date | null }; key: string; resolved: boolean; base: Partial<NotificationItem> & { customerName: string; customerId: string; target: NotificationItem['target'] } };
  const entries: Entry[] = [];
  for (const log of visitLogs) {
    if (!log.visit) continue;
    const v = log.visit;
    const status = log.smsType === 'reminder' ? v.reminderSmsStatus : v.reviewSmsStatus;
    entries.push({
      log, key: `v:${v.id}:${log.smsType}`, resolved: status !== 'failed',
      base: {
        target: 'visit', customerId: v.customerId, customerName: `${v.customer.name} ${v.customer.surname}`.trim(),
        visitId: v.id, visitDate: v.visitDate.toISOString(), visitDay: todayIso(v.visitDate),
      },
    });
  }
  for (const log of orderLogs) {
    if (!log.workOrder) continue;
    const o = log.workOrder;
    entries.push({
      log, key: `o:${o.id}:${log.smsType}`, resolved: o.reviewSmsStatus !== 'failed',
      base: {
        target: 'work_order', customerId: o.customerId, customerName: `${o.customer.name} ${o.customer.surname}`.trim(),
        workOrderId: o.id, orderNumber: o.orderNumber,
      },
    });
  }
  entries.sort((a, b) => b.log.sentAt.getTime() - a.log.sentAt.getTime());

  // Najnowszy log na parę rekord + typ; wcześniejsze próby są już nieaktualne.
  const seen = new Set<string>();
  const items: NotificationItem[] = [];
  const gateway: NotificationItem[] = [];
  for (const { log, key, resolved, base } of entries) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (resolved) continue;
    const failure = classifySmsFailure(log.errorMessage);
    if (failure.code === 'consent') continue;
    const item: NotificationItem = {
      id: log.id,
      kind: failure.gateway ? 'sms_gateway' : 'sms_failed',
      createdAt: log.sentAt.toISOString(),
      phone: log.phone,
      smsType: log.smsType,
      reason: failure.reason,
      reasonCode: failure.code,
      read: log.acknowledgedAt !== null,
      ...base,
    };
    (failure.gateway ? gateway : items).push(item);
  }


  // Wysyłki grupowe: jeden wpis na kampanię z nieudanymi odbiorcami; błędy bramki idą do wpisu bramki.
  const campaignGateway: Array<{ id: string; at: Date; read: boolean; count: number; code: SmsFailureCode; reason: string }> = [];
  if (campaigns.length > 0) {
    const grouped = await db.smsCampaignRecipient.groupBy({
      by: ['campaignId', 'reasonCode'],
      where: { campaignId: { in: campaigns.map((c) => c.id) }, status: 'failed' },
      _count: { _all: true },
    });
    for (const c of campaigns) {
      let gwCount = 0;
      let gwCode: SmsFailureCode = 'not_configured';
      for (const g of grouped.filter((x) => x.campaignId === c.id)) {
        const code = (g.reasonCode ?? 'other') as SmsFailureCode;
        if (code === 'not_configured' || code === 'no_template' || code === 'auth') {
          gwCount += g._count._all;
          gwCode = code;
        }
      }
      const at = c.finishedAt ?? c.createdAt;
      // Wpis bramki i wpis samej kampanii mają osobny stan „przeczytane”.
      if (gwCount > 0) {
        campaignGateway.push({ id: c.id, at, read: c.gatewayAcknowledgedAt !== null, count: gwCount, code: gwCode, reason: failureReasonFor(gwCode) });
      }
      const other = c.failed - gwCount;
      if (other > 0) {
        items.push({
          id: `${CAMPAIGN_PREFIX}${c.id}`,
          kind: 'sms_campaign',
          createdAt: at.toISOString(),
          reason: '',
          reasonCode: 'other',
          read: c.failuresAcknowledgedAt !== null,
          count: other,
          campaignId: c.id,
          campaignTotal: c.total,
        });
      }
    }
  }

  if (gateway.length > 0 || campaignGateway.length > 0) {
    // logs są od najnowszego, więc gateway[0] to najnowszy wpis z logów
    const latestCampaign = campaignGateway.reduce<(typeof campaignGateway)[number] | null>((a, b) => (!a || b.at > a.at ? b : a), null);
    const latestLog = gateway[0];
    const useLog = latestLog && (!latestCampaign || latestLog.createdAt >= latestCampaign.at.toISOString());
    items.push({
      ...(useLog
        ? latestLog
        : { createdAt: latestCampaign!.at.toISOString(), reason: latestCampaign!.reason, reasonCode: latestCampaign!.code }),
      id: GATEWAY_ID,
      kind: 'sms_gateway',
      read: gateway.every((g) => g.read) && campaignGateway.every((g) => g.read),
      count: gateway.length + campaignGateway.reduce((n, g) => n + g.count, 0),
    });
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Cała lista (nie tylko widoczne 50 wpisów) służy do licznika i do „oznacz wszystkie”.
  const acks = new Map<string, { logIds: string[]; campaignIds: string[]; gatewayCampaignIds: string[] }>();
  for (const it of items) {
    if (it.id === GATEWAY_ID) {
      acks.set(it.id, { logIds: gateway.map((g) => g.id), campaignIds: [], gatewayCampaignIds: campaignGateway.map((g) => g.id) });
    } else if (it.campaignId) acks.set(it.id, { logIds: [], campaignIds: [it.campaignId], gatewayCampaignIds: [] });
    else acks.set(it.id, { logIds: [it.id], campaignIds: [], gatewayCampaignIds: [] });
  }
  return { items: items.slice(0, MAX_ITEMS), unreadCount: items.filter((i) => !i.read).length, acks, all: items };
}

/** Oznacza jako przeczytane wskazane wpisy (brak `ids` = wszystkie nierozwiązane). */
export async function acknowledgeSmsFailures(businessId: string, ids?: string[]) {
  const { all: items, acks } = await listSmsFailureNotifications(businessId);
  const wanted = ids ? items.filter((i) => ids.includes(i.id)) : items;
  const toAck = wanted.flatMap((i) => acks.get(i.id)?.logIds ?? []);
  const campaignIds = wanted.flatMap((i) => acks.get(i.id)?.campaignIds ?? []);
  const gatewayCampaignIds = wanted.flatMap((i) => acks.get(i.id)?.gatewayCampaignIds ?? []);
  let count = 0;
  if (gatewayCampaignIds.length > 0) {
    const r = await db.smsCampaign.updateMany({
      where: { id: { in: gatewayCampaignIds }, businessId, gatewayAcknowledgedAt: null },
      data: { gatewayAcknowledgedAt: new Date() },
    });
    count += r.count;
  }
  if (campaignIds.length > 0) {
    const r = await db.smsCampaign.updateMany({
      where: { id: { in: campaignIds }, businessId, failuresAcknowledgedAt: null },
      data: { failuresAcknowledgedAt: new Date() },
    });
    count += r.count;
  }
  if (toAck.length === 0) return count;
  const res = await db.smsLog.updateMany({
    // businessId już zapewnia lista; filtr zostaje dla pewności izolacji
    where: {
      id: { in: toAck },
      acknowledgedAt: null,
      OR: [{ visit: { customer: { businessId } } }, { workOrder: { businessId } }],
    },
    data: { acknowledgedAt: new Date() },
  });
  return count + res.count;
}
