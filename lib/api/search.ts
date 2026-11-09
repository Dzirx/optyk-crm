// Wyszukiwanie na liście klientów i zleceń (po stronie serwera).
// Zwraca warunki Prisma `AND`; każdy warunek zawsze trafia obok `businessId` salonu w `where`.

import type { Prisma } from '@prisma/client';

const NUMERIC_ONLY = /^[\d\s+\-().]+$/;

/** Same cyfry z tekstu (telefony w bazie są bez spacji, np. +48500100200). */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}


/**
 * Każde słowo z `q` musi pasować do któregoś z pól (osoby: imię, nazwisko, e-mail, telefon).
 * `q` złożone z samych cyfr, spacji, `+` i `-` to numer telefonu: porównujemy same cyfry
 * całego tekstu ("500 100 200" → "500100200"), a nie osobne słowa.
 */
function wordConditions<T>(
  q: string,
  textFields: (word: string) => T[],
  phone: (digits: string) => T,
  extraWhole: (text: string) => T[] = () => [],
): { OR: T[] }[] {
  if (NUMERIC_ONLY.test(q)) {
    const digits = digitsOf(q);
    return [{ OR: [...(digits ? [phone(digits)] : []), ...extraWhole(q)] }];
  }
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // Do telefonu porównujemy tylko słowa-numery; „Testowy5” nie może pasować do każdego numeru z piątką.
      const digits = /^[\d+\-().]+$/.test(word) ? digitsOf(word) : '';
      return { OR: [...textFields(word), ...(digits ? [phone(digits)] : [])] };
    });
}

// Prisma nie zamienia znaków LIKE (% _ \) na zwykłe: robimy to sami, żeby fraza „50%” szukała dosłownie.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
const contains = (value: string) => ({ contains: escapeLike(value), mode: 'insensitive' as const });

export function customerSearchWhere(q: string | undefined): Prisma.CustomerWhereInput[] {
  if (!q) return [];
  return wordConditions<Prisma.CustomerWhereInput>(
    q,
    (w) => [{ name: contains(w) }, { surname: contains(w) }, { email: contains(w) }],
    (digits) => ({ phone: { contains: digits } }),
    (text) => [{ email: contains(text) }],
  );
}

export function workOrderSearchWhere(q: string | undefined): Prisma.WorkOrderWhereInput[] {
  if (!q) return [];
  return wordConditions<Prisma.WorkOrderWhereInput>(
    q,
    (w) => [
      { orderNumber: contains(w) },
      { customer: { name: contains(w) } },
      { customer: { surname: contains(w) } },
    ],
    (digits) => ({ customer: { phone: { contains: digits } } }),
    (text) => [{ orderNumber: contains(text) }],
  );
}

