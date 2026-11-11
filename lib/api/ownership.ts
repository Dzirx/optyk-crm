// Sprawdzanie, czy identyfikatory z treści żądania należą do salonu zalogowanego użytkownika.
// Każdy id z body musi przejść przez te funkcje przed zapisem — inaczej można
// powiązać lub zmienić rekordy innego salonu (IDOR).

import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/api/validation';

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

/**
 * Czy wszystkie towary należą do salonu i nie są usunięte. Pusta lista = true.
 * keepIds: towary już powiązane z edytowanym zleceniem — mogą być usunięte (zlecenie dalej działa).
 */
export async function inventoryBelongsTo(businessId: string, ids: unknown[], keepIds: Iterable<string> = []): Promise<boolean> {
  if (ids.length === 0) return true;
  if (!ids.every(isUuid)) return false;
  const unique = [...new Set(ids as string[])];
  const keep = [...keepIds];
  const count = await db.inventoryItem.count({
    where: {
      id: { in: unique },
      businessId,
      OR: [{ deletedAt: null }, ...(keep.length > 0 ? [{ id: { in: keep } }] : [])],
    },
  });
  return count === unique.length;
}

/**
 * Ponowne sprawdzenie POD BLOKADĄ MAGAZYNU: nowo powiązane towary istnieją, należą do salonu i nie są usunięte.
 * Towar mógł zostać usunięty między wcześniejszym sprawdzeniem a blokadą. keepIds: powiązania, które zlecenie już ma.
 * Brak któregoś towaru = NotFoundError (404).
 */
export async function assertInventoryLinkable(
  tx: Prisma.TransactionClient,
  businessId: string,
  ids: unknown[],
  keepIds: Iterable<string> = [],
): Promise<void> {
  const keep = new Set(keepIds);
  const fresh = [...new Set(ids.filter((id): id is string => typeof id === 'string' && !keep.has(id)))];
  if (fresh.length === 0) return;
  const count = await tx.inventoryItem.count({ where: { id: { in: fresh }, businessId, deletedAt: null } });
  if (count !== fresh.length) throw new NotFoundError('Nie znaleziono towaru');
}
