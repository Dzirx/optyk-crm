// Sprawdzanie, czy identyfikatory z treści żądania należą do salonu zalogowanego użytkownika.
// Każdy id z body musi przejść przez te funkcje przed zapisem — inaczej można
// powiązać lub zmienić rekordy innego salonu (IDOR).

import { db } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Czy klient należy do salonu. */
export async function customerBelongsTo(businessId: string, customerId: unknown): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const found = await db.customer.findFirst({
    where: { id: customerId, businessId },
    select: { id: true },
  });
  return !!found;
}

type ItemWithInventory = {
  inventoryItemIdOp?: unknown;
  inventoryItemIdOl?: unknown;
  inventoryItemIdFrame?: unknown;
};

/** Wszystkie niepuste id towarów z magazynu użyte w pozycjach zlecenia. */
export function inventoryIdsFromItems(items: ItemWithInventory[] | undefined): unknown[] {
  const ids: unknown[] = [];
  for (const item of items ?? []) {
    for (const id of [item.inventoryItemIdOp, item.inventoryItemIdOl, item.inventoryItemIdFrame]) {
      if (id != null && id !== '') ids.push(id);
    }
  }
  return ids;
}

/** Czy wszystkie towary należą do salonu. Pusta lista = true. */
export async function inventoryBelongsTo(businessId: string, ids: unknown[]): Promise<boolean> {
  if (ids.length === 0) return true;
  if (!ids.every(isUuid)) return false;
  const unique = [...new Set(ids as string[])];
  const count = await db.inventoryItem.count({
    where: { id: { in: unique }, businessId },
  });
  return count === unique.length;
}
