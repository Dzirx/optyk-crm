// Samodzielne uruchomienie: założenie historii magazynu wszystkim salonom (wersja Windows po aktualizacji schematu).

import { db } from './index';
import { initAllStockHistories } from '@/lib/stock/init-all';

initAllStockHistories()
  .then(async (n) => {
    console.log(`init-stock: historia założona w ${n} salonach`);
    await db.$disconnect();
  })
  .catch((error) => {
    console.error('init-stock:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
