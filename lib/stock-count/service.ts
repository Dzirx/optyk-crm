// Inwentaryzacja (spis z natury): operacje na bazie. Wszystko w obrębie jednego salonu.
//
// Współbieżność: każda zmiana inwentaryzacji (start, zapis liczenia, zamknięcie, usunięcie,
// dosypanie pozycji) bierze tę samą blokadę transakcyjną salonu (pg_advisory_xact_lock),
// więc zapis po zamknięciu zawsze widzi status „closed”, a dwa starty nie utworzą dwóch otwartych spisów.

import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { closedSheetQty, countDiff, countMoment, endOfCountDay, isTouched, shelf, summarize, type PriceBasis, type CountSummary } from './math';
import { STOCK_TX_TIMEOUT, lockStock } from './lock';
import { changeStock, stockAt, stockAtPoints } from '@/lib/stock/movements';
import { formatDatePl } from '@/lib/time';

export class StockCountError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409) {
    super(message);
    this.name = 'StockCountError';
  }
}

export const MSG = {
  notFound: 'Nie znaleziono inwentaryzacji',
  lineNotFound: 'Nie znaleziono pozycji inwentaryzacji',
  alreadyOpen: 'Inwentaryzacja jest już rozpoczęta. Zakończ ją albo anuluj, zanim zaczniesz nową.',
  closed: 'Inwentaryzacja jest zakończona — nie można jej zmieniać.',
  qtyLockedByCount: 'Trwa inwentaryzacja. Zmień ilość w inwentaryzacji albo ją zakończ.',
  deleteClosed: 'Zakończonej inwentaryzacji nie można usunąć.',
  beforeHistory: (start: Date) =>
    `Historia magazynu zaczyna się ${formatDatePl(start)}. Inwentaryzacji na wcześniejszy dzień nie da się wyliczyć.`,
  beforeClosedCount: (countDate: Date) =>
    `Inwentaryzacja na ${formatDatePl(countDate)} jest już zakończona. Nie można liczyć wcześniejszego dnia.`,
};

type Tx = Prisma.TransactionClient;

const lock = lockStock;

const sameDecimal = (a: Prisma.Decimal | null, b: Prisma.Decimal | null): boolean => (a === null || b === null ? a === b : a.equals(b));

const toNum = (d: { toNumber(): number } | null | undefined): number | null => (d ? d.toNumber() : null);

async function ownedCount(tx: Tx, businessId: string, id: string) {
  const count = await tx.stockCount.findFirst({ where: { id, businessId } });
  if (!count) throw new StockCountError(MSG.notFound, 404);
  return count;
}

type CountHead = { id: string; countDate: Date };

/** T = min(teraz, koniec dnia spisu): chwila, na którą liczymy stany spisu. */
const momentOf = (count: CountHead, now: Date = new Date()): Date => countMoment(now, endOfCountDay(count.countDate));

function snapshotOf(item: {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  purchasePrice: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
}, stockCountId: string, qty: number, at: Date) {
  // Wstępnie: stan z programu = policzone, więc pozycja startuje jako „zgadza się”.
  return {
    countedQty: shelf(qty),
    systemQtyAtCount: shelf(qty),
    countedAt: at,
    touched: false,
    stockCountId,
    inventoryItemId: item.id,
    name: item.name,
    unit: item.unit,
    category: item.category,
    purchasePrice: item.purchasePrice,
    salePrice: item.price,
  };
}

/** Stan towaru z dziennika na chwilę `at` (jedna pozycja). */
async function itemStockAt(tx: Tx, businessId: string, itemId: string, at: Date): Promise<number> {
  const r = await tx.stockMovement.aggregate({
    where: { businessId, inventoryItemId: itemId, occurredAt: { lte: at } },
    _sum: { delta: true },
  });
  return r._sum.delta ?? 0;
}

type SyncLine = { id: string; inventoryItemId: string | null; countedQty: number | null; systemQtyAtCount: number | null; countedAt: Date | null; touched: boolean };

