// Blokada magazynu salonu. Biorą ją wszystkie transakcje zmieniające stany (inwentaryzacja,
// zlecenia, dostawy), zawsze PRZED dotknięciem wierszy towarów, więc szeregują się zamiast się zakleszczać.
//
// Zaraz po wzięciu blokady lockStock zakłada historię ruchów salonu (ensureStockHistory), więc KAŻDA
// transakcja zmieniająca stan zaczyna od zainicjowanego dziennika.

import type { Prisma } from '@prisma/client';
import { ensureStockHistory } from '@/lib/stock/movements';
import { markStockLocked } from '@/lib/stock/lock-registry';
import { STOCK_LOCK_CLASS } from '@/lib/stock/lock-keys';

export async function lockStock(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_LOCK_CLASS}::int, hashtext(${businessId}))`;
  markStockLocked(tx);
  await ensureStockHistory(tx, businessId);
}

/** Limit czasu transakcji, które czekają na blokadę magazynu (zamknięcie spisu może trwać). */
export const STOCK_TX_TIMEOUT = { timeout: 30_000 } as const;
