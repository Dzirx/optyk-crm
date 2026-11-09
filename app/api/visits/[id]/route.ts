import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { customerBelongsTo } from '@/lib/api/ownership';
import { REMINDER_BEFORE_VISIT, REVIEW_AFTER_VISIT, updateVisitSchema } from '@/lib/api/schemas/visits';

const NOT_FOUND = 'Nie znaleziono wizyty';

/** Czy data z formularza wskazuje tę samą minutę co data w bazie (oba puste też są równe). */
function sameMinute(value: Date | null, stored: Date | null): boolean {
  if (value === null) return stored === null;
  if (stored === null) return false;
  return Math.floor(value.getTime() / 60_000) === Math.floor(stored.getTime() / 60_000);
}

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// GET /api/visits/[id] - ten sam kształt co pozycja z GET /api/visits
export const GET = withBusiness(
  async ({ business, params }) => {
    const found = await db.visit.findFirst({
      where: { id: params.id, customer: { businessId: business.id } },
      include: { customer: true },
    });
    if (!found) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const { customer, ...visit } = found;
    return NextResponse.json({
      visit: {
        ...visit,
        customerName: `${customer.name} ${customer.surname}`,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        smsConsent: customer.smsConsent,
      },
    });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się pobrać wizyty' },
);

// PATCH /api/visits/[id]
export const PATCH = withBusiness(
  async ({ business, params, body }) => {
    const { customerId, visitType, notes, reminderSmsDate, reviewSmsDate } = body;
    const visitDate = body.visitDate ?? undefined; // pusta data wizyty = bez zmiany

    // Wizyta musi należeć do klienta tego salonu.
    const visit = await db.visit.findFirst({
      where: { id: params.id, customer: { businessId: business.id } },
    });
    if (!visit) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    // Nowy klient wizyty musi należeć do tego samego salonu.
    if (customerId !== undefined && customerId !== visit.customerId) {
      if (!(await customerBelongsTo(business.id, customerId))) {
        return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
      }
    }

    // Po wysyłce nie wolno zmienić daty SMS. Formularz zawsze odsyła datę,
    // więc blokujemy tylko rzeczywistą zmianę (z dokładnością do minuty).
    const reminderChanged = reminderSmsDate !== undefined && !sameMinute(reminderSmsDate, visit.reminderSmsDate);
    const reviewChanged = reviewSmsDate !== undefined && !sameMinute(reviewSmsDate, visit.reviewSmsDate);

    if (visit.reminderSmsStatus === 'sent' && reminderChanged) {
      return badRequest('Nie można zmienić daty SMS z przypomnieniem — wiadomość już wysłana');
    }
    if (visit.reviewSmsStatus === 'sent' && reviewChanged) {
      return badRequest('Nie można zmienić daty SMS z prośbą o opinię — wiadomość już wysłana');
    }

    // Kolejność dat sprawdzamy, gdy zmienia się data SMS albo data wizyty (SMS jeszcze niewysłany).
    // Bez daty SMS w żądaniu porównujemy z datą zapisaną w bazie.
    const newVisitDate = visitDate ?? visit.visitDate;
    const effectiveReminder = reminderSmsDate !== undefined ? reminderSmsDate : visit.reminderSmsDate;
    const effectiveReview = reviewSmsDate !== undefined ? reviewSmsDate : visit.reviewSmsDate;
    if (effectiveReminder && (reminderChanged || (visitDate && visit.reminderSmsStatus !== 'sent'))) {
      if (effectiveReminder >= newVisitDate) return badRequest(REMINDER_BEFORE_VISIT);
    }
    if (effectiveReview && (reviewChanged || (visitDate && visit.reviewSmsStatus !== 'sent'))) {
      if (effectiveReview <= newVisitDate) return badRequest(REVIEW_AFTER_VISIT);
    }

    const updateData: Prisma.VisitUncheckedUpdateInput = {};
    if (customerId !== undefined) updateData.customerId = customerId;
    if (visitDate !== undefined) updateData.visitDate = visitDate;
    if (visitType !== undefined) updateData.visitType = visitType;
    if (notes !== undefined) updateData.notes = notes;
    // Nowa data SMS po nieudanej wysyłce → SMS wraca do kolejki crona.
    if (reminderChanged) {
      updateData.reminderSmsDate = reminderSmsDate;
      if (reminderSmsDate && visit.reminderSmsStatus === 'failed') updateData.reminderSmsStatus = 'pending';
    }
    if (reviewChanged) {
      updateData.reviewSmsDate = reviewSmsDate;
      if (reviewSmsDate && visit.reviewSmsStatus === 'failed') updateData.reviewSmsStatus = 'pending';
    }

    const updated = await db.visit.update({ where: { id: visit.id }, data: updateData });
    return NextResponse.json({ visit: updated });
  },
  { body: updateVisitSchema, notFound: NOT_FOUND, error: 'Nie udało się zaktualizować wizyty' },
);

// DELETE /api/visits/[id]
export const DELETE = withBusiness(
  async ({ business, params }) => {
    const visit = await db.visit.findFirst({
      where: { id: params.id, customer: { businessId: business.id } },
      select: { id: true },
    });
    if (!visit) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    // Usuwa też opinie i logi SMS (kaskada).
    await db.visit.delete({ where: { id: visit.id } });
    return NextResponse.json({ message: 'Visit deleted successfully' });
  },
  { notFound: NOT_FOUND, error: 'Nie udało się usunąć wizyty' },
);
