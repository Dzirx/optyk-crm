// Dziennik ruchów magazynowych (tylko dopisywany). Jedyne miejsce, które zmienia InventoryItem.quantity.
//
// Niezmiennik: dla każdego towaru quantity == suma delta wszystkich jego ruchów.
// Dzięki temu stan towaru w dowolnej chwili t (od stockHistoryStart) to suma delta ruchów z occurredAt <= t.

import { Prisma, type PrismaClient, type StockMovementType } from '@prisma/client';
import { db } from '@/lib/db';
import { holdsStockLock } from '@/lib/stock/lock-registry';

type Tx = Prisma.TransactionClient;

export class OutOfStockError extends Error {
  constructor(public readonly itemName: string) {
    super(`Brak towaru na stanie: ${itemName}. Jeśli towar trzeba zamówić u dostawcy, wybierz w kolumnie „Skąd” opcję „Do zamówienia”.`);
    this.name = 'OutOfStockError';
  }
}

/**
 * Zakłada historię salonu, jeśli jeszcze jej nie ma: po jednym ruchu INITIAL (delta = obecny stan)
 * dla każdego towaru z niezerowym stanem, potem ustawia stockHistoryStart. Idempotentne.
 * Wywoływać tylko pod blokadą magazynu (robi to lockStock).
 */
export async function ensureStockHistory(tx: Tx, businessId: string): Promise<Date> {
  const biz = await tx.business.findUnique({ where: { id: businessId }, select: { stockHistoryStart: true } });
  if (!biz) throw new Error('Nie znaleziono salonu');
  if (biz.stockHistoryStart) return biz.stockHistoryStart;

  const now = new Date();
  const items = await tx.inventoryItem.findMany({
    where: { businessId, quantity: { not: 0 } },
    select: { id: true, quantity: true },
    orderBy: { id: 'asc' },
  });
  if (items.length > 0) {
    await tx.stockMovement.createMany({
      data: items.map((i) => ({
        businessId,
        inventoryItemId: i.id,
        type: 'INITIAL' as const,
        delta: i.quantity,
        qtyAfter: i.quantity,
        occurredAt: now,
        note: 'Stan z chwili uruchomienia historii magazynu',
      })),
    });
  }
  await tx.business.update({ where: { id: businessId }, data: { stockHistoryStart: now } });
  return now;
}

export interface ChangeStockInput {
  businessId: string;
  itemId: string;
  /** Różnica stanu (nie zero; zero nic nie robi). */
  delta: number;
  type: StockMovementType;
  /** Kiedy zdarzenie zaszło (domyślnie teraz). */
  occurredAt?: Date;
  userId?: string | null;
  workOrderId?: string | null;
  orderNumber?: string | null;
  stockCountId?: string | null;
  note?: string | null;
  /** Pozwala zejść poniżej zera (towar „do zamówienia”, korekta ze spisu, usunięcie towaru). */
  allowNegative?: boolean;
}

/**
 * JEDYNY sposób zmiany InventoryItem.quantity. Atomowo zmienia stan i dopisuje ruch z qtyAfter.
 * Wymaga blokady magazynu (lockStock) w tej samej transakcji — inaczej rzuca błąd.
 * Pobranie (delta < 0) bez allowNegative rzuca OutOfStockError, gdy stan jest za mały.
 * Zwraca nowy stan.
 */
export async function changeStock(tx: Tx, input: ChangeStockInput): Promise<number | null> {
  const { businessId, itemId, delta } = input;
  if (!Number.isInteger(delta)) throw new Error('Zmiana stanu musi być liczbą całkowitą');
  if (delta === 0) return null;
  if (!holdsStockLock(tx)) throw new Error('changeStock wymaga blokady magazynu (lockStock) w tej transakcji');

  const guard = delta < 0 && !input.allowNegative ? { quantity: { gte: -delta } } : {};
  let quantity: number;
  try {
    // businessId w warunku: nigdy nie ruszamy towaru innego salonu.
    const updated = await tx.inventoryItem.update({
      where: { id: itemId, businessId, ...guard },
      data: { quantity: { increment: delta } },
      select: { quantity: true },
    });
    quantity = updated.quantity;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, businessId }, select: { name: true } });
      if (!item) throw new Error('Nie znaleziono towaru');
      throw new OutOfStockError(item.name);
    }
    throw e;
  }

  await tx.stockMovement.create({
    data: {
      businessId,
      inventoryItemId: itemId,
      type: input.type,
      delta,
      qtyAfter: quantity,
      occurredAt: input.occurredAt ?? new Date(),
      userId: input.userId ?? null,
      workOrderId: input.workOrderId ?? null,
      orderNumber: input.orderNumber ?? null,
      stockCountId: input.stockCountId ?? null,
      note: input.note ?? null,
    },
  });
  return quantity;
}

