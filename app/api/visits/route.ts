import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { customerBelongsTo } from '@/lib/api/ownership';

/** Czy data z formularza wskazuje tę samą minutę co data w bazie (oba puste też są równe). */
function sameMinute(value: unknown, stored: Date | null): boolean {
  if (value === null || value === '') return stored === null;
  if (stored === null) return false;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return false;
  return Math.floor(d.getTime() / 60_000) === Math.floor(stored.getTime() / 60_000);
}

// GET - List all visits for business (with customer data)
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

    // Get all customers for this business
    const businessCustomers = await db.customer.findMany({
      where: { businessId: userBusiness.id },
      include: {
        visits: {
          orderBy: { visitDate: 'desc' },
          include: {
            review: true,
          },
        },
      },
    });

    // Flatten visits with customer data
    const allVisits = businessCustomers.flatMap(customer =>
      customer.visits.map(visit => ({
        ...visit,
        customerName: `${customer.name} ${customer.surname}`,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        smsConsent: customer.smsConsent,
      }))
    );

    // Sort by visit date descending
    allVisits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());

    return NextResponse.json({ visits: allVisits });
  } catch (error) {
    console.error('Error fetching visits:', error);
    return NextResponse.json({ error: 'Nie udało się pobrać wizyt' }, { status: 500 });
  }
}

// POST - Create new visit
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
    const {
      customerId,
      visitDate,
      visitType,
      notes,
      reminderSmsDate,
      reviewSmsDate
    } = body;

    // Validation
    if (!customerId) {
      return NextResponse.json({ error: 'Wymagane ID klienta' }, { status: 400 });
    }

    if (!visitDate) {
      return NextResponse.json({ error: 'Data wizyty jest wymagana' }, { status: 400 });
    }

    // Verify customer exists and belongs to business
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        businessId: userBusiness.id,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }

    // Validate dates
    const visit = new Date(visitDate);
    if (isNaN(visit.getTime())) {
      return NextResponse.json({ error: 'Nieprawidłowa data wizyty' }, { status: 400 });
    }

    if (reminderSmsDate) {
      const reminder = new Date(reminderSmsDate);
      if (isNaN(reminder.getTime())) {
        return NextResponse.json({ error: 'Nieprawidłowa data SMS z przypomnieniem' }, { status: 400 });
      }
      // Reminder should be before visit
      if (reminder >= visit) {
        return NextResponse.json({ error: 'Data SMS z przypomnieniem powinna być przed datą wizyty' }, { status: 400 });
      }
    }

    if (reviewSmsDate) {
      const review = new Date(reviewSmsDate);
      if (isNaN(review.getTime())) {
        return NextResponse.json({ error: 'Nieprawidłowa data SMS z prośbą o opinię' }, { status: 400 });
      }
      // Review should be after visit
      if (review <= visit) {
        return NextResponse.json({ error: 'Data SMS z prośbą o opinię powinna być po dacie wizyty' }, { status: 400 });
      }
    }

    // Create visit
    const newVisit = await db.visit.create({
      data: {
        customerId,
        visitDate: visit,
        visitType: visitType || null,
        notes: notes || null,
        reminderSmsDate: reminderSmsDate ? new Date(reminderSmsDate) : null,
        reviewSmsDate: reviewSmsDate ? new Date(reviewSmsDate) : null,
      },
    });

    return NextResponse.json({ visit: newVisit }, { status: 201 });
  } catch (error) {
    console.error('Error creating visit:', error);
    return NextResponse.json({ error: 'Nie udało się utworzyć wizyty' }, { status: 500 });
  }
}

