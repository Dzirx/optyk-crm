// Zmiany stanu magazynu wywołane przez pozycje zleceń.

import type { Prisma } from '@prisma/client';
import { OutOfStockError, changeStock } from '@/lib/stock/movements';

export { OutOfStockError };

type InventoryLinks = {
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

export interface OrderStockContext {
  businessId: string;
  workOrderId: string;
  orderNumber: string;
  userId?: string | null;
}

/**
 * Zapisuje zmiany stanu w transakcji (pod blokadą magazynu) jako ruchy ORDER_OUT (pobranie)
 * i ORDER_RETURN (zwrot) przypisane do zlecenia. Pobranie towaru, którego nie ma na stanie,
 * rzuca OutOfStockError i wycofuje całą transakcję — stan nie spada poniżej zera.
 *
 * allowNegativeIds (towary oznaczone „do zamówienia”): stan może zejść poniżej zera.
 * Ujemny stan = sztuki zamówione u dostawcy, które czekają na dostawę.
 * Towary usunięte (deletedAt) są pomijane: ich stan zostaje 0.
 */
export async function applyAdjustments(
  tx: Prisma.TransactionClient,
  ctx: OrderStockContext,
  adjustments: Record<string, number>,
  allowNegativeIds: Set<string> = new Set(),
): Promise<void> {
  // Usunięty towar zostaje na 0: nie zmieniamy jego stanu i nie piszemy ruchu (np. zwrot po edycji zlecenia).
  const ids = Object.keys(adjustments);
  const deleted = new Set(
    ids.length === 0
      ? []
      : (
          await tx.inventoryItem.findMany({
            where: { id: { in: ids }, businessId: ctx.businessId, deletedAt: { not: null } },
            select: { id: true },
          })
        ).map((i) => i.id),
  );
  for (const [itemId, delta] of Object.entries(adjustments)) {
    if (delta === 0 || deleted.has(itemId)) continue;
    await changeStock(tx, {
      businessId: ctx.businessId,
      itemId,
      delta,
      type: delta < 0 ? 'ORDER_OUT' : 'ORDER_RETURN',
      workOrderId: ctx.workOrderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      allowNegative: allowNegativeIds.has(itemId),
    });
  }
}

/**
 * Zwraca na stan towary z wszystkich pozycji podanych zleceń (przed ich usunięciem).
 * Osobny ruch ORDER_RETURN na każde zlecenie — zlecenie jeszcze istnieje, więc ruch dostaje jego id i numer.
 */
export async function returnOrdersToStock(
  tx: Prisma.TransactionClient,
  businessId: string,
  where: Prisma.WorkOrderItemWhereInput,
  userId?: string | null,
): Promise<void> {
  const items = await tx.workOrderItem.findMany({
    where,
    select: {
      workOrderId: true,
      inventoryItemIdOp: true,
      inventoryItemIdOl: true,
      inventoryItemIdFrame: true,
      workOrder: { select: { orderNumber: true } },
    },
    orderBy: [{ workOrderId: 'asc' }, { id: 'asc' }],
  });
  const perOrder = new Map<string, { orderNumber: string; adjustments: Record<string, number> }>();
  for (const item of items) {
    let entry = perOrder.get(item.workOrderId);
    if (!entry) perOrder.set(item.workOrderId, (entry = { orderNumber: item.workOrder.orderNumber, adjustments: {} }));
    addLinks(entry.adjustments, item, +1);
  }
  for (const [workOrderId, { orderNumber, adjustments }] of perOrder) {
    await applyAdjustments(tx, { businessId, workOrderId, orderNumber, userId }, adjustments);
  }
}
