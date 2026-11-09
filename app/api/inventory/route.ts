import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { createInventorySchema } from '@/lib/api/schemas/inventory';

// GET /api/inventory - towary salonu
export const GET = withBusiness(
  async ({ business }) => {
    const items = await db.inventoryItem.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ items });
  },
  { error: 'Nie udało się pobrać magazynu' },
);

// POST /api/inventory - nowa pozycja
export const POST = withBusiness(
  async ({ business, body }) => {
    const item = await db.inventoryItem.create({
      data: {
        businessId: business.id,
        name: body.name,
        quantity: body.quantity,
        unit: body.unit || 'szt.',
        category: body.category ?? null,
        sph: body.sph,
        cyl: body.cyl,
        diameter: body.diameter,
        price: body.price,
        notes: body.notes ?? null,
      },
    });
    return NextResponse.json({ item }, { status: 201 });
  },
  { body: createInventorySchema, error: 'Nie udało się dodać pozycji' },
);
