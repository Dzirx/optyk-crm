import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { resolveDeliveryDate } from '@/lib/stock/delivery-date';
import { loadDeliveryBounds } from '@/lib/stock/delivery-bounds';
import { createDeliverySchema } from '@/lib/api/schemas/inventory';
import { STOCK_TX_TIMEOUT, lockStock } from '@/lib/stock-count/lock';
import { changeStock } from '@/lib/stock/movements';

const NOT_FOUND = 'Nie znaleziono pozycji';

// POST /api/inventory/[id]/deliveries — dostawa towaru (ruch DELIVERY). Dozwolona także w trakcie inwentaryzacji.
export const POST = withBusiness(
  async ({ business, params, body }) => {
    const result = await db.$transaction(async (tx) => {
      await lockStock(tx, business.id);
      const item = await tx.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id, deletedAt: null } });
      if (!item) return null;

      // Granice daty liczone pod blokadą: zakończenie spisu nie może wejść między sprawdzenie a zapis.
      const bounds = await loadDeliveryBounds(tx, business.id, item.createdAt); // historia założona już przez lockStock
      const occurredAt = resolveDeliveryDate(body.occurredAt, new Date(), bounds);

      const quantity = await changeStock(tx, {
        businessId: business.id,
        itemId: item.id,
        delta: body.quantity,
        type: 'DELIVERY',
        occurredAt,
        userId: business.userId,
        note: body.note ?? null,
      });
      return { ...item, quantity: quantity ?? item.quantity };
    }, STOCK_TX_TIMEOUT);
    if (!result) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ item: result }, { status: 201 });
  },
  { body: createDeliverySchema, notFound: NOT_FOUND, error: 'Nie udało się zapisać dostawy' },
);
