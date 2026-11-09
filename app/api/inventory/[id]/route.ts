import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { INVENTORY_QTY, updateInventorySchema } from '@/lib/api/schemas/inventory';
import { requiredNumber } from '@/lib/api/validation';

const NOT_FOUND = 'Nie znaleziono pozycji';

// GET /api/inventory/[id]
export const GET = withBusiness(
  async ({ business, params }) => {
    const item = await db.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id } });
    if (!item) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ item });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać pozycji' },
);

// PATCH /api/inventory/[id]
export const PATCH = withBusiness(
  async ({ business, params, body }) => {
    const { name, quantity, unit, category, sph, cyl, diameter, price, notes } = body;

    const existing = await db.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id } });
    if (!existing) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    // Ujemny stan (towar zamówiony do zleceń) można zostawić albo podnieść, ale nie obniżyć poniżej zera.
    if (quantity !== undefined) requiredNumber(quantity, { ...INVENTORY_QTY, min: Math.min(0, existing.quantity) });

    const item = await db.inventoryItem.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined && { name }),
        ...(quantity !== undefined && { quantity }),
        ...(unit !== undefined && { unit }),
        ...(category !== undefined && { category }),
        ...(sph !== undefined && { sph }),
        ...(cyl !== undefined && { cyl }),
        ...(diameter !== undefined && { diameter }),
        ...(price !== undefined && { price }),
        ...(notes !== undefined && { notes }),
      },
    });
    return NextResponse.json({ item });
  },
  { body: updateInventorySchema, notFound: NOT_FOUND, error: 'Nie udało się zaktualizować pozycji' },
);

// DELETE /api/inventory/[id]
export const DELETE = withBusiness(
  async ({ business, params }) => {
    const existing = await db.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id } });
    if (!existing) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    await db.inventoryItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ message: 'Pozycja usunięta' });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się usunąć pozycji' },
);
