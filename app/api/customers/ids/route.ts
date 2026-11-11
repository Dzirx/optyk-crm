import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { listCustomersQuerySchema } from '@/lib/api/schemas/customers';
import { customerListWhere } from '@/lib/customers/list-filter';
import { MAX_BULK_RECIPIENTS } from '@/lib/sms/limits';

// GET /api/customers/ids - same id klientów pasujących do filtrów (do „zaznacz wszystkich pasujących”).
// Parametry jak w GET /api/customers (q, smsConsent, visitRanges, visitFrom, visitTo); page i sort są ignorowane.
// Odpowiedź: { ids, total, limit }; `ids` ma najwyżej `limit` (= limit wysyłki masowej) pozycji,
// a `total` to pełna liczba pasujących, więc `total > ids.length` oznacza przycięcie.
export const GET = withBusiness(
  async ({ req, business }) => {
    const parsed = listCustomersQuerySchema.safeParse(
      queryObject(req.nextUrl.searchParams, ['q', 'smsConsent', 'visitRanges', 'visitFrom', 'visitTo']),
    );
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { q, smsConsent, visitRanges, visitFrom, visitTo } = parsed.data;

    const where = await customerListWhere(business.id, { q, smsConsent, visitRanges, visitFrom, visitTo });
    const [total, found] = await db.$transaction([
      db.customer.count({ where }),
      db.customer.findMany({ where, select: { id: true }, orderBy: { id: 'asc' }, take: MAX_BULK_RECIPIENTS }),
    ]);
    return NextResponse.json({ ids: found.map((c) => c.id), total, limit: MAX_BULK_RECIPIENTS });
  },
  { error: 'Nie udało się pobrać klientów' },
);
