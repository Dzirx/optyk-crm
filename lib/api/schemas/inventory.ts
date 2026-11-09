import { z } from 'zod';
import { MONEY } from '@/lib/api/validation';
import { optNum, patchNum, patchReqNum, reqNum, trimmedOrNull } from './common';

export const INVENTORY_QTY = { label: 'Ilość', min: 0, max: 1_000_000, integer: true };
const SPH = { label: 'SPH', min: -50, max: 50 };
const CYL = { label: 'CYL', min: -20, max: 20 };
const DIAMETER = { label: 'Średnica', min: 0, max: 9999.9 };
const PRICE = { label: 'Cena', ...MONEY };

const NAME_REQUIRED = 'Nazwa jest wymagana';

export const createInventorySchema = z.object({
  name: z
    .string({ error: NAME_REQUIRED })
    .refine((v) => v.trim() !== '', NAME_REQUIRED)
    .transform((v) => v.trim()),
  quantity: reqNum(INVENTORY_QTY),
  unit: z.string().nullish(),
  category: trimmedOrNull,
  sph: optNum(SPH),
  cyl: optNum(CYL),
  diameter: optNum(DIAMETER),
  price: optNum(PRICE),
  notes: trimmedOrNull,
});

// PATCH: brak pola = bez zmiany. Dolną granicę ilości ustala handler (zależy od obecnego stanu).
export const updateInventorySchema = z.object({
  name: z.string().transform((v) => v.trim()).optional(),
  quantity: patchReqNum({ ...INVENTORY_QTY, min: undefined }),
  unit: z.string().optional(),
  category: trimmedOrNull,
  sph: patchNum(SPH),
  cyl: patchNum(CYL),
  diameter: patchNum(DIAMETER),
  price: patchNum(PRICE),
  notes: trimmedOrNull,
});
