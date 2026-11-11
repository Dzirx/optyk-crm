// Filtry listy klientów wspólne dla GET /api/customers i GET /api/customers/ids
// (strona wiadomości: zgoda SMS, liczba wizyt, data wizyty, wyszukiwanie, sortowanie).
// Każdy warunek ma `businessId` salonu, więc nic nie wychodzi poza salon.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { customerSearchWhere } from '@/lib/api/search';
import { dayBounds } from '@/lib/time';

/** Przedziały „liczba wizyt”: indeks w `visitRanges` → [min, max]. */
export const VISIT_RANGES: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 3],
  [4, 9],
  [10, Number.MAX_SAFE_INTEGER],
];

export type CustomerSort = 'name-asc' | 'name-desc' | 'visits-desc' | 'visits-asc' | 'date-desc' | 'date-asc';

export interface CustomerListFilter {
  q?: string;
  smsConsent?: 'true' | 'false';
  /** Indeksy z VISIT_RANGES, np. „0,2” (alternatywa: wystarczy jeden przedział). */
  visitRanges?: string;
  /** Dni yyyy-mm-dd (strefa salonu), włącznie: klient ma wizytę w tym przedziale. */
  visitFrom?: string;
  visitTo?: string;
}

/** Klienci salonu spełniający filtr; kolejność ustala wywołujący. */
export async function customerListWhere(businessId: string, f: CustomerListFilter): Promise<Prisma.CustomerWhereInput> {
  const and: Prisma.CustomerWhereInput[] = [...customerSearchWhere(f.q)];

  if (f.visitFrom || f.visitTo) {
    and.push({
      visits: {
        some: {
          visitDate: {
            ...(f.visitFrom ? { gte: dayBounds(f.visitFrom).start } : {}),
            ...(f.visitTo ? { lt: dayBounds(f.visitTo).end } : {}),
          },
        },
      },
    });
  }

  if (f.visitRanges) {
    const ranges = f.visitRanges.split(',').map((i) => VISIT_RANGES[Number(i)]).filter(Boolean);
    // Prisma nie filtruje po liczbie relacji, więc id klientów z pasującą liczbą wizyt liczy SQL.
    const conditions = ranges.map(
      ([min, max]) => Prisma.sql`(SELECT count(*) FROM visits v WHERE v.customer_id = c.id) BETWEEN ${min} AND ${max}`,
    );
    if (conditions.length > 0) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT c.id::text AS id FROM customers c
        WHERE c.business_id = ${businessId}::uuid AND (${Prisma.join(conditions, ' OR ')})`;
      and.push({ id: { in: rows.map((r) => r.id) } });
    }
  }

  return {
    businessId,
    AND: and,
    ...(f.smsConsent ? { smsConsent: f.smsConsent === 'true' } : {}),
  };
}

/**
 * Id klientów z jednej strony przy sortowaniu po dacie ostatniej wizyty (Prisma tego nie umie).
 * Brak wizyt: przy malejącej na końcu, przy rosnącej na początku (jak „data 0”).
 */
export async function pageIdsByLastVisit(
  where: Prisma.CustomerWhereInput,
  direction: 'asc' | 'desc',
  skip: number,
  take: number,
): Promise<string[]> {
  const matching = (await db.customer.findMany({ where, select: { id: true } })).map((c) => c.id);
  if (matching.length === 0) return [];
  const order = direction === 'desc' ? Prisma.sql`m DESC NULLS LAST` : Prisma.sql`m ASC NULLS FIRST`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id::text AS id FROM customers c
    LEFT JOIN (SELECT customer_id, max(visit_date) AS m FROM visits GROUP BY customer_id) lv ON lv.customer_id = c.id
    WHERE c.id = ANY(${matching}::uuid[])
    ORDER BY ${order}, c.surname ASC, c.name ASC, c.id ASC
    LIMIT ${take} OFFSET ${skip}`;
  return rows.map((r) => r.id);
}

export function customerOrderBy(sort: CustomerSort | undefined): Prisma.CustomerOrderByWithRelationInput[] {
  const tie = [{ surname: 'asc' as const }, { name: 'asc' as const }, { id: 'asc' as const }];
  switch (sort) {
    case 'name-asc':
      return tie;
    case 'name-desc':
      return [{ surname: 'desc' }, { name: 'desc' }, { id: 'desc' }];
    case 'visits-desc':
      return [{ visits: { _count: 'desc' } }, ...tie];
    case 'visits-asc':
      return [{ visits: { _count: 'asc' } }, ...tie];
    default:
      // Bez sortowania: od najnowszych; `id` rozstrzyga remisy, żeby strony nie nakładały się na siebie.
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}
