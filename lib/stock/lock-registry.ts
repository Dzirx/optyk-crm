// Zapamiętuje transakcje, które wzięły blokadę magazynu (lockStock). changeStock sprawdza to w czasie działania.
// Na globalThis, bo w trybie dev ten sam moduł bywa ładowany kilka razy.

import type { Prisma } from '@prisma/client';

const KEY = Symbol.for('optyk.lockedStockTx');
const g = globalThis as unknown as Record<symbol, WeakSet<object> | undefined>;
const locked: WeakSet<object> = (g[KEY] ??= new WeakSet());

export const markStockLocked = (tx: Prisma.TransactionClient): void => void locked.add(tx);
export const holdsStockLock = (tx: Prisma.TransactionClient): boolean => locked.has(tx);
