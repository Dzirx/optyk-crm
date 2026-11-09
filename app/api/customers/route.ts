import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { createCustomerSchema, listCustomersQuerySchema } from '@/lib/api/schemas/customers';
import { customerSearchWhere } from '@/lib/api/search';

// GET /api/customers - klienci salonu z liczbą wizyt (`visitCount`).
// Parametry (opcjonalne): q (imię, nazwisko, e-mail, telefon), smsConsent=true|false, withVisits=1
// (dodaje tablicę `visits`, potrzebną tylko stronie wiadomości), page + pageSize (domyślnie 50, max 200).
// Bez `page`: cała lista w starym kształcie `{ customers }`.
// Z `page`: `{ customers, total, page, pageSize, counts }`, gdzie `counts` (dla bieżącego `q`,
// bez filtra zgody) zasila zakładki „wszyscy / ze zgodą / bez zgody”.
export const GET = withBusiness(
  async ({ req, business }) => {
    const parsed = listCustomersQuerySchema.safeParse(
      queryObject(req.nextUrl.searchParams, ['page', 'pageSize', 'q', 'smsConsent', 'withVisits']),
    );
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { page, pageSize, q, smsConsent, withVisits } = parsed.data;

    // businessId zawsze w warunku: żaden filtr ani strona nie wychodzi poza salon.
    const searchWhere: Prisma.CustomerWhereInput = { businessId: business.id, AND: customerSearchWhere(q) };
    const where: Prisma.CustomerWhereInput = {
      ...searchWhere,
      ...(smsConsent ? { smsConsent: smsConsent === 'true' } : {}),
    };
    const query = {
      where,
      include: {
        _count: { select: { visits: true } },
        ...(withVisits === '1' ? { visits: { select: { id: true, visitDate: true } } } : {}),
      },
      // `id` rozstrzyga remisy, żeby strony nie nakładały się na siebie.
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    };
    const shape = (found: Awaited<ReturnType<typeof db.customer.findMany<typeof query>>>) =>
      found.map(({ _count, ...customer }) => ({ ...customer, visitCount: _count.visits }));

    if (page === undefined) {
      return NextResponse.json({ customers: shape(await db.customer.findMany(query)) });
    }

    const [total, found, groups] = await db.$transaction([
      db.customer.count({ where }),
      db.customer.findMany({ ...query, skip: (page - 1) * pageSize, take: pageSize }),
      db.customer.groupBy({ by: ['smsConsent'], where: searchWhere, _count: { id: true }, orderBy: { smsConsent: 'asc' } }),
    ]);
    const countOf = (consent: boolean) => (groups.find((g) => g.smsConsent === consent)?._count as { id: number } | undefined)?.id ?? 0;
    const counts = { all: countOf(true) + countOf(false), consented: countOf(true), notConsented: countOf(false) };
    return NextResponse.json({ customers: shape(found), total, page, pageSize, counts });
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