// PATCH - Update visit
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
    const {
      id,
      customerId,
      visitDate,
      visitType,
      notes,
      reminderSmsDate,
      reviewSmsDate
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Wymagane ID wizyty' }, { status: 400 });
    }

    // Get visit with customer to verify ownership
    const visit = await db.visit.findFirst({
      where: { id },
      include: {
        customer: true,
      },
    });

    if (!visit || visit.customer.businessId !== userBusiness.id) {
      return NextResponse.json({ error: 'Nie znaleziono wizyty' }, { status: 404 });
    }

    // Nowy klient wizyty musi należeć do tego samego salonu.
    if (customerId !== undefined && customerId !== visit.customerId) {
      if (!(await customerBelongsTo(userBusiness.id, customerId))) {
        return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
      }
    }

    // Po wysyłce nie wolno zmienić daty SMS. Formularz zawsze odsyła datę,
    // więc blokujemy tylko rzeczywistą zmianę (z dokładnością do minuty).
    const reminderChanged = reminderSmsDate !== undefined && !sameMinute(reminderSmsDate, visit.reminderSmsDate);
    const reviewChanged = reviewSmsDate !== undefined && !sameMinute(reviewSmsDate, visit.reviewSmsDate);

    if (visit.reminderSmsStatus === 'sent' && reminderChanged) {
      return NextResponse.json({ error: 'Nie można zmienić daty SMS z przypomnieniem — wiadomość już wysłana' }, { status: 400 });
    }

    if (visit.reviewSmsStatus === 'sent' && reviewChanged) {
      return NextResponse.json({ error: 'Nie można zmienić daty SMS z prośbą o opinię — wiadomość już wysłana' }, { status: 400 });
    }

    // Validate dates if provided
    const newVisitDate = visitDate ? new Date(visitDate) : new Date(visit.visitDate);
    if (visitDate && isNaN(newVisitDate.getTime())) {
      return NextResponse.json({ error: 'Nieprawidłowa data wizyty' }, { status: 400 });
    }

    // Kolejność dat sprawdzamy, gdy zmienia się data SMS albo data wizyty (SMS jeszcze niewysłany).
    // Bez daty SMS w żądaniu porównujemy z datą zapisaną w bazie.
    const effectiveReminder = reminderSmsDate !== undefined ? reminderSmsDate : visit.reminderSmsDate?.toISOString();
    const effectiveReview = reviewSmsDate !== undefined ? reviewSmsDate : visit.reviewSmsDate?.toISOString();
    if (effectiveReminder && (reminderChanged || (visitDate && visit.reminderSmsStatus !== 'sent'))) {
      const reminder = new Date(effectiveReminder);
      if (isNaN(reminder.getTime())) {
        return NextResponse.json({ error: 'Nieprawidłowa data SMS z przypomnieniem' }, { status: 400 });
      }
      if (reminder >= newVisitDate) {
        return NextResponse.json({ error: 'Data SMS z przypomnieniem powinna być przed datą wizyty' }, { status: 400 });
      }
    }

    if (effectiveReview && (reviewChanged || (visitDate && visit.reviewSmsStatus !== 'sent'))) {
      const review = new Date(effectiveReview);
      if (isNaN(review.getTime())) {
        return NextResponse.json({ error: 'Nieprawidłowa data SMS z prośbą o opinię' }, { status: 400 });
      }
      if (review <= newVisitDate) {
        return NextResponse.json({ error: 'Data SMS z prośbą o opinię powinna być po dacie wizyty' }, { status: 400 });
      }
    }

    // Update visit
    const updateData: any = {};

    if (customerId !== undefined) updateData.customerId = customerId;
    if (visitDate !== undefined) updateData.visitDate = newVisitDate;
    if (visitType !== undefined) updateData.visitType = visitType;
    if (notes !== undefined) updateData.notes = notes;
    // Nowa data SMS po nieudanej wysyłce → SMS wraca do kolejki crona.
    if (reminderChanged) {
      updateData.reminderSmsDate = reminderSmsDate ? new Date(reminderSmsDate) : null;
      if (reminderSmsDate && visit.reminderSmsStatus === 'failed') updateData.reminderSmsStatus = 'pending';
    }
    if (reviewChanged) {
      updateData.reviewSmsDate = reviewSmsDate ? new Date(reviewSmsDate) : null;
      if (reviewSmsDate && visit.reviewSmsStatus === 'failed') updateData.reviewSmsStatus = 'pending';
    }

    const updatedVisit = await db.visit.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ visit: updatedVisit });
  } catch (error) {
    console.error('Error updating visit:', error);
    return NextResponse.json({ error: 'Nie udało się zaktualizować wizyty' }, { status: 500 });
  }
}

// DELETE - Delete visit
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
      return NextResponse.json({ error: 'Wymagane ID wizyty' }, { status: 400 });
    }

    // Get visit with customer to verify ownership
    const visit = await db.visit.findFirst({
      where: { id },
      include: {
        customer: true,
      },
    });

    if (!visit || visit.customer.businessId !== userBusiness.id) {
      return NextResponse.json({ error: 'Nie znaleziono wizyty' }, { status: 404 });
    }

    // Delete visit (cascade deletes reviews, sms_logs)
    await db.visit.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Visit deleted successfully' });
  } catch (error) {
    console.error('Error deleting visit:', error);
    return NextResponse.json({ error: 'Nie udało się usunąć wizyty' }, { status: 500 });
  }
}
