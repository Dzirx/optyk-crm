// Granice daty dostawy z bazy (patrz delivery-date.ts). W zapisie wołać pod blokadą magazynu.

import type { Prisma, PrismaClient } from '@prisma/client';
import { deliveryMinimum, type DeliveryBounds } from '@/lib/stock/delivery-date';

export async function loadDeliveryBounds(
  client: Prisma.TransactionClient | PrismaClient,
  businessId: string,
  itemCreatedAt: Date,
): Promise<DeliveryBounds> {
  const [biz, lastCount] = await Promise.all([
    client.business.findUnique({ where: { id: businessId }, select: { stockHistoryStart: true } }),
    client.stockCount.findFirst({
      where: { businessId, status: 'closed', asOf: { not: null } },
      orderBy: { asOf: 'desc' },
      select: { asOf: true },
    }),
  ]);
  return { historyStart: biz?.stockHistoryStart ?? null, itemCreatedAt, lastCountAsOf: lastCount?.asOf ?? null };
}

/** Najwcześniejsza dozwolona chwila dostawy towaru (dla formularza). */
export async function deliveryMinAt(client: Prisma.TransactionClient | PrismaClient, businessId: string, itemCreatedAt: Date): Promise<Date> {
  return deliveryMinimum(await loadDeliveryBounds(client, businessId, itemCreatedAt)).at;
}
