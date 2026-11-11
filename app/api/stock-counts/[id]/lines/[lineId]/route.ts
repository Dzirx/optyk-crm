import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { isUuid } from '@/lib/api/ownership';
import { setLineCountSchema } from '@/lib/api/schemas/stock-counts';
import { MSG, setLineCount } from '@/lib/stock-count/service';

// PATCH /api/stock-counts/[id]/lines/[lineId] - zapis policzonej ilości (null = wyczyść)
export const PATCH = withBusiness(
  async ({ business, params, body }) => {
    const { lineId } = params as unknown as { lineId: string };
    if (!isUuid(lineId)) return NextResponse.json({ error: MSG.lineNotFound }, { status: 404 });
    const line = await setLineCount(business.id, params.id, lineId, body.countedQty);
    return NextResponse.json({
      line: { id: line.id, countedQty: line.countedQty, systemQtyAtCount: line.systemQtyAtCount, countedAt: line.countedAt },
    });
  },
  { body: setLineCountSchema, notFound: MSG.notFound, error: 'Nie udało się zapisać liczenia' },
);
