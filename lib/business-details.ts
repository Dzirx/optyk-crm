import type { Business } from '@prisma/client';

type PrintDetails = Pick<Business, 'name' | 'legalName' | 'street' | 'postalCode' | 'city' | 'nip' | 'phone'>;

/** Adres zakładu w jednej linii: „ul. Lipowa 12, 20-001 Lublin”. Pusty tekst, gdy brak danych. */
export function businessAddress(b: PrintDetails): string {
  const town = [b.postalCode, b.city].filter(Boolean).join(' ');
  return [b.street, town].filter(Boolean).join(', ');
}

/** Nazwa administratora danych: pełna nazwa z CEIDG, a gdy jej brak — nazwa salonu. */
export function businessLegalName(b: PrintDetails): string {
  return b.legalName?.trim() || b.name;
}

/** Brakujące dane zakładu, bez których wydruk (RODO) jest niepełny. */
export function missingPrintDetails(b: PrintDetails): string[] {
  const missing: string[] = [];
  if (!b.legalName?.trim()) missing.push('pełna nazwa firmy');
  if (!b.street?.trim()) missing.push('ulica');
  if (!b.postalCode?.trim()) missing.push('kod pocztowy');
  if (!b.city?.trim()) missing.push('miejscowość');
  if (!b.phone?.trim()) missing.push('telefon');
  return missing;
}
