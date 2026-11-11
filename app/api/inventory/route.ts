import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { inventorySearchWhere } from '@/lib/api/search';
import { STOCK_TX_TIMEOUT, lockStock } from '@/lib/stock-count/lock';
import { changeStock } from '@/lib/stock/movements';
import { createInventorySchema, listInventoryQuerySchema } from '@/lib/api/schemas/inventory';

// GET /api/inventory - towary salonu.
// Bez `page`: cała lista w starym kształcie `{ items }` (używają jej formularz zleceń i inne ekrany).
// Z `page` (+ pageSize, domyślnie 50, max 200; q: nazwa, kategoria, uwagi; category: dokładna kategoria):
// `{ items, total, page, pageSize, categories }`, gdzie `categories` to wszystkie kategorie salonu.
export const GET = withBusiness(
  async ({ req, business }) => {
    const parsed = listInventoryQuerySchema.safeParse(
      queryObject(req.nextUrl.searchParams, ['page', 'pageSize', 'q', 'category']),
    );
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { page, pageSize, q, category } = parsed.data;

    if (page === undefined) {
      const items = await db.inventoryItem.findMany({
        where: { businessId: business.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ items });
    }

    // businessId zawsze w warunku: żaden filtr ani strona nie wychodzi poza salon.
    const base: Prisma.InventoryItemWhereInput = { businessId: business.id, deletedAt: null };
    const where: Prisma.InventoryItemWhereInput = {
      ...base,
      ...(category ? { category } : {}),
      AND: inventorySearchWhere(q),
    };
    const [total, items, cats] = await db.$transaction([
      db.inventoryItem.count({ where }),
      db.inventoryItem.findMany({
        where,
        // `id` rozstrzyga remisy, żeby strony nie nakładały się na siebie.
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.inventoryItem.findMany({
        where: { ...base, category: { not: null } },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
    ]);
    const categories = cats.map((c) => c.category).filter((c): c is string => !!c);
    return NextResponse.json({ items, total, page, pageSize, categories });
  },
  { error: 'Nie udało się pobrać magazynu' },
);

// POST /api/inventory - nowa pozycja
export const POST = withBusiness(
  async ({ business, body }) => {
    // Pod blokadą magazynu: pozycja nie powstanie w środku zamykania inwentaryzacji.
    const item = await db.$transaction(async (tx) => {
      await lockStock(tx, business.id);
      const created = await tx.inventoryItem.create({
        data: {
          businessId: business.id,
          name: body.name,
          quantity: 0, // ilość zapisuje dopiero ruch INITIAL (changeStock jest jedynym zapisem stanu)
          unit: body.unit || 'szt.',
          category: body.category ?? null,
          sph: body.sph,
          cyl: body.cyl,
          diameter: body.diameter,
          price: body.price,
          purchasePrice: body.purchasePrice,
          notes: body.notes ?? null,
        },
      });
      if (body.quantity !== 0) {
        const quantity = await changeStock(tx, {
          businessId: business.id,
          itemId: created.id,
          delta: body.quantity,
          type: 'INITIAL',
          userId: business.userId,
          note: 'Stan początkowy przy dodaniu towaru',
        });
        return { ...created, quantity: quantity ?? 0 };
      }
      return created;
    }, STOCK_TX_TIMEOUT);
    return NextResponse.json({ item }, { status: 201 });
  },
  { body: createInventorySchema, error: 'Nie udało się dodać pozycji' },
);
