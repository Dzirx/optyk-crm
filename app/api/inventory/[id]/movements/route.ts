import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { listMovementsQuerySchema } from '@/lib/api/schemas/inventory';
import { deliveryMinAt } from '@/lib/stock/delivery-bounds';

const NOT_FOUND = 'Nie znaleziono pozycji';

// GET /api/inventory/[id]/movements?page&pageSize — historia ruchów towaru, od najnowszych.
// Działa też dla usuniętego towaru (historia zostaje).
export const GET = withBusiness(
  async ({ req, business, params }) => {
    const parsed = listMovementsQuerySchema.safeParse(queryObject(req.nextUrl.searchParams, ['page', 'pageSize']));
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { page = 1, pageSize } = parsed.data;

    const item = await db.inventoryItem.findFirst({
      where: { id: params.id, businessId: business.id },
      select: { id: true, name: true, quantity: true, deletedAt: true, createdAt: true },
    });
    if (!item) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const where = { inventoryItemId: item.id, businessId: business.id };
    const [total, rows] = await db.$transaction([
      db.stockMovement.count({ where }),
      db.stockMovement.findMany({
        where,
        // seq = kolejność zapisu; remisy w occurredAt/createdAt nie mieszają stron.
        orderBy: [{ occurredAt: 'desc' }, { seq: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          delta: true,
          qtyAfter: true, // wg kolejności zapisu; do wyświetlania służy balanceAfter
          occurredAt: true,
          createdAt: true,
          orderNumber: true,
          workOrderId: true,
          stockCountId: true,
          note: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);
    // „Stan po” = bieżące saldo w kolejności zdarzeń (occurredAt, seq): taka sama kolejność jak na liście,
    // więc dostawa z datą wsteczną nie psuje salda (qtyAfter w bazie jest wg kolejności zapisu).
    const balances = new Map<string, number>();
    if (rows.length > 0) {
      const found = await db.$queryRaw<{ id: string; balance: number }[]>`
        SELECT id::text AS id, balance FROM (
          SELECT id, (SUM(delta) OVER (ORDER BY occurred_at, seq))::int AS balance
          FROM stock_movements
          WHERE inventory_item_id = ${item.id}::uuid AND business_id = ${business.id}::uuid
        ) s
        WHERE id = ANY(${rows.map((r) => r.id)}::uuid[])`;
      for (const b of found) balances.set(b.id, b.balance);
    }
    const movements = rows.map(({ user, ...m }) => ({
      ...m,
      balanceAfter: balances.get(m.id) ?? 0,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
    }));
    const { createdAt: itemCreatedAt, ...itemOut } = item;
    // Najwcześniejsza dozwolona data nowej dostawy (formularz ustawia `min` pola daty).
    const minAt = await deliveryMinAt(db, business.id, itemCreatedAt);
    return NextResponse.json({ item: itemOut, movements, total, page, pageSize, deliveryMinAt: minAt.toISOString() });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać historii ruchów' },
);
