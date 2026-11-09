// Zmiany stanu magazynu wywołane przez pozycje zleceń.

import type { Prisma } from '@prisma/client';

export class OutOfStockError extends Error {
  constructor(public readonly itemName: string) {
    super(`Brak towaru na stanie: ${itemName}. Jeśli towar trzeba zamówić u dostawcy, zaznacz „Do zamówienia” przy tym elemencie.`);
    this.name = 'OutOfStockError';
  }
}

export type InventoryLinks = {
  inventoryItemIdOp?: string | null;
  inventoryItemIdOl?: string | null;
  inventoryItemIdFrame?: string | null;
};

type OrderedFlags = InventoryLinks & { opOrdered?: boolean; olOrdered?: boolean; frameOrdered?: boolean };

/** Towary z elementów oznaczonych „do zamówienia” — dla nich stan może zejść poniżej zera. */
export function orderedInventoryIds(rows: OrderedFlags[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.opOrdered && r.inventoryItemIdOp) ids.add(r.inventoryItemIdOp);
    if (r.olOrdered && r.inventoryItemIdOl) ids.add(r.inventoryItemIdOl);
    if (r.frameOrdered && r.inventoryItemIdFrame) ids.add(r.inventoryItemIdFrame);
  }
  return ids;
}

/** Dodaje do mapy zmian stanu wszystkie towary powiązane z pozycją (delta: -1 pobranie, +1 zwrot). */
export function addLinks(adjustments: Record<string, number>, item: InventoryLinks, delta: number): void {
  for (const id of [item.inventoryItemIdOp, item.inventoryItemIdOl, item.inventoryItemIdFrame]) {
    if (id) adjustments[id] = (adjustments[id] || 0) + delta;
  }
}

/**
 * Zapisuje zmiany stanu w transakcji. Pobranie towaru, którego nie ma na stanie,
 * rzuca OutOfStockError i wycofuje całą transakcję — stan nie spada poniżej zera.
 *
 * allowNegativeIds (towary oznaczone „do zamówienia”): stan może zejść poniżej zera.
 * Ujemny stan = sztuki zamówione u dostawcy, które czekają na dostawę.
 */
export async function applyAdjustments(
  tx: Prisma.TransactionClient,
  adjustments: Record<string, number>,
  allowNegativeIds: Set<string> = new Set(),
): Promise<void> {
  for (const [id, delta] of Object.entries(adjustments)) {
    if (delta === 0) continue;
    if (delta > 0 || allowNegativeIds.has(id)) {
      await tx.inventoryItem.update({ where: { id }, data: { quantity: { increment: delta } } });
      continue;
    }
    const res = await tx.inventoryItem.updateMany({
      where: { id, quantity: { gte: -delta } },
      data: { quantity: { increment: delta } },
    });
    if (res.count === 0) {
      const item = await tx.inventoryItem.findUnique({ where: { id }, select: { name: true } });
      throw new OutOfStockError(item?.name ?? 'nieznany towar');
    }
  }
}

/** Zwraca na stan towary z wszystkich pozycji podanych zleceń (przed ich usunięciem). */
export async function returnOrdersToStock(tx: Prisma.TransactionClient, where: Prisma.WorkOrderItemWhereInput): Promise<void> {
  const items = await tx.workOrderItem.findMany({
    where,
    select: { inventoryItemIdOp: true, inventoryItemIdOl: true, inventoryItemIdFrame: true },
  });
  const adjustments: Record<string, number> = {};
  for (const item of items) addLinks(adjustments, item, +1);
  await applyAdjustments(tx, adjustments);
}