/** Największy seq ruchów salonu (0 = brak ruchów). */
async function maxMovementSeq(tx: Tx, businessId: string): Promise<bigint> {
  const r = await tx.stockMovement.findFirst({ where: { businessId }, orderBy: { seq: 'desc' }, select: { seq: true } });
  return r?.seq ?? BigInt(0);
}

/**
 * Synchronizacja pozycji spisu z dziennikiem ruchów (pod blokadą). T = min(teraz, koniec dnia spisu).
 *  - Pozycja nieruszona (touched = false) idzie za dziennikiem: obie wartości = max(0, stan na T),
 *    countedAt = T. Dzięki temu sprzedaż w trakcie spisu i dostawa wsteczna do końca dnia spisu są widoczne
 *    na ekranie, arkuszu i w CSV, a różnica zostaje 0.
 *  - Pozycja ruszona: stan z programu = max(0, stan na chwilę jej liczenia countedAt). Przelicza się
 *    go na nowo, bo dostawa wsteczna mogła zmienić stan w tej chwili po zapisie liczenia.
 * Stany liczą się dwoma zapytaniami (nieruszone: jedna chwila T; ruszone: każda w swojej chwili),
 * zapisy dotyczą tylko pozycji, które się zmieniają.
 */
async function syncLines(tx: Tx, businessId: string, count: CountHead, now: Date): Promise<void> {
  const T = momentOf(count, now);
  const lines: SyncLine[] = await tx.stockCountLine.findMany({
    where: { stockCountId: count.id, inventoryItemId: { not: null } },
    select: { id: true, inventoryItemId: true, countedQty: true, systemQtyAtCount: true, countedAt: true, touched: true },
  });
  if (lines.length === 0) return;

  // Jednorazowe uzupełnienie: pozycje sprzed pola `touched`, w których wpisano wartość różną od stanu.
  const legacy = lines.filter((l) => !l.touched && isTouched(l));
  if (legacy.length > 0) {
    await tx.stockCountLine.updateMany({ where: { id: { in: legacy.map((l) => l.id) } }, data: { touched: true } });
    for (const l of legacy) l.touched = true;
  }

  const untouched = lines.filter((l) => !l.touched);
  const touched = lines.filter((l) => l.touched);
  const atT = untouched.length > 0 ? await stockAt(tx, businessId, T, untouched.map((l) => l.inventoryItemId as string)) : new Map<string, number>();
  const atTau = touched.length > 0
    ? await stockAtPoints(tx, businessId, touched.map((l) => ({ itemId: l.inventoryItemId as string, at: l.countedAt ?? T })))
    : new Map<string, number>();

  for (const l of untouched) {
    const q = shelf(atT.get(l.inventoryItemId as string) ?? 0);
    if (l.countedQty !== q || l.systemQtyAtCount !== q) {
      await tx.stockCountLine.update({ where: { id: l.id }, data: { countedQty: q, systemQtyAtCount: q, countedAt: T } });
    }
  }
  for (const l of touched) {
    const base = shelf(atTau.get(l.inventoryItemId as string) ?? 0);
    if (l.systemQtyAtCount !== base) await tx.stockCountLine.update({ where: { id: l.id }, data: { systemQtyAtCount: base } });
  }
}

/** Towar usunięty do chwili T znika ze spisu (spis na minioną datę zachowuje towary usunięte później). Zwraca liczbę usuniętych pozycji. */
async function dropDeletedLines(tx: Tx, count: CountHead, now: Date): Promise<number> {
  const T = momentOf(count, now);
  const r = await tx.stockCountLine.deleteMany({
    where: { stockCountId: count.id, OR: [{ inventoryItemId: null }, { inventoryItem: { deletedAt: { lte: T } } }] },
  });
  return r.count;
}

