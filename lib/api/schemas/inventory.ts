import { z } from 'zod';
import { MONEY } from '@/lib/api/validation';
import { optNum, pageParam, pageSizeParam, patchNum, patchReqNum, reqNum, searchParam, trimmedOrNull } from './common';

export const INVENTORY_QTY = { label: 'Ilość', min: 0, max: 1_000_000, integer: true };
const SPH = { label: 'SPH', min: -50, max: 50 };
const CYL = { label: 'CYL', min: -20, max: 20 };
const DIAMETER = { label: 'Średnica', min: 0, max: 9999.9 };
const PRICE = { label: 'Cena sprzedaży', ...MONEY };
const PURCHASE_PRICE = { label: 'Cena zakupu', ...MONEY };

const category = trimmedOrNull.refine((v) => !v || v.length <= 100, 'Kategoria: najwyżej 100 znaków');

export const MOVEMENT_NOTE_MAX = 500;
const noteField = z
  .string()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v?.trim() || null))
  .refine((v) => !v || v.length <= MOVEMENT_NOTE_MAX, `Notatka: najwyżej ${MOVEMENT_NOTE_MAX} znaków`);

const NAME_REQUIRED = 'Nazwa jest wymagana';

export const createInventorySchema = z.object({
  name: z
    .string({ error: NAME_REQUIRED })
    .refine((v) => v.trim() !== '', NAME_REQUIRED)
    .transform((v) => v.trim()),
  quantity: reqNum(INVENTORY_QTY),
  unit: z.string().nullish(),
  category,
  sph: optNum(SPH),
  cyl: optNum(CYL),
  diameter: optNum(DIAMETER),
  price: optNum(PRICE),
  purchasePrice: optNum(PURCHASE_PRICE),
  notes: trimmedOrNull,
});

// PATCH: brak pola = bez zmiany. Dolną granicę ilości ustala handler (zależy od obecnego stanu).
export const updateInventorySchema = z.object({
  name: z.string().transform((v) => v.trim()).optional(),
  quantity: patchReqNum({ ...INVENTORY_QTY, min: undefined }),
  unit: z.string().optional(),
  category,
  sph: patchNum(SPH),
  cyl: patchNum(CYL),
  diameter: patchNum(DIAMETER),
  price: patchNum(PRICE),
  purchasePrice: patchNum(PURCHASE_PRICE),
  notes: trimmedOrNull,
  // Powód ręcznej korekty ilości (trafia do historii ruchów; bez zmiany ilości jest pomijany).
  note: noteField,
});

// POST /api/inventory/[id]/deliveries
export const DELIVERY_QTY = { label: 'Ilość dostawy', min: 1, max: 1_000_000, integer: true };
export const createDeliverySchema = z.object({
  quantity: reqNum(DELIVERY_QTY),
  // Data dostawy (ISO). Brak = teraz. Zakres sprawdza handler (zależy od początku historii salonu).
  occurredAt: z
    .string({ error: 'Data dostawy: nieprawidłowy format' })
    .nullish()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const d = new Date(v);
      if (isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Data dostawy: nieprawidłowy format' });
        return z.NEVER;
      }
      return d;
    }),
  note: noteField,
});

export const listMovementsQuerySchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam,
});

// GET /api/inventory: bez `page` cała lista (stary kształt), z `page` jedna strona.
export const listInventoryQuerySchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam,
  q: searchParam,
  category: z.string().max(100, 'Kategoria: najwyżej 100 znaków').optional(),
});
