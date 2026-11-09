import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { customerBelongsTo } from '@/lib/api/ownership';
import { createVisitSchema, listVisitsQuerySchema } from '@/lib/api/schemas/visits';

// GET /api/visits - wizyty salonu razem z danymi klienta
// Parametry (opcjonalne): from (włącznie), to (wyłącznie), customerId. Bez nich: wszystkie wizyty.
export const GET = withBusiness(
  async ({ req, business }) => {
    const sp = req.nextUrl.searchParams;
    const parsed = listVisitsQuerySchema.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      customerId: sp.get('customerId') ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { from, to, customerId } = parsed.data;

    // Zawsze w obrębie salonu: cudze customerId daje pustą listę.
    const found = await db.visit.findMany({
      where: {
        customer: { businessId: business.id },
        ...(customerId ? { customerId } : {}),
        ...(from || to ? { visitDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      },
      include: { customer: true },
      orderBy: { visitDate: 'desc' },
    });

    const visits = found.map(({ customer, ...visit }) => ({
      ...visit,
      customerName: `${customer.name} ${customer.surname}`,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      smsConsent: customer.smsConsent,
    }));

    return NextResponse.json({ visits });
  },
  { error: 'Nie udało się pobrać wizyt' },
);

// POST /api/visits - nowa wizyta
export const POST = withBusiness(
  async ({ business, body }) => {
    // Klient musi należeć do tego salonu.
    if (!(await customerBelongsTo(business.id, body.customerId))) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }

    const visit = await db.visit.create({
      data: {
        customerId: body.customerId,
        visitDate: body.visitDate,
        visitType: body.visitType || null,
        notes: body.notes || null,
        reminderSmsDate: body.reminderSmsDate,
        reviewSmsDate: body.reviewSmsDate,
      },
    });

    return NextResponse.json({ visit }, { status: 201 });
  },
  { body: createVisitSchema, error: 'Nie udało się utworzyć wizyty' },
);
