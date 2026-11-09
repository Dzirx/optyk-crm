import { z } from 'zod';
import { ValidationError } from '@/lib/api/validation';
import { fromValidator } from './common';

const days = fromValidator((v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 3660) throw new ValidationError('Nieprawidłowa liczba dni');
  return n;
});

const limit = fromValidator((v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 50) throw new ValidationError('Nieprawidłowy limit komputerów');
  return n;
});

/** Zmiana dostępu konta: przedłużenie, bez limitu, blokada; wersja Windows: odpięcie komputerów i limit. */
export const updateUserAccessSchema = z.discriminatedUnion(
  'action',
  [
    z.object({ action: z.literal('extend'), days }),
    z.object({ action: z.literal('unlimited') }),
    z.object({ action: z.literal('block') }),
    z.object({ action: z.literal('unpinDevices') }),
    z.object({ action: z.literal('deviceLimit'), limit }),
  ],
  { error: 'Nieznana operacja' },
);
