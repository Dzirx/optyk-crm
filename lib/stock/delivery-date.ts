// Data dostawy: czyste reguły (bez bazy).
//
// Dostawa z datą wsteczną jest dozwolona od chwili minimalnej:
//   max(początek historii magazynu, założenie towaru, koniec ostatniej zakończonej inwentaryzacji + 1 ms).
//  - sprzed początku historii: ruchów z tego okresu nie da się wyliczyć;
//  - sprzed założenia towaru: towar założony po dniu spisu nie wchodzi do tego spisu, a dostawa „sprzed” spisu
//    wstawiłaby do niego sztuki;
//  - sprzed zakończonej inwentaryzacji: różnica ze spisu została już zaksięgowana, więc dostawa z tamtego
//    okresu policzyłaby się podwójnie.

import { ValidationError } from '@/lib/api/validation';
import { formatDatePl, todayIso } from '@/lib/time';

// Zegar przeglądarki może wyprzedzać serwer o chwilę — taką datę traktujemy jak „teraz”.
export const FUTURE_TOLERANCE_MS = 2 * 60_000;

export type DeliveryMinReason = 'history' | 'item' | 'count';

export interface DeliveryBounds {
  /** Początek historii salonu (null = jeszcze nie założona; wtedy nie ogranicza). */
  historyStart: Date | null;
  itemCreatedAt: Date;
  /** asOf najnowszej zakończonej inwentaryzacji salonu (null = brak). */
  lastCountAsOf: Date | null;
}

/** Najwcześniejsza dozwolona data dostawy i powód, dla którego ją wyznaczył. Remis: spis, towar, historia. */
export function deliveryMinimum(b: DeliveryBounds): { at: Date; reason: DeliveryMinReason } {
  let best: { at: Date; reason: DeliveryMinReason } = { at: b.itemCreatedAt, reason: 'item' };
  if (b.lastCountAsOf) {
    const at = new Date(b.lastCountAsOf.getTime() + 1);
    if (at.getTime() >= best.at.getTime()) best = { at, reason: 'count' };
  }
  if (b.historyStart && b.historyStart.getTime() > best.at.getTime()) best = { at: b.historyStart, reason: 'history' };
  return best;
}

function tooEarlyMessage(reason: DeliveryMinReason, at: Date): string {
  switch (reason) {
    case 'history':
      return 'Data dostawy jest sprzed początku historii magazynu — ruchów z tego okresu nie da się dopisać';
    case 'item':
      return `Dostawa nie może mieć daty sprzed dodania towaru (${formatDatePl(at)}).`;
    case 'count':
      return `Dostawa nie może mieć daty sprzed zakończonej inwentaryzacji (${formatDatePl(at)}).`;
  }
}

/**
 * Data dostawy: brak = teraz; z przyszłości (poza tolerancją) i wcześniejsza niż minimum = błąd.
 * Gdy dzień (strefa salonu) wybranej daty jest dniem minimum, a data jest przed minimum
 * (formularz wysyła południe wybranego dnia), przyjmujemy minimum.
 */
export function resolveDeliveryDate(requested: Date | undefined, now: Date, bounds: DeliveryBounds): Date {
  const at = requested ?? now;
  if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) throw new ValidationError('Data dostawy nie może być z przyszłości');
  let result = at > now ? now : at;
  const min = deliveryMinimum(bounds);
  // Przesunięcie tylko dla dnia dodania towaru / startu historii. Dla dnia zakończonej inwentaryzacji
  // nie przesuwamy: towar mógł już zostać policzony na półce, więc dostawa liczyłaby się dwa razy.
  if (result < min.at && min.reason !== 'count' && todayIso(result) === todayIso(min.at)) result = min.at;
  if (result < min.at) {
    // Przy powodzie „spis” podajemy dzień samego spisu (asOf), nie minimum o 1 ms późniejsze.
    throw new ValidationError(tooEarlyMessage(min.reason, min.reason === 'count' && bounds.lastCountAsOf ? bounds.lastCountAsOf : min.at));
  }
  return result;
}
