import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { itemsTotal, hasPrices, type PricedItem } from '@/lib/work-orders/totals';
import { customerBelongsTo, inventoryBelongsTo, inventoryIdsFromItems } from '@/lib/api/ownership';
import { MONEY, ValidationError, optionalDate, optionalNumber } from '@/lib/api/validation';
import { knownErrorResponse } from '@/lib/api/errors';
import { addLinks, applyAdjustments, orderedInventoryIds, returnOrdersToStock } from '@/lib/work-orders/inventory';
import { assertOrderNumberFree, lockOrderNumbering, nextOrderNumber } from '@/lib/work-orders/order-number';

const NOT_FOUND_INVENTORY = 'Nie znaleziono pozycji magazynu';
const STATUSES = ['pending', 'ready', 'completed'];

// Kwota wpisana ręcznie ma pierwszeństwo. Gdy jej brak, liczymy sumę cen pozycji
// (pozycje już po mapItemData, więc „199,50” jest liczbą 199.5).
function resolveTotal(totalAmount: unknown, items: PricedItem[] | undefined): number | null {
  const manual = optionalNumber(totalAmount, { label: 'Kwota', ...MONEY });
  if (manual !== null) return manual;
  return hasPrices(items) ? itemsTotal(items) : null;
}

function parseStatus(status: unknown): string | undefined {
  if (status === undefined || status === null || status === '') return undefined;
  if (typeof status !== 'string' || !STATUSES.includes(status)) throw new ValidationError('Nieprawidłowy status zlecenia');
  return status;
}

function assertDepositFits(total: unknown, deposit: unknown) {
  if (total == null || deposit == null) return;
  if (Number(deposit) > Number(total)) throw new ValidationError('Zaliczka nie może być większa niż kwota zlecenia');
}

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, max);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItemData(item: any) {
  const sph = { min: -50, max: 50 };
  const cyl = { min: -20, max: 20 };
  const add = { min: 0, max: 10 };
  const pd = { min: 0, max: 999.9 };
  const axis = { min: 0, max: 180, integer: true };
  return {
    type: text(item.type, 50) ?? 'do_dali',
    opSph: optionalNumber(item.opSph, { label: 'SPH (OP)', ...sph }),
    opCyl: optionalNumber(item.opCyl, { label: 'CYL (OP)', ...cyl }),
    opAxis: optionalNumber(item.opAxis, { label: 'OŚ (OP)', ...axis }),
    opAdd: optionalNumber(item.opAdd, { label: 'ADD (OP)', ...add }),
    opPd: optionalNumber(item.opPd, { label: 'PD (OP)', ...pd }),
    olSph: optionalNumber(item.olSph, { label: 'SPH (OL)', ...sph }),
    olCyl: optionalNumber(item.olCyl, { label: 'CYL (OL)', ...cyl }),
    olAxis: optionalNumber(item.olAxis, { label: 'OŚ (OL)', ...axis }),
    olAdd: optionalNumber(item.olAdd, { label: 'ADD (OL)', ...add }),
    olPd: optionalNumber(item.olPd, { label: 'PD (OL)', ...pd }),
    frameModel: text(item.frameModel, 255),
    ownFrame: item.ownFrame === true,
    lensType: text(item.lensType, 100),
    framePrice: optionalNumber(item.framePrice, { label: 'Cena oprawki', ...MONEY }),
    lensPrice: optionalNumber(item.lensPrice, { label: 'Cena szkieł', ...MONEY }),
    inventoryItemIdOp: item.inventoryItemIdOp || null,
    inventoryItemIdOl: item.inventoryItemIdOl || null,
    inventoryItemIdFrame: item.inventoryItemIdFrame || null,
    opOrdered: item.opOrdered === true,
    olOrdered: item.olOrdered === true,
    frameOrdered: item.frameOrdered === true,
  };
}

