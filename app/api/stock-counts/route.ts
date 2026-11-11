import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { startStockCountSchema } from '@/lib/api/schemas/stock-counts';
import { listStockCounts, startStockCount } from '@/lib/stock-count/service';

// GET /api/stock-counts - inwentaryzacje salonu z podsumowaniem
export const GET = withBusiness(
  async ({ business }) => {
    const stockCounts = await listStockCounts(business.id);
    return NextResponse.json({ stockCounts });
  },
  { error: 'Nie udało się pobrać inwentaryzacji' },
);

// POST /api/stock-counts - start inwentaryzacji (jedna otwarta naraz; 409 przy drugiej)
export const POST = withBusiness(
  async ({ business, body }) => {
    const stockCount = await startStockCount(business.id, body.countDate, body.notes ?? null);
    return NextResponse.json({ stockCount }, { status: 201 });
  },
  { body: startStockCountSchema, error: 'Nie udało się rozpocząć inwentaryzacji' },
);
