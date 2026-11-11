/** Polska odmiana: 1 → one, 2–4 (oprócz 12–14) → few, reszta → many. */
export function pluralPl(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const d = abs % 10;
  const dd = abs % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

/** „1 wynik”, „2 wyniki”, „5 wyników”. */
export const wynikiPl = (n: number): string => pluralPl(n, 'wynik', 'wyniki', 'wyników');

/** „1 pozycja”, „2 pozycje”, „5 pozycji”. */
export const pozycjePl = (n: number): string => pluralPl(n, 'pozycja', 'pozycje', 'pozycji');

/** Podpis liczby wyników: PL „1 wynik / 2 wyniki / 5 wyników”, EN „1 result / N results”. */
export function resultsLabel(n: number, language: string): string {
  return language === 'en' ? `${n} ${n === 1 ? 'result' : 'results'}` : `${n} ${wynikiPl(n)}`;
}

/** „1 wizyta”, „2 wizyty”, „5 wizyt”: sama odmiana słowa. */
export const wizytyPl = (n: number): string => pluralPl(n, 'wizyta', 'wizyty', 'wizyt');

/** Podpis liczby wizyt: PL „1 wizyta / 2 wizyty / 5 wizyt”, EN „1 visit / N visits”. */
export function visitsLabel(n: number, language: string): string {
  return language === 'en' ? `${n} ${n === 1 ? 'visit' : 'visits'}` : `${n} ${wizytyPl(n)}`;
}

/** Słowo po „do”: „1 odbiorcy”, „2 odbiorców”, „5 odbiorców” (dopełniacz). */
export const odbiorcyPl = (n: number): string => (Math.abs(n) === 1 ? 'odbiorcy' : 'odbiorców');

/** Podpis „do N odbiorców” po słowie „do”: PL „1 odbiorcy / N odbiorców”, EN „1 recipient / N recipients”. */
export function recipientsLabel(n: number, language: string): string {
  return language === 'en' ? `${n} ${n === 1 ? 'recipient' : 'recipients'}` : `${n} ${odbiorcyPl(n)}`;
}
