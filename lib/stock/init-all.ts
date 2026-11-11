// Zakłada historię magazynu (ruchy INITIAL + stockHistoryStart) wszystkim salonom, które jej jeszcze nie mają.
// Uruchamiane przy starcie (seed / aplikacja desktop), żeby historia zaczynała się w dniu wdrożenia,
// a nie dopiero przy pierwszej zmianie stanu. Idempotentne: salon z historią jest pomijany.

import { db } from '@/lib/db';
import { STOCK_TX_TIMEOUT, lockStock } from '@/lib/stock-count/lock';

/** Zwraca liczbę salonów, którym założono historię. Każdy salon w osobnej transakcji pod blokadą magazynu. */
export async function initAllStockHistories(): Promise<number> {
  const pending = await db.business.findMany({ where: { stockHistoryStart: null }, select: { id: true }, orderBy: { id: 'asc' } });
  let done = 0;
  for (const { id } of pending) {
    // lockStock bierze blokadę i zakłada historię (ensureStockHistory ponownie czyta stan, więc wyścig jest bezpieczny).
    await db.$transaction(async (tx) => {
      await lockStock(tx, id);
    }, STOCK_TX_TIMEOUT);
    done++;
  }
  return done;
}
