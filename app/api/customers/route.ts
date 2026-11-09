import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { createCustomerSchema } from '@/lib/api/schemas/customers';

// GET /api/customers - lista klientów salonu
export const GET = withBusiness(
  async ({ business }) => {
    const customers = await db.customer.findMany({
      where: { businessId: business.id },
      include: { visits: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ customers });
  },
  { error: 'Nie udało się pobrać klientów' },
);

// POST /api/customers - nowy klient
export const POST = withBusiness(
  async ({ business, body }) => {
    const customer = await db.customer.create({
      data: {
        businessId: business.id,
        name: body.name,
        surname: body.surname,
        phone: body.phone,
        email: body.email || null,
        smsConsent: body.smsConsent ?? true,
      },
    });
    return NextResponse.json({ customer }, { status: 201 });
  },
  { body: createCustomerSchema, error: 'Nie udało się utworzyć klienta' },
);
