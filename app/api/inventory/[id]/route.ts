import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { INVENTORY_QTY, updateInventorySchema } from '@/lib/api/schemas/inventory';
import { requiredNumber } from '@/lib/api/validation';
import { changeStock } from '@/lib/stock/movements';
import { STOCK_TX_TIMEOUT, lockStock } from '@/lib/stock-count/lock';
import { MSG, StockCountError, hasOpenStockCount } from '@/lib/stock-count/service';

const NOT_FOUND = 'Nie znaleziono pozycji';

// GET /api/inventory/[id]
export const GET = withBusiness(
  async ({ business, params }) => {
    const item = await db.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id, deletedAt: null } });
    if (!item) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ item });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać pozycji' },
);

// PATCH /api/inventory/[id]
export const PATCH = withBusiness(
  async ({ business, params, body }) => {
    const { name, quantity, unit, category, sph, cyl, diameter, price, purchasePrice, notes, note } = body;

    const otherData = {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(category !== undefined && { category }),
      ...(sph !== undefined && { sph }),
      ...(cyl !== undefined && { cyl }),
      ...(diameter !== undefined && { diameter }),
      ...(price !== undefined && { price }),
      ...(purchasePrice !== undefined && { purchasePrice }),
      ...(notes !== undefined && { notes }),
    };

    // Gdy body zawiera ilość: cała zmiana pod blokadą magazynu, a ilość czytana pod blokadą.
    // Ilość równą stanowi z bazy pomijamy, więc nie nadpisze zmiany z równoległego zamknięcia spisu ani zlecenia.
    const item = await db.$transaction(async (tx) => {
      if (quantity !== undefined) await lockStock(tx, business.id);
      const existing = await tx.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id, deletedAt: null } });
      if (!existing) return null;

      let changesQty = false;
      if (quantity !== undefined) {
        // Ujemny stan (towar zamówiony do zleceń) można zostawić albo podnieść, ale nie obniżyć poniżej zera.
        requiredNumber(quantity, { ...INVENTORY_QTY, min: Math.min(0, existing.quantity) });
        changesQty = quantity !== existing.quantity;
        // Ręczna zmiana ilości w trakcie inwentaryzacji rozjechałaby liczenie: ilości zmienia się w spisie.
        if (changesQty && (await hasOpenStockCount(tx, business.id))) throw new StockCountError(MSG.qtyLockedByCount, 409);
      }
      const updated = await tx.inventoryItem.update({ where: { id: existing.id }, data: otherData });
      if (!changesQty || quantity === undefined) return updated;
      // Ręczna zmiana ilości = ruch CORRECTION (różnica liczona pod blokadą, więc nie gubi równoległych zmian).
      const newQty = await changeStock(tx, {
        businessId: business.id,
        itemId: existing.id,
        delta: quantity - existing.quantity,
        type: 'CORRECTION',
        userId: business.userId,
        note: note ?? null,
        allowNegative: true,
      });
      return { ...updated, quantity: newQty ?? updated.quantity };
    }, STOCK_TX_TIMEOUT);
    if (!item) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ item });
  },
  { body: updateInventorySchema, notFound: NOT_FOUND, error: 'Nie udało się zaktualizować pozycji' },
);

// DELETE /api/inventory/[id] — usunięcie miękkie: towar znika z list, historia ruchów zostaje.
export const DELETE = withBusiness(
  async ({ business, params }) => {
    // Pod blokadą magazynu, żeby nie ścigać się z zamykaniem inwentaryzacji (jej pozycja znika przy synchronizacji).
    // Istnienie sprawdzamy pod blokadą: równoległe usunięcie daje 404, nie 500.
    const deleted = await db.$transaction(async (tx) => {
      await lockStock(tx, business.id);
      const existing = await tx.inventoryItem.findFirst({ where: { id: params.id, businessId: business.id, deletedAt: null } });
      if (!existing) return false;
      // Reszta stanu schodzi ruchem REMOVAL, więc suma ruchów towaru kończy się na 0.
      await changeStock(tx, {
        businessId: business.id,
        itemId: existing.id,
        delta: -existing.quantity,
        type: 'REMOVAL',
        userId: business.userId,
        note: 'Usunięcie towaru',
        allowNegative: true,
      });
      await tx.inventoryItem.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      return true;
    }, STOCK_TX_TIMEOUT);
    if (!deleted) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ message: 'Pozycja usunięta' });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się usunąć pozycji' },
);
