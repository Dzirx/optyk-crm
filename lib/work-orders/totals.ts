// Liczenie kwot zlecenia. Wspólne dla formularza, API i wydruku.
// Liczymy w groszach, żeby uniknąć błędów zaokrągleń liczb zmiennoprzecinkowych.

type Money = string | number | null | undefined | { toString(): string };

export interface PricedItem {
  framePrice?: Money;
  lensPrice?: Money;
  /** Ceny szkieł per oko (za sztukę). Gdy któraś jest podana, zastępują lensPrice (które i tak jest ich sumą). */
  opLensPrice?: Money;
  olLensPrice?: Money;
  /** Ilość szkieł/soczewek dla oka; brak = 1. */
  opQty?: Money;
  olQty?: Money;
  /** Cena usługi (np. montażu). */
  servicePrice?: Money;
}

function toCents(value: Money): number {
  if (value == null || value === '') return 0;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isBlank(value: Money): boolean {
  return value == null || value === '';
}

/** Ilość sztuk: liczba całkowita ≥ 1, a brak lub zła wartość = 1. */
export function qtyOf(value: Money): number {
  const n = Math.trunc(Number(value == null || value === '' ? 1 : typeof value === 'object' ? value.toString() : value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Cena szkieł/soczewek w groszach: OP × ilość + OL × ilość, a bez cen per oko (stare dane) lensPrice. */
export function lensCents(item: PricedItem): number {
  if (!isBlank(item.opLensPrice) || !isBlank(item.olLensPrice)) {
    return toCents(item.opLensPrice) * qtyOf(item.opQty) + toCents(item.olLensPrice) * qtyOf(item.olQty);
  }
  return toCents(item.lensPrice);
}

function itemCents(item: PricedItem): number {
  return toCents(item.framePrice) + lensCents(item) + toCents(item.servicePrice);
}

/** Suma cen oprawki, szkieł/soczewek i usługi jednej pozycji (zł). */
export function itemTotal(item: PricedItem): number {
  return itemCents(item) / 100;
}

/** Suma wszystkich pozycji zlecenia (zł). */
export function itemsTotal(items: PricedItem[] | null | undefined): number {
  return (items ?? []).reduce((sum, i) => sum + itemCents(i), 0) / 100;
}

/** Czy pozycje mają jakąkolwiek cenę. */
export function hasPrices(items: PricedItem[] | null | undefined): boolean {
  return (items ?? []).some((i) => itemCents(i) !== 0);
}
