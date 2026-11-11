import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { MSG, closeStockCount } from '@/lib/stock-count/service';

// POST /api/stock-counts/[id]/close - zakończenie: stany towarów = policzone (+ sprzedaż po liczeniu)
export const POST = withBusiness(
  async ({ business, params }) => {
    const stockCount = await closeStockCount(business.id, params.id, business.userId);
    return NextResponse.json({ stockCount });
  },
  { notFound: MSG.notFound, error: 'Nie udało się zakończyć inwentaryzacji' },
);
