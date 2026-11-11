import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { isUuid } from '@/lib/api/ownership';
import { latestReviewFromRecords } from '@/lib/customers/review-request';

const NOT_FOUND = 'Nie znaleziono klienta';

// GET /api/customers/[id]/last-review-request → { lastSentAt, source }
// Źródło: kolumna klienta; gdy pusta — najnowszy wysłany SMS z prośbą o opinię z wizyt i zleceń
// (wynik zapisujemy w kolumnie, żeby kolejne odczyty były proste).
export const GET = withBusiness(
  async ({ business, params }) => {
    if (!isUuid(params.id)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const customer = await db.customer.findFirst({
      where: { id: params.id, businessId: business.id },
      select: { id: true, lastReviewSmsAt: true, lastReviewSmsSource: true },
    });
    if (!customer) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    if (customer.lastReviewSmsAt) {
      return NextResponse.json({ lastSentAt: customer.lastReviewSmsAt.toISOString(), source: customer.lastReviewSmsSource });
    }
    const found = (await latestReviewFromRecords([customer.id])).get(customer.id);
    if (!found) return NextResponse.json({ lastSentAt: null, source: null });
    await db.customer
      .updateMany({ where: { id: customer.id, lastReviewSmsAt: null }, data: { lastReviewSmsAt: found.at, lastReviewSmsSource: found.source } })
      .catch(() => {});
    return NextResponse.json({ lastSentAt: found.at.toISOString(), source: found.source });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać ostatniej prośby o opinię' },
);
