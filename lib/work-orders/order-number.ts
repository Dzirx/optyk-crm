// Numeracja zleceń: ZL/<rok>/<nr>, numer rośnie w obrębie roku i salonu.
//
// Dawniej numer był liczbą zleceń + 1, więc po usunięciu zlecenia albo przy dwóch
// równoczesnych zapisach powstawały duplikaty. Teraz bierzemy najwyższy numer z bieżącego
// roku, a blokada transakcyjna (pg_advisory_xact_lock) szereguje zapisy jednego salonu.

import type { Prisma } from '@prisma/client';
import { currentYear } from '@/lib/time';

export class DuplicateOrderNumberError extends Error {
  constructor(public readonly orderNumber: string) {
    super(`Zlecenie o numerze ${orderNumber} już istnieje`);
    this.name = 'DuplicateOrderNumberError';
  }
}

/** Blokuje numerację zleceń salonu do końca transakcji. */
export async function lockOrderNumbering(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'work-order-number:' + businessId}))`;
}

/** Następny wolny numer automatyczny. Wywołuj po lockOrderNumbering. */
export async function nextOrderNumber(tx: Prisma.TransactionClient, businessId: string, now = new Date()): Promise<string> {
  const prefix = `ZL/${currentYear(now)}/`;
  const rows = await tx.workOrder.findMany({
    where: { businessId, orderNumber: { startsWith: prefix } },
    select: { orderNumber: true },
  });
  let max = 0;
  for (const { orderNumber } of rows) {
    const n = Number(orderNumber.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Rzuca DuplicateOrderNumberError, gdy numer jest już zajęty w salonie (poza zleceniem exceptId). */
export async function assertOrderNumberFree(
  tx: Prisma.TransactionClient,
  businessId: string,
  orderNumber: string,
  exceptId?: string,
): Promise<void> {
  const taken = await tx.workOrder.findFirst({
    where: { businessId, orderNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (taken) throw new DuplicateOrderNumberError(orderNumber);
}
