import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { MSG, deleteStockCount, loadStockCount, summaryOf } from '@/lib/stock-count/service';

// GET /api/stock-counts/[id] - spis z pozycjami (otwarty spis dostaje też towary dodane po starcie)
export const GET = withBusiness(
  async ({ business, params }) => {
    const stockCount = await loadStockCount(business.id, params.id, true);
    const { lines, ...head } = stockCount;
    return NextResponse.json({ stockCount: head, lines, summary: summaryOf(lines, 'purchase') });
  },
  { notFound: MSG.notFound, error: 'Nie udało się pobrać inwentaryzacji' },
);

// DELETE /api/stock-counts/[id] - anulowanie (tylko otwarta inwentaryzacja)
export const DELETE = withBusiness(
  async ({ business, params }) => {
    await deleteStockCount(business.id, params.id);
    return NextResponse.json({ message: 'Inwentaryzacja anulowana' });
  },
  { notFound: MSG.notFound, error: 'Nie udało się anulować inwentaryzacji' },
);
