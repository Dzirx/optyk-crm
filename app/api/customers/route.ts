import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { createCustomerSchema, listCustomersQuerySchema } from '@/lib/api/schemas/customers';
import { customerSearchWhere } from '@/lib/api/search';
import { lastReviewForCustomers } from '@/lib/customers/review-request';
import { customerListWhere, customerOrderBy, pageIdsByLastVisit } from '@/lib/customers/list-filter';

// GET /api/customers - klienci salonu z liczbą wizyt (`visitCount`).
// Parametry (opcjonalne): q (imię, nazwisko, e-mail, telefon), smsConsent=true|false, withVisits=1
// (dodaje tablicę `visits`), visitRanges / visitFrom / visitTo / sort (filtry strony wiadomości), page + pageSize (domyślnie 50, max 200).
// Bez `page`: cała lista w starym kształcie `{ customers }`.
// Z `page`: `{ customers, total, page, pageSize, counts, selectableTotal }`, gdzie `selectableTotal` to pasujący ze zgodą SMS, `counts` (dla bieżącego `q`,
// bez filtra zgody) zasila zakładki „wszyscy / ze zgodą / bez zgody”.
export const GET = withBusiness(
  async ({ req, business }) => {
    const parsed = listCustomersQuerySchema.safeParse(
      queryObject(req.nextUrl.searchParams, ['page', 'pageSize', 'q', 'smsConsent', 'withVisits', 'visitRanges', 'visitFrom', 'visitTo', 'sort']),
    );
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { page, pageSize, q, smsConsent, withVisits, sort, ...visitFilter } = parsed.data;

    // businessId zawsze w warunku: żaden filtr ani strona nie wychodzi poza salon.
    const searchWhere: Prisma.CustomerWhereInput = { businessId: business.id, AND: customerSearchWhere(q) };
    const where: Prisma.CustomerWhereInput = await customerListWhere(business.id, { q, smsConsent, ...visitFilter });
    const query = {
      where,
      include: {
        _count: { select: { visits: true } },
        ...(withVisits === '1' ? { visits: { select: { id: true, visitDate: true } } } : {}),
      },
      orderBy: customerOrderBy(sort),
    };
    const shape = (found: Awaited<ReturnType<typeof db.customer.findMany<typeof query>>>) =>
      found.map(({ _count, ...customer }) => ({ ...customer, visitCount: _count.visits }));

    if (page === undefined) {
      return NextResponse.json({ customers: shape(await db.customer.findMany(query)) });
    }

    // Sortowanie po dacie ostatniej wizyty: kolejność id liczy SQL, reszta danych jak zwykle.
    const lastVisitOrder = sort === 'date-desc' || sort === 'date-asc' ? await pageIdsByLastVisit(where, sort === 'date-desc' ? 'desc' : 'asc', (page - 1) * pageSize, pageSize) : null;
    const pageWhere: Prisma.CustomerWhereInput = lastVisitOrder ? { AND: [where, { id: { in: lastVisitOrder } }] } : where;
    const pageQuery = {
      ...query,
      where: pageWhere,
      skip: lastVisitOrder ? undefined : (page - 1) * pageSize,
      take: lastVisitOrder ? undefined : pageSize,
    };
    const [total, foundRaw, groups, selectable] = await db.$transaction([
      db.customer.count({ where }),
      db.customer.findMany(pageQuery),
      db.customer.groupBy({ by: ['smsConsent'], where: searchWhere, _count: { id: true }, orderBy: { smsConsent: 'asc' } }),
      // Ilu pasujących da się zaznaczyć do SMS (tylko ze zgodą).
      db.customer.count({ where: { AND: [where, { smsConsent: true }] } }),
    ]);
    const found = lastVisitOrder ? lastVisitOrder.map((id) => foundRaw.find((c) => c.id === id)!).filter(Boolean) : foundRaw;
    // Ostatnia prośba o opinię: kolumna, a gdy pusta — zgrupowane zapytanie zapasowe (jedno na stronę).
    const lastReview = await lastReviewForCustomers(found);
    const countOf = (consent: boolean) => (groups.find((g) => g.smsConsent === consent)?._count as { id: number } | undefined)?.id ?? 0;
    const counts = { all: countOf(true) + countOf(false), consented: countOf(true), notConsented: countOf(false) };
    return NextResponse.json({ customers: shape(found).map((c) => ({
        ...c,
        lastReviewSmsAt: lastReview.get(c.id)?.at ?? null,
        lastReviewSmsSource: lastReview.get(c.id)?.source ?? null,
      })), total, page, pageSize, counts, selectableTotal: selectable });
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
