// Obliczenia inwentaryzacji (czyste funkcje, bez bazy danych).

import { endOfZonedDay } from '../time';

/** Koniec dnia spisu: ostatnia ms dnia kalendarzowego w strefie salonu (countDate = kolumna @db.Date, północ UTC). */
export function endOfCountDay(countDate: Date): Date {
  return endOfZonedDay(countDate.toISOString().slice(0, 10));
}

/**
 * Stan „na półce” towaru. Ujemny stan to sztuki zamówione u dostawcy (backorder), których
 * fizycznie nie ma, więc punktem odniesienia przy liczeniu jest max(0, stan).
 */
export function shelf(qty: number): number {
  return Math.max(0, qty);
}

export interface CountedLine {
  countedQty: number | null;
  systemQtyAtCount: number | null;
}

/**
 * Pozycja „ruszona” = użytkownik wpisał wartość (touched), także równą stanowi z programu.
 * Pozycje sprzed wprowadzenia pola: ruszona, gdy policzone != stan z programu.
 */
export function isTouched(l: { touched: boolean; countedQty: number | null; systemQtyAtCount: number | null }): boolean {
  return l.touched || (l.countedQty !== null && l.systemQtyAtCount !== null && l.countedQty !== l.systemQtyAtCount);
}

/** Różnica: policzone − stan w programie w chwili startu. Brak danych (stary spis) = null. */
export function countDiff(line: CountedLine): number | null {
  if (line.countedQty === null || line.systemQtyAtCount === null) return null;
  return line.countedQty - line.systemQtyAtCount;
}

/**
 * Chwila, na którą liczymy stany spisu: T = min(teraz, koniec dnia spisu).
 * Spis na dzień przyszły jest „żywy” (T = teraz), na dzień miniony stały (T = koniec tego dnia).
 */
export function countMoment(now: Date, endOfCountDay: Date): Date {
  return now.getTime() < endOfCountDay.getTime() ? now : endOfCountDay;
}

/** Chwila korekty pozycji edytowanej w chwili t: τ = min(t, koniec dnia spisu). To samo działanie co T. */
export const correctionMoment = countMoment;

/**
 * Arkusz po zamknięciu: ilość = stan na półce po korekcie (ujemny → 0), „powinno być” = ilość − różnica,
 * żeby ekran zgadzał się z różnicą. `currentQty` to stan z dziennika na chwilę arkusza PRZED korektą
 * (czyli stan po korekcie − appliedDiff). Gdy nic nie jest ujemne, wynik = shelf(stan po korekcie).
 */
export function closedSheetQty(currentQty: number, appliedDiff: number): { countedQty: number; systemQtyAtCount: number } {
  // Na półce = fizyczny stan (bez sztuk zamówionych u dostawcy, czyli ujemnej części) + korekta ze spisu.
  // Przykład: stan −2 (2 szt. zamówione), na półce znaleziono 1 → arkusz 1, magazyn −1.
  const countedQty = shelf(shelf(currentQty) + appliedDiff);
  return { countedQty, systemQtyAtCount: countedQty - appliedDiff };
}

export type PriceBasis = 'purchase' | 'sale';

export function parsePriceBasis(value: string | null | undefined): PriceBasis {
  return value === 'sale' ? 'sale' : 'purchase';
}

/** Wartość w groszach (liczby całkowite — bez błędów zaokrągleń). Brak ceny = null. */
export function valueCents(qty: number, price: number | null): number | null {
  if (price === null) return null;
  return Math.round(price * 100) * qty;
}

export interface SummaryLine extends CountedLine {
  price: number | null; // cena do wyceny (wg wybranej podstawy)
}

export interface CountSummary {
  totalLines: number;
  linesWithDiff: number;
  shortageUnits: number; // suma niedoborów (dodatnia liczba sztuk)
  surplusUnits: number; // suma nadwyżek
  valueCents: number; // wartość policzonych pozycji z ceną
  diffValueCents: number; // zmiana wartości po inwentaryzacji (suma różnica × cena, pozycje z ceną)
  pricelessLines: number; // policzone (ilość > 0) pozycje bez ceny
}

export function summarize(lines: SummaryLine[]): CountSummary {
  const s: CountSummary = {
    totalLines: lines.length,
    linesWithDiff: 0,
    shortageUnits: 0,
    surplusUnits: 0,
    valueCents: 0,
    diffValueCents: 0,
    pricelessLines: 0,
  };
  for (const l of lines) {
    if (l.countedQty === null) continue; // stare dane sprzed pre-wypełniania
    const diff = countDiff(l);
    if (diff) {
      s.linesWithDiff++;
      if (diff < 0) s.shortageUnits += -diff;
      else s.surplusUnits += diff;
      const dv = valueCents(diff, l.price);
      if (dv !== null) s.diffValueCents += dv;
    }
    if (l.countedQty > 0) {
      const v = valueCents(l.countedQty, l.price);
      if (v === null) s.pricelessLines++;
      else s.valueCents += v;
    }
  }
  return s;
}
