import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { formatCountDate, csvMoney, toCsv } from '@/lib/stock-count/format';
import { parsePriceBasis, shelf, valueCents } from '@/lib/stock-count/math';
import { MSG, loadStockCount, priceOf, sortByName } from '@/lib/stock-count/service';

// GET /api/stock-counts/[id]/export?price=purchase|sale - CSV dla polskiego Excela (UTF-8 z BOM, średniki)
export const GET = withBusiness(
  async ({ business, params, req }) => {
    const basis = parsePriceBasis(new URL(req.url).searchParams.get('price'));
    const count = await loadStockCount(business.id, params.id, true);
    const rows: (string | number | null)[][] = [
      ['Lp.', 'Nazwa', 'Kategoria', 'J.m.', 'Powinno być', 'Jest na półce', 'Brak (-) / nadwyżka (+)', 'Cena jedn.', 'Wartość'],
    ];
    let n = 0;
    for (const l of sortByName(count.lines)) {
      if (l.countedQty === null) continue;
      const price = priceOf(l, basis);
      const value = price === null ? null : valueCents(shelf(l.countedQty), price);
      rows.push([
        ++n,
        l.name,
        l.category,
        l.unit,
        l.systemQtyAtCount === null ? null : shelf(l.systemQtyAtCount),
        shelf(l.countedQty),
        l.diff,
        price === null ? null : csvMoney(Math.round(price * 100)),
        value === null ? null : csvMoney(value),
      ]);
    }
    const file = `inwentaryzacja-${formatCountDate(count.countDate).split('.').reverse().join('-')}.csv`;
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file}"`,
      },
    });
  },
  { notFound: MSG.notFound, error: 'Nie udało się wyeksportować inwentaryzacji' },
);
