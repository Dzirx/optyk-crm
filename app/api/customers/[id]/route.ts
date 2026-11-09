import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { updateCustomerSchema } from '@/lib/api/schemas/customers';
import { returnOrdersToStock } from '@/lib/work-orders/inventory';

const NOT_FOUND = 'Nie znaleziono klienta';

// GET /api/customers/[id]
export const GET = withBusiness(
  async ({ business, params }) => {
    const customer = await db.customer.findFirst({
      where: { id: params.id, businessId: business.id },
      include: { visits: true },
    });
    if (!customer) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ customer });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać klienta' },
);

// PATCH /api/customers/[id]
export const PATCH = withBusiness(
  async ({ business, params, body }) => {
    const { name, surname, phone, email, smsConsent } = body;

    // Klient musi należeć do tego salonu.
    const customer = await db.customer.findFirst({ where: { id: params.id, businessId: business.id } });
    if (!customer) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const updated = await db.customer.update({
      where: { id: customer.id },
      data: {
        ...(name && { name }),
        ...(surname && { surname }),
        ...(phone && { phone }),
        ...(email !== undefined && { email }),
        ...(smsConsent !== undefined && { smsConsent }),
      },
    });
    return NextResponse.json({ customer: updated });
  },
  { body: updateCustomerSchema, notFound: NOT_FOUND, error: 'Nie udało się zaktualizować klienta' },
);

// DELETE /api/customers/[id]
export const DELETE = withBusiness(
  async ({ business, params }) => {
    const customer = await db.customer.findFirst({ where: { id: params.id, businessId: business.id } });
    if (!customer) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    // Usunięcie klienta kasuje kaskadowo jego wizyty i zlecenia. Towar z pozycji
    // zleceń wraca najpierw na stan magazynu — w tej samej transakcji.
    await db.$transaction(async (tx) => {
      await returnOrdersToStock(tx, { workOrder: { customerId: customer.id, businessId: business.id } });
      await tx.customer.delete({ where: { id: customer.id } });
    });

    return NextResponse.json({ message: 'Customer deleted successfully' });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się usunąć klienta' },
);