/** Największa liczba towarów w jednym zapytaniu `IN`. */
export const STOCK_AT_CHUNK = 10_000;

async function stockAtChunk(client: Tx | PrismaClient, businessId: string, at: Date, itemIds: string[] | undefined): Promise<Map<string, number>> {
  const rows = await client.stockMovement.groupBy({
    by: ['inventoryItemId'],
    where: { businessId, occurredAt: { lte: at }, ...(itemIds ? { inventoryItemId: { in: itemIds } } : {}) },
    _sum: { delta: true },
  });
  return new Map(rows.map((r) => [r.inventoryItemId, r._sum.delta ?? 0]));
}

/**
 * Stan towarów w chwili `at` (suma delta ruchów z occurredAt <= at). Towar bez ruchów = 0.
 * Bez `itemIds`: wszystkie towary salonu. Długa lista id, która obejmuje wszystkie towary salonu,
 * też idzie jednym zapytaniem bez `IN`; inaczej lista jest dzielona na paczki po STOCK_AT_CHUNK.
 */
export async function stockAt(
  client: Tx | PrismaClient,
  businessId: string,
  at: Date,
  itemIds?: string[],
): Promise<Map<string, number>> {
  let map: Map<string, number>;
  if (!itemIds || itemIds.length === 0) {
    map = itemIds ? new Map() : await stockAtChunk(client, businessId, at, undefined);
  } else if (itemIds.length <= STOCK_AT_CHUNK) {
    map = await stockAtChunk(client, businessId, at, itemIds);
  } else if (itemIds.length >= (await client.inventoryItem.count({ where: { businessId } }))) {
    map = await stockAtChunk(client, businessId, at, undefined); // potrzebne wszystkie towary salonu
  } else {
    map = new Map();
    for (let i = 0; i < itemIds.length; i += STOCK_AT_CHUNK) {
      for (const [id, q] of await stockAtChunk(client, businessId, at, itemIds.slice(i, i + STOCK_AT_CHUNK))) map.set(id, q);
    }
  }
  const out = new Map<string, number>(itemIds?.map((id) => [id, 0]));
  for (const id of itemIds ?? map.keys()) out.set(id, map.get(id) ?? 0);
  return out;
}

/**
 * Stan każdego towaru w jego własnej chwili (jedno zapytanie zamiast jednego na pozycję).
 * `points`: towar + chwila. Towar bez ruchów do tej chwili = 0.
 */
export async function stockAtPoints(
  client: Tx | PrismaClient,
  businessId: string,
  points: { itemId: string; at: Date }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>(points.map((p) => [p.itemId, 0]));
  for (let i = 0; i < points.length; i += STOCK_AT_CHUNK) {
    const part = points.slice(i, i + STOCK_AT_CHUNK);
    // Chwile jako tekst ISO rzutowany na timestamp: kolumna jest bez strefy (UTC), a „Z” w literale jest pomijane.
    const rows = await client.$queryRaw<{ item_id: string; qty: number }[]>`
      SELECT v.item_id::text AS item_id, COALESCE(SUM(m.delta), 0)::int AS qty
      FROM unnest(${part.map((p) => p.itemId)}::uuid[], ${part.map((p) => p.at.toISOString())}::text[]) AS v(item_id, tau)
      JOIN stock_movements m
        ON m.inventory_item_id = v.item_id AND m.business_id = ${businessId}::uuid AND m.occurred_at <= v.tau::timestamp
      GROUP BY v.item_id`;
    for (const r of rows) out.set(r.item_id, r.qty);
  }
  return out;
}

/** Od kiedy historia salonu jest kompletna (null = jeszcze nie rozpoczęta). */
export async function historyStart(businessId: string): Promise<Date | null> {
  const b = await db.business.findUnique({ where: { id: businessId }, select: { stockHistoryStart: true } });
  return b?.stockHistoryStart ?? null;
}