/**
 * Dodaje pozycje dla towarów, które istniały w chwili T i nie mają jeszcze wiersza w tym spisie.
 * Towar założony po T nie wchodzi do spisu; usunięty po T wchodzi (usunięty do T już nie). Zwraca liczbę dodanych.
 */
async function addMissingLines(tx: Tx, businessId: string, count: CountHead, now: Date = new Date()): Promise<number> {
  const T = momentOf(count, now);
  const missing = await tx.inventoryItem.findMany({
    where: {
      businessId,
      createdAt: { lte: T },
      OR: [{ deletedAt: null }, { deletedAt: { gt: T } }],
      stockCountLines: { none: { stockCountId: count.id } },
    },
  });
  if (missing.length === 0) return 0;
  const atT = await stockAt(tx, businessId, T, missing.map((i) => i.id));
  const created = await tx.stockCountLine.createMany({
    data: missing.map((i) => snapshotOf(i, count.id, atT.get(i.id) ?? 0, T)),
    skipDuplicates: true,
  });
  return created.count;
}

/**
 * Odświeża otwarty spis względem dziennika: usuwa pozycje usuniętych towarów, dosypuje brakujące i synchronizuje stany.
 * allowSkip: gdy od ostatniej synchronizacji nie przybył żaden ruch salonu (seq), T nie przekroczyło końca dnia spisu
 * i nic nie zostało dodane ani usunięte, stany nie mogły się zmienić — pomijamy zapytania o stany i zapisy.
 */
async function refreshCount(tx: Tx, businessId: string, count: CountHead & { syncedSeq: bigint | null; syncedAt: Date | null }, now: Date, allowSkip: boolean): Promise<void> {
  const dropped = await dropDeletedLines(tx, count, now);
  const added = await addMissingLines(tx, businessId, count, now);
  const seq = await maxMovementSeq(tx, businessId);
  const endD = endOfCountDay(count.countDate);
  const crossedEnd = !!count.syncedAt && count.syncedAt.getTime() < endD.getTime() && now.getTime() >= endD.getTime();
  const upToDate = count.syncedSeq !== null && count.syncedSeq === seq && !!count.syncedAt && !crossedEnd && dropped === 0 && added === 0;
  if (allowSkip && upToDate) return;
  await syncLines(tx, businessId, count, now);
  await tx.stockCount.update({ where: { id: count.id }, data: { syncedSeq: seq, syncedAt: now } });
}

/** Spis bez pól technicznych synchronizacji (BigInt nie serializuje się do JSON). */
function publicCount<T extends { syncedSeq: bigint | null; syncedAt: Date | null }>(c: T): Omit<T, 'syncedSeq' | 'syncedAt'> {
  const { syncedSeq: _s, syncedAt: _a, ...rest } = c;
  return rest;
}

/** Start: jeden otwarty spis na salon (409 przy drugim). */
export async function startStockCount(businessId: string, countDate: Date, notes: string | null) {
  return db.$transaction(
    async (tx) => {
      await lock(tx, businessId); // zakłada też historię magazynu, jeśli salon jej jeszcze nie ma
      const biz = await tx.business.findUnique({ where: { id: businessId }, select: { stockHistoryStart: true } });
      const start = biz?.stockHistoryStart;
      if (!start) throw new Error('Historia magazynu nie została założona');
      if (endOfCountDay(countDate).getTime() < start.getTime()) throw new StockCountError(MSG.beforeHistory(start), 400);
      const open = await tx.stockCount.findFirst({ where: { businessId, status: 'open' }, select: { id: true } });
      if (open) throw new StockCountError(MSG.alreadyOpen, 409);
      // Spis na wcześniejszy dzień niż zakończony zaksięgowałby różnice drugi raz (różnice zakończonego spisu są już w dzienniku).
      const lastClosed = await tx.stockCount.findFirst({
        where: { businessId, status: 'closed', asOf: { not: null } },
        orderBy: { asOf: 'desc' },
        select: { asOf: true, countDate: true },
      });
      if (lastClosed?.asOf && endOfCountDay(countDate).getTime() < lastClosed.asOf.getTime()) {
        throw new StockCountError(MSG.beforeClosedCount(lastClosed.countDate), 409);
      }
      const count = await tx.stockCount.create({ data: { businessId, countDate, notes, status: 'open' } });
      await addMissingLines(tx, businessId, count);
      return publicCount(count);
    },
    { timeout: 30_000 },
  );
}

