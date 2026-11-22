/** Formaty kartki wydruku zlecenia (pionowo, w mm). Jedna kartka = strona I + odwrocie. */
export const PRINT_FORMATS = {
  a5: { label: 'A5 (połowa A4)', width: 148, height: 210 },
  c5: { label: 'C5 (22,9 × 16,2 cm)', width: 162, height: 229 },
} as const;

export type PrintFormat = keyof typeof PRINT_FORMATS;

/** Format z parametru adresu; nieznany lub brak = A5. */
export function printFormat(value: string | undefined): PrintFormat {
  return value === 'c5' ? 'c5' : 'a5';
}
