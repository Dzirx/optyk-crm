import { z } from 'zod';
import { MONEY, ValidationError, optionalDate } from '@/lib/api/validation';
import { fromValidator, optDate, optNum, pageParam, pageSizeParam, patchDate, patchNum, searchParam, text } from './common';

const WORK_ORDER_STATUSES = ['pending', 'ready', 'completed'];

const BAD_ITEMS = 'Nieprawidłowe pozycje zlecenia';

const SPH = { min: -50, max: 50 };
const CYL = { min: -20, max: 20 };
const ADD = { min: 0, max: 10 };
const PD = { min: 0, max: 999.9 };
const AXIS = { min: 0, max: 180, integer: true };

// Puste id towaru → null. Typ jest zawężony tylko dla Prisma: prawdziwy UUID sprawdza
// inventoryBelongsTo (lib/api/ownership.ts) przed zapisem.
const inventoryId = fromValidator((v) => (v || null) as string | null);

/** Pozycja zlecenia. `id` zostaje surowe — handler sprawdza, czy należy do zlecenia. */
const itemSchema = z.object(
  {
    id: z.unknown().optional(),
    type: fromValidator((v) => text(v, 50) ?? 'do_dali'),
    opSph: optNum({ label: 'SPH (OP)', ...SPH }),
    opCyl: optNum({ label: 'CYL (OP)', ...CYL }),
    opAxis: optNum({ label: 'OŚ (OP)', ...AXIS }),
    opAdd: optNum({ label: 'ADD (OP)', ...ADD }),
    opPd: optNum({ label: 'PD (OP)', ...PD }),
    olSph: optNum({ label: 'SPH (OL)', ...SPH }),
    olCyl: optNum({ label: 'CYL (OL)', ...CYL }),
    olAxis: optNum({ label: 'OŚ (OL)', ...AXIS }),
    olAdd: optNum({ label: 'ADD (OL)', ...ADD }),
    olPd: optNum({ label: 'PD (OL)', ...PD }),
    frameModel: fromValidator((v) => text(v, 255)),
    ownFrame: fromValidator((v) => v === true),
    lensType: fromValidator((v) => text(v, 100)),
    framePrice: optNum({ label: 'Cena oprawki', ...MONEY }),
    lensPrice: optNum({ label: 'Cena szkieł', ...MONEY }),
    inventoryItemIdOp: inventoryId,
    inventoryItemIdOl: inventoryId,
    inventoryItemIdFrame: inventoryId,
    opOrdered: fromValidator((v) => v === true),
    olOrdered: fromValidator((v) => v === true),
    frameOrdered: fromValidator((v) => v === true),
  },
  { error: BAD_ITEMS },
);

const items = z.array(itemSchema, { error: BAD_ITEMS }).optional();

const customerId = z.string({ error: 'Wymagane ID klienta' }).min(1, 'Wymagane ID klienta');

/** Numer wpisany ręcznie; pusty = numer automatyczny (POST) albo bez zmiany (PATCH). */
const orderNumber = fromValidator((v) => (typeof v === 'string' ? v.trim().slice(0, 50) : ''));

const status = fromValidator((v): string | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !WORK_ORDER_STATUSES.includes(v)) throw new ValidationError('Nieprawidłowy status zlecenia');
  return v;
});

const TOTAL = { label: 'Kwota', ...MONEY };
const DEPOSIT = { label: 'Zaliczka', ...MONEY };

export const createWorkOrderSchema = z.object({
  customerId,
  orderNumber,
  receivedAt: fromValidator((v) => {
    if (!v) throw new ValidationError('Data przyjęcia jest wymagana');
    return optionalDate(v, 'data przyjęcia')!;
  }),
  pickupDate: optDate('data odbioru'),
  status,
  totalAmount: optNum(TOTAL),
  deposit: optNum(DEPOSIT),
  notes: fromValidator((v) => text(v, 10_000)),
  items,
});

// PATCH: pola, których nie ma w żądaniu, zostają bez zmian (np. zmiana statusu z listy
// nie może kasować daty odbioru).
export const updateWorkOrderSchema = z.object({
  customerId: z.string().optional(),
  orderNumber,
  receivedAt: patchDate('data przyjęcia'), // pusta data przyjęcia = bez zmiany
  pickupDate: patchDate('data odbioru'),
  status,
  totalAmount: patchNum(TOTAL),
  deposit: patchNum(DEPOSIT),
  notes: fromValidator((v) => text(v, 10_000), true),
  items,
});

// GET /api/work-orders: bez `page` zwraca całą listę (stary kształt), z `page` jedną stronę.
export const listWorkOrdersQuerySchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam,
  q: searchParam,
  status: z.enum(['pending', 'ready', 'completed'], { error: 'Nieprawidłowy status zlecenia' }).optional(),
});
