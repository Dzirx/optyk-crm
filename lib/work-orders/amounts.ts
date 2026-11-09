// Kwota i zaliczka zlecenia (po walidacji w schemacie).

import { ValidationError } from '@/lib/api/validation';
import { hasPrices, itemsTotal, type PricedItem } from './totals';

export const NOT_FOUND_INVENTORY = 'Nie znaleziono pozycji magazynu';

/**
 * Kwota wpisana ręcznie ma pierwszeństwo. Gdy jej brak, liczymy sumę cen pozycji
 * (pozycje są już po walidacji, więc „199,50” jest liczbą 199.5).
 */
export function resolveTotal(manual: number | null, items: PricedItem[] | undefined): number | null {
  if (manual !== null) return manual;
  return hasPrices(items) ? itemsTotal(items) : null;
}

export function assertDepositFits(total: unknown, deposit: unknown) {
  if (total == null || deposit == null) return;
  if (Number(deposit) > Number(total)) throw new ValidationError('Zaliczka nie może być większa niż kwota zlecenia');
}