/** Zapis policzonej ilości dla jednej pozycji (null = przywróć stan z programu). */
export async function setLineCount(businessId: string, countId: string, lineId: string, countedQty: number | null) {
  return db.$transaction(async (tx) => {
    await lock(tx, businessId);
    const count = await ownedCount(tx, businessId, countId);
    if (count.status !== 'open') throw new StockCountError(MSG.closed, 409);
    const line = await tx.stockCountLine.findFirst({ where: { id: lineId, stockCountId: countId } });
    if (!line) throw new StockCountError(MSG.lineNotFound, 404);
    // τ = min(teraz, koniec dnia spisu): chwila, w której liczenie jest prawdziwe. Stan z programu = stan z dziennika na τ.
    const tau = momentOf(count);
    const program = line.inventoryItemId ? shelf(await itemStockAt(tx, businessId, line.inventoryItemId, tau)) : null;
    if (countedQty === null) {
      // Wyczyszczenie = powrót do stanu z programu (różnica 0).
      const q = program ?? line.systemQtyAtCount ?? line.countedQty ?? 0;
      return tx.stockCountLine.update({ where: { id: line.id }, data: { countedQty: q, systemQtyAtCount: q, countedAt: tau, touched: false } });
    }
    return tx.stockCountLine.update({
      where: { id: line.id },
      // Pozycja bez towaru (stary spis): za stan przyjmujemy policzoną ilość, różnica 0.
      // touched: wpisana wartość (także równa stanowi z programu) zostaje potwierdzona i nie idzie za dziennikiem.
      data: { countedQty, systemQtyAtCount: program ?? countedQty, countedAt: tau, touched: true },
    });
  }, STOCK_TX_TIMEOUT);
}

/**
 * Zakończenie. Każda różnica trafia do dziennika jako STOCKTAKE z occurredAt = chwila liczenia pozycji (τ),
 * czyli w moment, w którym była prawdziwa; bieżący stan towaru zmienia się o tę różnicę.
 * Arkusz: ilość każdej pozycji = max(0, stan z dziennika na T_close) po wpisaniu korekt,
 * T_close = min(zamknięcie, koniec dnia spisu); zapisujemy go w `asOf`.
 */
