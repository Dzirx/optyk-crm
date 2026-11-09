import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { customerBelongsTo, inventoryBelongsTo, inventoryIdsFromItems } from '@/lib/api/ownership';
import { createWorkOrderSchema } from '@/lib/api/schemas/work-orders';
import { NOT_FOUND_INVENTORY, assertDepositFits, resolveTotal } from '@/lib/work-orders/amounts';
import { addLinks, applyAdjustments, orderedInventoryIds } from '@/lib/work-orders/inventory';
import { assertOrderNumberFree, lockOrderNumbering, nextOrderNumber } from '@/lib/work-orders/order-number';

// GET /api/work-orders - zlecenia salonu
export const GET = withBusiness(
  async ({ business }) => {
    const orders = await db.workOrder.findMany({
      where: { businessId: business.id },
      include: {
        customer: true,
        items: { orderBy: { id: 'asc' } },
      },
      orderBy: { receivedAt: 'desc' },
    });

    const workOrders = orders.map((order) => ({
      ...order,
      customerName: `${order.customer.name} ${order.customer.surname}`,
      customerPhone: order.customer.phone,
    }));

    return NextResponse.json({ workOrders });
  },
  { error: 'Nie udało się pobrać zleceń' },
);

// POST /api/work-orders - nowe zlecenie
export const POST = withBusiness(
  async ({ business, body }) => {
    const { customerId, items } = body;

    if (!(await customerBelongsTo(business.id, customerId))) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }
    if (!(await inventoryBelongsTo(business.id, inventoryIdsFromItems(items)))) {
      return NextResponse.json({ error: NOT_FOUND_INVENTORY }, { status: 404 });
    }

    // Walidacja formatu zrobił już schemat; tu sprawdzamy tylko zależności między polami.
    const itemRows = (items ?? []).map(({ id: _id, ...row }) => row);
    const total = resolveTotal(body.totalAmount, itemRows);
    assertDepositFits(total, body.deposit);
    const data = {
      receivedAt: body.receivedAt,
      pickupDate: body.pickupDate,
      status: body.status ?? 'pending',
      notes: body.notes,
    };

    const adjustments: Record<string, number> = {};
    for (const row of itemRows) addLinks(adjustments, row, -1);

    const workOrder = await db.$transaction(async (tx) => {
      await lockOrderNumbering(tx, business.id);
      let orderNumber = body.orderNumber;
      if (orderNumber) await assertOrderNumberFree(tx, business.id, orderNumber);
      else orderNumber = await nextOrderNumber(tx, business.id);

      const created = await tx.workOrder.create({
        data: {
          businessId: business.id,
          customerId,
          orderNumber,
          ...data,
          totalAmount: total,
          deposit: body.deposit,
          items: { create: itemRows },
        },
        include: { items: true, customer: true },
      });

      await applyAdjustments(tx, adjustments, orderedInventoryIds(itemRows));
      return created;
    });

    return NextResponse.json({ workOrder }, { status: 201 });
  },
  { body: createWorkOrderSchema, error: 'Nie udało się utworzyć zlecenia' },
);
