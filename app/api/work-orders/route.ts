import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { workOrderSearchWhere } from '@/lib/api/search';
import { customerBelongsTo, inventoryBelongsTo, inventoryIdsFromItems } from '@/lib/api/ownership';
import { createWorkOrderSchema, listWorkOrdersQuerySchema } from '@/lib/api/schemas/work-orders';
import { NOT_FOUND_INVENTORY, assertDepositFits, resolveTotal } from '@/lib/work-orders/amounts';
import { addLinks, applyAdjustments, orderedInventoryIds } from '@/lib/work-orders/inventory';
import { assertOrderNumberFree, lockOrderNumbering, nextOrderNumber } from '@/lib/work-orders/order-number';

// GET /api/work-orders - zlecenia salonu.
// Parametry (opcjonalne): q (numer zlecenia, imię i nazwisko klienta, telefon), status, page + pageSize
// (domyślnie 50, max 200). Bez `page`: cała lista w starym kształcie `{ workOrders }`.
// Z `page`: `{ workOrders, total, page, pageSize }`.
export const GET = withBusiness(
  async ({ req, business }) => {
    const parsed = listWorkOrdersQuerySchema.safeParse(
      queryObject(req.nextUrl.searchParams, ['page', 'pageSize', 'q', 'status']),
    );
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { page, pageSize, q, status } = parsed.data;

    // businessId zawsze w warunku: żaden filtr ani strona nie wychodzi poza salon.
    const where: Prisma.WorkOrderWhereInput = {
      businessId: business.id,
      ...(status ? { status } : {}),
      AND: workOrderSearchWhere(q),
    };
    const query = {
      where,
      include: {
        customer: true,
        items: { orderBy: { id: 'asc' as const } },
      },
      // `id` rozstrzyga remisy, żeby strony nie nakładały się na siebie.
      orderBy: [{ receivedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }],
    };
    const shape = (orders: Awaited<ReturnType<typeof db.workOrder.findMany<typeof query>>>) =>
      orders.map((order) => ({
        ...order,
        customerName: `${order.customer.name} ${order.customer.surname}`,
        customerPhone: order.customer.phone,
      }));

    if (page === undefined) {
      return NextResponse.json({ workOrders: shape(await db.workOrder.findMany(query)) });
    }

    const [total, orders] = await db.$transaction([
      db.workOrder.count({ where }),
      db.workOrder.findMany({ ...query, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return NextResponse.json({ workOrders: shape(orders), total, page, pageSize });
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