export async function closeStockCount(businessId: string, countId: string, userId?: string | null) {
  return db.$transaction(
    async (tx) => {
      await lock(tx, businessId);
      const count = await ownedCount(tx, businessId, countId);
      if (count.status !== 'open') throw new StockCountError(MSG.closed, 409);
      const now = new Date();
      const tClose = momentOf(count, now);
      await refreshCount(tx, businessId, count, now, false);

      // Stała kolejność (po towarze) — ta sama co w innych transakcjach, żeby się nie zakleszczały.
      const lines = await tx.stockCountLine.findMany({
        where: { stockCountId: countId, inventoryItemId: { not: null } },
        include: { inventoryItem: true },
        orderBy: [{ inventoryItemId: 'asc' }, { id: 'asc' }],
      });
      const applied = new Map<string, number>();
      for (const line of lines) {
        const item = line.inventoryItem;
        if (!item) continue;
        const diff = countDiff(line) ?? 0;
        applied.set(line.id, diff);
        if (diff === 0) continue;
        await changeStock(tx, {
          businessId,
          itemId: item.id,
          delta: diff,
          type: 'STOCKTAKE',
          occurredAt: line.countedAt ?? tClose,
          stockCountId: countId,
          userId,
          allowNegative: true,
          note: 'Różnica z inwentaryzacji',
        });
        if (item.deletedAt) {
          // Towar usunięty po dniu spisu ma zostać na 0: korekta ze spisu jest zdjęta od razu (po T, więc arkusz jej nie widzi).
          await changeStock(tx, {
            businessId,
            itemId: item.id,
            delta: -diff,
            type: 'REMOVAL',
            occurredAt: now,
            stockCountId: countId,
            userId,
            allowNegative: true,
            note: 'Usunięty towar: zdjęcie korekty z inwentaryzacji',
          });
        }
      }

      // Arkusz: stan z dziennika na T_close liczony PO wpisaniu korekt.
      const after = await stockAt(tx, businessId, tClose, lines.flatMap((l) => (l.inventoryItemId ? [l.inventoryItemId] : [])));
      for (const line of lines) {
        const item = line.inventoryItem;
        if (!item) continue;
        const appliedDiff = applied.get(line.id) ?? 0;
        const sheet = closedSheetQty((after.get(item.id) ?? 0) - appliedDiff, appliedDiff);
        const data: Prisma.StockCountLineUncheckedUpdateInput = {};
        // Zamrożenie nazw i cen na dzień zamknięcia (towar mógł zmienić nazwę albo cenę od startu).
        if (line.name !== item.name) data.name = item.name;
        if (line.unit !== item.unit) data.unit = item.unit;
        if (line.category !== item.category) data.category = item.category;
        if (!sameDecimal(line.purchasePrice, item.purchasePrice)) data.purchasePrice = item.purchasePrice;
        if (!sameDecimal(line.salePrice, item.price)) data.salePrice = item.price;
        if (line.appliedDiff !== appliedDiff) data.appliedDiff = appliedDiff;
        if (line.countedQty !== sheet.countedQty) data.countedQty = sheet.countedQty;
        if (line.systemQtyAtCount !== sheet.systemQtyAtCount) data.systemQtyAtCount = sheet.systemQtyAtCount;
        if (Object.keys(data).length > 0) await tx.stockCountLine.update({ where: { id: line.id }, data });
      }
      return publicCount(await tx.stockCount.update({ where: { id: countId }, data: { status: 'closed', closedAt: now, asOf: tClose } }));
    },
    { timeout: 60_000 },
  );
}

/** Czy salon ma otwartą inwentaryzację (w transakcji pod blokadą — dla zmian ilości towaru). */
export async function hasOpenStockCount(tx: Tx, businessId: string): Promise<boolean> {
  return !!(await tx.stockCount.findFirst({ where: { businessId, status: 'open' }, select: { id: true } }));
}

export async function deleteStockCount(businessId: string, countId: string) {
  await db.$transaction(async (tx) => {
    await lock(tx, businessId);
    const count = await ownedCount(tx, businessId, countId);
    if (count.status !== 'open') throw new StockCountError(MSG.deleteClosed, 409);
    await tx.stockCount.delete({ where: { id: count.id } });
  }, STOCK_TX_TIMEOUT);
}

// --- Odczyt ---

export interface LineView {
  id: string;
  inventoryItemId: string | null;
  name: string;
  unit: string;
  category: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  /** „Stan w programie”: dla otwartego spisu bieżący stan towaru, dla zamkniętego stan z chwili liczenia. */
  systemQty: number | null;
  countedQty: number | null;
  systemQtyAtCount: number | null;
  countedAt: Date | null;
  appliedDiff: number | null;
  /** Różnica: policzone − stan w chwili startu (null = brak danych). */
  diff: number | null;
}

export interface CountView {
  id: string;
  countDate: Date;
  status: 'open' | 'closed';
  notes: string | null;
  createdAt: Date;
  closedAt: Date | null;
  /** Chwila, na którą pokazane są stany: zamknięty spis = zapisane asOf, otwarty = min(teraz, koniec dnia spisu). */
  asOf: Date | null;
  lines: LineView[];
}

