// Ostatnia prośba o opinię SMS dla klienta: kolumna na kliencie + wyliczenie zapasowe
// z wizyt i zleceń (dla danych sprzed wprowadzenia kolumny).

import { db } from '@/lib/db';
import { formatDatePadded } from '@/lib/time';

export interface LastReviewRequest {
  lastSentAt: string | null;
  source: string | null;
}

export const visitSource = (visitDate: Date) => `wizyta ${formatDatePadded(visitDate)}`;
export const orderSource = (orderNumber: string) => `zlecenie ${orderNumber}`;

/** Zapisuje na kliencie, że właśnie wysłano prośbę o opinię. Błąd zapisu nie przerywa wysyłki. */
export async function recordReviewSms(customerId: string, source: string, at = new Date()): Promise<void> {
  try {
    await db.customer.update({ where: { id: customerId }, data: { lastReviewSmsAt: at, lastReviewSmsSource: source } });
  } catch (error) {
    console.error(`[SMS] Nie udało się zapisać ostatniej prośby o opinię (klient ${customerId}):`, error);
  }
}

interface FallbackRow {
  customer_id: string;
  sent_at: Date;
  kind: 'v' | 'o';
  ref_date: Date;
  order_number: string | null;
}

/** Najnowsza wysłana prośba o opinię z wizyt i zleceń — jedno zapytanie dla wielu klientów. */
export async function latestReviewFromRecords(customerIds: string[]): Promise<Map<string, { at: Date; source: string }>> {
  const out = new Map<string, { at: Date; source: string }>();
  if (customerIds.length === 0) return out;
  const rows = await db.$queryRaw<FallbackRow[]>`
    SELECT DISTINCT ON (customer_id) customer_id, sent_at, kind, ref_date, order_number FROM (
      SELECT customer_id, review_sms_sent_at AS sent_at, 'v' AS kind, visit_date AS ref_date, NULL::text AS order_number
        FROM visits
        WHERE customer_id = ANY(${customerIds}::uuid[]) AND review_sms_status = 'sent' AND review_sms_sent_at IS NOT NULL
      UNION ALL
      SELECT customer_id, review_sms_sent_at AS sent_at, 'o' AS kind, received_at AS ref_date, order_number
        FROM work_orders
        WHERE customer_id = ANY(${customerIds}::uuid[]) AND review_sms_status = 'sent' AND review_sms_sent_at IS NOT NULL
    ) s
    ORDER BY customer_id, sent_at DESC`;
  for (const r of rows) {
    out.set(r.customer_id, {
      at: new Date(r.sent_at),
      source: r.kind === 'o' && r.order_number ? orderSource(r.order_number) : visitSource(new Date(r.ref_date)),
    });
  }
  return out;
}

/**
 * Ostatnia prośba o opinię dla klientów: kolumna, a gdy pusta — wyliczenie zapasowe
 * (jedno zgrupowane zapytanie na całą stronę). Zapasowego wyniku nie zapisujemy tutaj;
 * robi to `persist` (endpoint pojedynczego klienta).
 */
export async function lastReviewForCustomers(
  customers: { id: string; lastReviewSmsAt: Date | null; lastReviewSmsSource: string | null }[],
): Promise<Map<string, { at: Date; source: string | null }>> {
  const out = new Map<string, { at: Date; source: string | null }>();
  const missing: string[] = [];
  for (const c of customers) {
    if (c.lastReviewSmsAt) out.set(c.id, { at: c.lastReviewSmsAt, source: c.lastReviewSmsSource });
    else missing.push(c.id);
  }
  for (const [id, v] of await latestReviewFromRecords(missing)) out.set(id, v);
  return out;
}
