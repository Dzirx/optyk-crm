import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { customerBelongsTo } from '@/lib/api/ownership';
import { createVisitSchema } from '@/lib/api/schemas/visits';

// GET /api/visits - wizyty salonu razem z danymi klienta
export const GET = withBusiness(
  async ({ business }) => {
    const customers = await db.customer.findMany({
      where: { businessId: business.id },
      include: {
        visits: {
          orderBy: { visitDate: 'desc' },
          include: { review: true },
        },
      },
    });

    const visits = customers.flatMap((customer) =>
      customer.visits.map((visit) => ({
        ...visit,
        customerName: `${customer.name} ${customer.surname}`,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        smsConsent: customer.smsConsent,
      })),
    );
    visits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());

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