// GET - List all work orders for business
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const userBusiness = await getUserBusiness(session.user.id);
    if (!userBusiness) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    const workOrders = await db.workOrder.findMany({
      where: { businessId: userBusiness.id },
      include: {
        customer: true,
        items: { orderBy: { id: 'asc' } },
      },
      orderBy: { receivedAt: 'desc' },
    });

    const result = workOrders.map(order => ({
      ...order,
      customerName: `${order.customer.name} ${order.customer.surname}`,
      customerPhone: order.customer.phone,
    }));

    return NextResponse.json({ workOrders: result });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    return NextResponse.json({ error: 'Nie udało się pobrać zleceń' }, { status: 500 });
  }
}

// POST - Create new work order
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const userBusiness = await getUserBusiness(session.user.id);
    if (!userBusiness) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    const body = await req.json();
    const { customerId, orderNumber: customOrderNumber, receivedAt, pickupDate, status, totalAmount, deposit, notes, items } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'Wymagane ID klienta' }, { status: 400 });
    }
    if (!receivedAt) {
      return NextResponse.json({ error: 'Data przyjęcia jest wymagana' }, { status: 400 });
    }

    if (!(await customerBelongsTo(userBusiness.id, customerId))) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }
    if (items !== undefined && !Array.isArray(items)) {
      return NextResponse.json({ error: 'Nieprawidłowe pozycje zlecenia' }, { status: 400 });
    }
    if (!(await inventoryBelongsTo(userBusiness.id, inventoryIdsFromItems(items)))) {
      return NextResponse.json({ error: NOT_FOUND_INVENTORY }, { status: 404 });
    }

    // Walidacja przed transakcją: zły format → 400.
    const itemRows = (items || []).map(mapItemData);
    const total = resolveTotal(totalAmount, itemRows);
    const depositValue = optionalNumber(deposit, { label: 'Zaliczka', ...MONEY });
    assertDepositFits(total, depositValue);
    const data = {
      receivedAt: optionalDate(receivedAt, 'data przyjęcia')!,
      pickupDate: optionalDate(pickupDate, 'data odbioru'),
      status: parseStatus(status) ?? 'pending',
      notes: text(notes, 10_000),
    };
    const custom = typeof customOrderNumber === 'string' ? customOrderNumber.trim().slice(0, 50) : '';

    const adjustments: Record<string, number> = {};
    for (const row of itemRows) addLinks(adjustments, row, -1);

    const workOrder = await db.$transaction(async (tx) => {
      await lockOrderNumbering(tx, userBusiness.id);
      let orderNumber = custom;
      if (orderNumber) await assertOrderNumberFree(tx, userBusiness.id, orderNumber);
      else orderNumber = await nextOrderNumber(tx, userBusiness.id);

      const created = await tx.workOrder.create({
        data: {
          businessId: userBusiness.id,
          customerId,
          orderNumber,
          ...data,
          totalAmount: total,
          deposit: depositValue,
          items: { create: itemRows },
        },
        include: { items: true, customer: true },
      });

      await applyAdjustments(tx, adjustments, orderedInventoryIds(itemRows));
      return created;
    });

    return NextResponse.json({ workOrder }, { status: 201 });
  } catch (error) {
    const known = knownErrorResponse(error);
    if (known) return known;
    console.error('Error creating work order:', error);
    return NextResponse.json({ error: 'Nie udało się utworzyć zlecenia' }, { status: 500 });
  }
}