type LineRow = Prisma.StockCountLineGetPayload<{ include: { inventoryItem: true } }>;

function toLineView(line: LineRow, open: boolean): LineView {
  const item = open ? line.inventoryItem : null; // otwarty spis: dane na żywo
  return {
    id: line.id,
    inventoryItemId: line.inventoryItemId,
    name: item?.name ?? line.name,
    unit: item?.unit ?? line.unit,
    category: item ? item.category : line.category,
    purchasePrice: item ? toNum(item.purchasePrice) : toNum(line.purchasePrice),
    salePrice: item ? toNum(item.price) : toNum(line.salePrice),
    // „Powinno być” = stan z chwili liczenia tej pozycji, żeby ekran zgadzał się z różnicą.
    // Nieruszone pozycje są synchronizowane z programem (syncLines), więc to stan z dziennika na chwilę T.
    systemQty: line.systemQtyAtCount !== null ? shelf(line.systemQtyAtCount) : item ? shelf(item.quantity) : null,
    countedQty: line.countedQty,
    systemQtyAtCount: line.systemQtyAtCount,
    countedAt: line.countedAt,
    appliedDiff: line.appliedDiff,
    diff: countDiff(line),
  };
}

/** Spis z pozycjami. withSync: dla otwartego spisu najpierw dosypuje brakujące pozycje i synchronizuje je z dziennikiem. */
export async function loadStockCount(businessId: string, id: string, withSync = false): Promise<CountView> {
  if (withSync) {
    await db.$transaction(async (tx) => {
      await lock(tx, businessId);
      const count = await ownedCount(tx, businessId, id);
      if (count.status === 'open') {
        await refreshCount(tx, businessId, count, new Date(), true);
      }
    }, STOCK_TX_TIMEOUT);
  }
  const count = await db.stockCount.findFirst({
    where: { id, businessId },
    include: {
      lines: { include: { inventoryItem: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!count) throw new StockCountError(MSG.notFound, 404);
  const open = count.status === 'open';
  return {
    id: count.id,
    countDate: count.countDate,
    status: open ? 'open' : 'closed',
    notes: count.notes,
    createdAt: count.createdAt,
    closedAt: count.closedAt,
    asOf: open ? momentOf(count) : count.asOf,
    lines: count.lines.map((l) => toLineView(l, open)),
  };
}

/** Pozycje do wydruku i CSV: wg wyświetlanej nazwy, polska kolejność liter. */
export function sortByName<T extends { name: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

export const priceOf = (l: LineView, basis: PriceBasis): number | null => (basis === 'sale' ? l.salePrice : l.purchasePrice);

export function summaryOf(lines: LineView[], basis: PriceBasis): CountSummary {
  return summarize(lines.map((l) => ({ countedQty: l.countedQty, systemQtyAtCount: l.systemQtyAtCount, price: priceOf(l, basis) })));
}

/** Lista spisów salonu z podsumowaniem (pozycje z różnicą, wartość wg cen zakupu). */
export async function listStockCounts(businessId: string) {
  const counts = await db.stockCount.findMany({
    where: { businessId },
    orderBy: [{ countDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      lines: {
        select: { countedQty: true, systemQtyAtCount: true, purchasePrice: true, inventoryItem: { select: { purchasePrice: true } } },
      },
    },
  });
  return counts.map((c) => {
    const open = c.status === 'open';
    const s = summarize(
      c.lines.map((l) => ({
        countedQty: l.countedQty,
        systemQtyAtCount: l.systemQtyAtCount,
        price: toNum(open && l.inventoryItem ? l.inventoryItem.purchasePrice : l.purchasePrice),
      })),
    );
    return {
      id: c.id,
      countDate: c.countDate,
      status: c.status,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      totalLines: s.totalLines,
      linesWithDiff: s.linesWithDiff,
      totalValueCents: s.valueCents,
    };
  });
}
