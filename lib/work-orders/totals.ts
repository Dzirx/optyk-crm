// Liczenie kwot zlecenia. Wspólne dla formularza, API i wydruku.
// Liczymy w groszach, żeby uniknąć błędów zaokrągleń liczb zmiennoprzecinkowych.

type Money = string | number | null | undefined | { toString(): string };

export interface PricedItem {
  framePrice?: Money;
  lensPrice?: Money;
  /** Ceny szkieł per oko. Gdy któraś jest podana, zastępują lensPrice (które i tak jest ich sumą). */
  opLensPrice?: Money;
  olLensPrice?: Money;
}

function toCents(value: Money): number {
  if (value == null || value === '') return 0;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isBlank(value: Money): boolean {
  return value == null || value === '';
}

/** Cena szkieł/soczewek w groszach: suma OP + OL, a bez nich (stare dane) lensPrice. */
export function lensCents(item: PricedItem): number {
  if (!isBlank(item.opLensPrice) || !isBlank(item.olLensPrice)) {
    return toCents(item.opLensPrice) + toCents(item.olLensPrice);
  }
  return toCents(item.lensPrice);
}

/** Suma cen oprawki i szkieł/soczewek jednej pozycji (zł). */
export function itemTotal(item: PricedItem): number {
  return (toCents(item.framePrice) + lensCents(item)) / 100;
}

/** Suma wszystkich pozycji zlecenia (zł). */
export function itemsTotal(items: PricedItem[] | null | undefined): number {
  return (items ?? []).reduce((sum, i) => sum + toCents(i.framePrice) + lensCents(i), 0) / 100;
}

/** Czy pozycje mają jakąkolwiek cenę. */
export function hasPrices(items: PricedItem[] | null | undefined): boolean {
  return (items ?? []).some((i) => toCents(i.framePrice) !== 0 || lensCents(i) !== 0);
}