// PATCH - Update work order
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const userBusiness = await getUserBusiness(session.user.id);
    if (!userBusiness) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    const body = await req.json();
    const { id, customerId, orderNumber, receivedAt, pickupDate, status, totalAmount, deposit, notes, items } = body;

    if (!id) {
      return NextResponse.json({ error: 'Wymagane ID zlecenia' }, { status: 400 });
    }

    const existing = await db.workOrder.findFirst({
      where: { id, businessId: userBusiness.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono zlecenia' }, { status: 404 });
    }

    // Każdy id z body musi należeć do tego salonu (klient, towary) lub do tego zlecenia (pozycje).
    if (customerId !== undefined && customerId !== existing.customerId) {
      if (!(await customerBelongsTo(userBusiness.id, customerId))) {
        return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
      }
    }
    if (items !== undefined) {
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: 'Nieprawidłowe pozycje zlecenia' }, { status: 400 });
      }
      const ownItemIds = new Set(
        (await db.workOrderItem.findMany({ where: { workOrderId: id }, select: { id: true } })).map((i) => i.id),
      );
      const foreignItem = items.some(
        (i: { id?: unknown }) =>
          i.id != null && !(typeof i.id === 'string' && (i.id.startsWith('new-') || ownItemIds.has(i.id))),
      );
      if (foreignItem) {
        return NextResponse.json({ error: 'Nie znaleziono pozycji zlecenia' }, { status: 404 });
      }
      if (!(await inventoryBelongsTo(userBusiness.id, inventoryIdsFromItems(items)))) {
        return NextResponse.json({ error: NOT_FOUND_INVENTORY }, { status: 404 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incoming = (items ?? []) as any[];
    const isDbId = (itemId: unknown) => typeof itemId === 'string' && !itemId.startsWith('new-');
    const toUpdate = incoming.filter((i) => isDbId(i.id)).map((i) => ({ id: i.id as string, data: mapItemData(i) }));
    const toCreate = incoming.filter((i) => !isDbId(i.id)).map(mapItemData);
    const itemRows = items !== undefined ? [...toUpdate.map((u) => u.data), ...toCreate] : undefined;

    // Pola, których nie ma w żądaniu, zostają bez zmian (np. zmiana statusu z listy
    // nie może kasować daty odbioru).
    const total = totalAmount !== undefined ? resolveTotal(totalAmount, itemRows) : existing.totalAmount;
    const depositValue = deposit !== undefined ? optionalNumber(deposit, { label: 'Zaliczka', ...MONEY }) : existing.deposit;
    assertDepositFits(total, depositValue);
    const fields = {
      customerId: customerId ?? existing.customerId,
      receivedAt: receivedAt ? optionalDate(receivedAt, 'data przyjęcia')! : existing.receivedAt,
      pickupDate: pickupDate !== undefined ? optionalDate(pickupDate, 'data odbioru') : existing.pickupDate,
      status: parseStatus(status) ?? existing.status,
      totalAmount: total,
      deposit: depositValue,
      notes: notes !== undefined ? text(notes, 10_000) : existing.notes,
    };
    const newNumber = typeof orderNumber === 'string' ? orderNumber.trim().slice(0, 50) : '';

    const workOrder = await db.$transaction(async (tx) => {
      if (newNumber && newNumber !== existing.orderNumber) {
        await lockOrderNumbering(tx, userBusiness.id);
        await assertOrderNumberFree(tx, userBusiness.id, newNumber, id);
      }

      if (items !== undefined) {
        const existingItems = await tx.workOrderItem.findMany({
          where: { workOrderId: id },
          select: { id: true, inventoryItemIdOp: true, inventoryItemIdOl: true, inventoryItemIdFrame: true },
        });
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

        await applyAdjustments(tx, adjustments, orderedInventoryIds(itemRows ?? []));
      }

      return tx.workOrder.update({
        where: { id },
        data: { ...fields, orderNumber: newNumber || existing.orderNumber },
        include: { items: { orderBy: { id: 'asc' } }, customer: true },
      });
    });

    return NextResponse.json({ workOrder });
  } catch (error) {
    const known = knownErrorResponse(error);
    if (known) return known;
    console.error('Error updating work order:', error);
    return NextResponse.json({ error: 'Nie udało się zaktualizować zlecenia' }, { status: 500 });
  }
}

// DELETE - Delete work order
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const userBusiness = await getUserBusiness(session.user.id);
    if (!userBusiness) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Wymagane ID zlecenia' }, { status: 400 });
    }

    const existing = await db.workOrder.findFirst({
      where: { id, businessId: userBusiness.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono zlecenia' }, { status: 404 });
    }

    // Odczyt pozycji i zwrot towaru w tej samej transakcji co usunięcie.
    await db.$transaction(async (tx) => {
      await returnOrdersToStock(tx, { workOrderId: id });
      await tx.workOrder.delete({ where: { id } });
    });

    return NextResponse.json({ message: 'Work order deleted successfully' });
  } catch (error) {
    console.error('Error deleting work order:', error);
    return NextResponse.json({ error: 'Nie udało się usunąć zlecenia' }, { status: 500 });
  }
}
