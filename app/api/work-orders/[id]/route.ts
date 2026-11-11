import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { assertInventoryLinkable, customerBelongsTo, inventoryBelongsTo, inventoryIdsFromItems } from '@/lib/api/ownership';
import { updateWorkOrderSchema } from '@/lib/api/schemas/work-orders';
import { NOT_FOUND_INVENTORY, assertDepositFits, resolveTotal } from '@/lib/work-orders/amounts';
import { STOCK_TX_TIMEOUT, lockStock } from '@/lib/stock-count/lock';
import { addLinks, applyAdjustments, orderedInventoryIds, returnOrdersToStock } from '@/lib/work-orders/inventory';
import { assertOrderNumberFree, lockOrderNumbering } from '@/lib/work-orders/order-number';

const NOT_FOUND = 'Nie znaleziono zlecenia';

// GET /api/work-orders/[id] - ten sam kształt co pozycja z GET /api/work-orders
export const GET = withBusiness(
  async ({ business, params }) => {
    const order = await db.workOrder.findFirst({
      where: { id: params.id, businessId: business.id },
      include: { customer: true, items: { orderBy: { id: 'asc' } } },
    });
    if (!order) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    return NextResponse.json({
      workOrder: {
        ...order,
        customerName: `${order.customer.name} ${order.customer.surname}`,
        customerPhone: order.customer.phone,
      },
    });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać zlecenia' },
);

// PATCH /api/work-orders/[id]
export const PATCH = withBusiness(
  async ({ business, params, body }) => {
    const id = params.id;
    const { customerId, items } = body;

    const existing = await db.workOrder.findFirst({ where: { id, businessId: business.id } });
    if (!existing) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    // Każdy id z body musi należeć do tego salonu (klient, towary) lub do tego zlecenia (pozycje).
    if (customerId !== undefined && customerId !== existing.customerId) {
      if (!(await customerBelongsTo(business.id, customerId))) {
        return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
      }
    }
    if (items !== undefined) {
      const ownItemIds = new Set(
        (await db.workOrderItem.findMany({ where: { workOrderId: id }, select: { id: true } })).map((i) => i.id),
      );
      const foreignItem = items.some(
        (i) => i.id != null && !(typeof i.id === 'string' && (i.id.startsWith('new-') || ownItemIds.has(i.id))),
      );
      if (foreignItem) {
        return NextResponse.json({ error: 'Nie znaleziono pozycji zlecenia' }, { status: 404 });
      }
      // Powiązania, które zlecenie już ma, zostają dozwolone także dla towaru usuniętego z magazynu.
      const linked = await db.workOrderItem.findMany({
        where: { workOrderId: id },
        select: { inventoryItemIdOp: true, inventoryItemIdOl: true, inventoryItemIdFrame: true },
      });
      const keepIds = linked.flatMap((l) => [l.inventoryItemIdOp, l.inventoryItemIdOl, l.inventoryItemIdFrame]).filter((x): x is string => !!x);
      if (!(await inventoryBelongsTo(business.id, inventoryIdsFromItems(items), keepIds))) {
        return NextResponse.json({ error: NOT_FOUND_INVENTORY }, { status: 404 });
      }
    }

    const incoming = items ?? [];
    const isDbId = (itemId: unknown) => typeof itemId === 'string' && !itemId.startsWith('new-');
    const toUpdate = incoming
      .filter((i) => isDbId(i.id))
      .map(({ id: itemId, ...data }) => ({ id: itemId as string, data }));
    const toCreate = incoming.filter((i) => !isDbId(i.id)).map(({ id: _id, ...data }) => data);
    const itemRows = items !== undefined ? [...toUpdate.map((u) => u.data), ...toCreate] : undefined;

    // Pola, których nie ma w żądaniu, zostają bez zmian (np. zmiana statusu z listy
    // nie może kasować daty odbioru).
    const total = body.totalAmount !== undefined ? resolveTotal(body.totalAmount, itemRows) : existing.totalAmount;
    const depositValue = body.deposit !== undefined ? body.deposit : existing.deposit;
    assertDepositFits(total, depositValue);
    const fields = {
      customerId: customerId ?? existing.customerId,
      receivedAt: body.receivedAt ?? existing.receivedAt,
      pickupDate: body.pickupDate !== undefined ? body.pickupDate : existing.pickupDate,
      status: body.status ?? existing.status,
      totalAmount: total,
      deposit: depositValue,
      notes: body.notes !== undefined ? body.notes : existing.notes,
    };
    const newNumber = body.orderNumber;

    const workOrder = await db.$transaction(async (tx) => {
      if (items !== undefined) await lockStock(tx, business.id); // przed numeracją i wierszami towarów
      if (newNumber && newNumber !== existing.orderNumber) {
        await lockOrderNumbering(tx, business.id);
        await assertOrderNumberFree(tx, business.id, newNumber, id);
      }

      if (items !== undefined) {
        const existingItems = await tx.workOrderItem.findMany({
          where: { workOrderId: id },
          select: { id: true, inventoryItemIdOp: true, inventoryItemIdOl: true, inventoryItemIdFrame: true },
        });
        // Nowo powiązane towary muszą dalej istnieć (powiązania, które zlecenie już ma, mogą wskazywać usunięty towar).
        const kept = existingItems.flatMap((e) => [e.inventoryItemIdOp, e.inventoryItemIdOl, e.inventoryItemIdFrame]).filter((x): x is string => !!x);
        await assertInventoryLinkable(tx, business.id, inventoryIdsFromItems(items), kept);
        const incomingIds = new Set(toUpdate.map((i) => i.id));
        const toDelete = existingItems.filter((ei) => !incomingIds.has(ei.id));

        // Bilans magazynu: stare powiązania wracają na stan, nowe są pobierane.
        const adjustments: Record<string, number> = {};
        for (const item of toDelete) addLinks(adjustments, item, +1);
        for (const row of toCreate) addLinks(adjustments, row, -1);
        for (const { id: itemId, data } of toUpdate) {
          const old = existingItems.find((ei) => ei.id === itemId);
          if (!old) continue;
          addLinks(adjustments, old, +1);
          addLinks(adjustments, data, -1);
        }

        if (toDelete.length > 0) {
          await tx.workOrderItem.deleteMany({ where: { id: { in: toDelete.map((i) => i.id) }, workOrderId: id } });
        }
        for (const { id: itemId, data } of toUpdate) {
          // workOrderId w warunku: druga linia obrony — pozycja musi należeć do tego zlecenia.
          await tx.workOrderItem.update({ where: { id: itemId, workOrderId: id }, data });
        }
        for (const row of toCreate) {
          await tx.workOrderItem.create({ data: { workOrderId: id, ...row } });
        }

        await applyAdjustments(
          tx,
          { businessId: business.id, workOrderId: id, orderNumber: newNumber || existing.orderNumber, userId: business.userId },
          adjustments,
          orderedInventoryIds(itemRows ?? []),
        );
      }

      return tx.workOrder.update({
        where: { id },
        data: { ...fields, orderNumber: newNumber || existing.orderNumber },
        include: { items: { orderBy: { id: 'asc' } }, customer: true },
      });
    }, STOCK_TX_TIMEOUT);

    return NextResponse.json({ workOrder });
  },
  { body: updateWorkOrderSchema, notFound: NOT_FOUND, error: 'Nie udało się zaktualizować zlecenia' },
);

// DELETE /api/work-orders/[id]
export const DELETE = withBusiness(
  async ({ business, params }) => {
    const id = params.id;
    const existing = await db.workOrder.findFirst({ where: { id, businessId: business.id } });
    if (!existing) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    // Odczyt pozycji i zwrot towaru w tej samej transakcji co usunięcie.
    await db.$transaction(async (tx) => {
      await lockStock(tx, business.id);
      await returnOrdersToStock(tx, business.id, { workOrderId: id }, business.userId);
      await tx.workOrder.delete({ where: { id } });
    }, STOCK_TX_TIMEOUT);

    return NextResponse.json({ message: 'Work order deleted successfully' });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się usunąć zlecenia' },
);
