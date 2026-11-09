// Liczenie kwot zlecenia. Wspólne dla formularza, API i wydruku.
// Liczymy w groszach, żeby uniknąć błędów zaokrągleń liczb zmiennoprzecinkowych.

type Money = string | number | null | undefined | { toString(): string };

export interface PricedItem {
  framePrice?: Money;
  lensPrice?: Money;
}

function toCents(value: Money): number {
  if (value == null || value === '') return 0;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Suma cen oprawki i szkieł/soczewek jednej pozycji (zł). */
export function itemTotal(item: PricedItem): number {
  return (toCents(item.framePrice) + toCents(item.lensPrice)) / 100;
}

/** Suma wszystkich pozycji zlecenia (zł). */
export function itemsTotal(items: PricedItem[] | null | undefined): number {
  return (items ?? []).reduce((sum, i) => sum + toCents(i.framePrice) + toCents(i.lensPrice), 0) / 100;
}

/** Czy pozycje mają jakąkolwiek cenę. */
export function hasPrices(items: PricedItem[] | null | undefined): boolean {
  return (items ?? []).some((i) => toCents(i.framePrice) !== 0 || toCents(i.lensPrice) !== 0);
}

/** Suma cen pozycji magazynowych o podanych id (np. soczewka OP + OL). Pomija puste id. */
export function inventoryPriceSum(
  ids: Array<string | null | undefined>,
  inventory: Array<{ id: string; price: Money }>,
): number | null {
  let cents = 0;
  let found = false;
  for (const id of ids) {
    if (!id) continue;
    const inv = inventory.find((x) => x.id === id);
    if (inv && inv.price != null && inv.price !== '') {
      cents += toCents(inv.price);
      found = true;
    }
  }
  return found ? cents / 100 : null;
}
