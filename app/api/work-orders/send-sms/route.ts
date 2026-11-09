import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { sendSafely } from '@/lib/sms/delivery';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { renderSmsTemplate } from '@/lib/sms/render';

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
    const workOrderId: unknown = body.workOrderId;

    if (!workOrderId || typeof workOrderId !== 'string') {
      return NextResponse.json({ error: 'Wymagane ID zlecenia' }, { status: 400 });
    }

    const workOrder = await db.workOrder.findFirst({
      where: { id: workOrderId, businessId: userBusiness.id },
      include: { customer: true },
    });

    if (!workOrder) {
      return NextResponse.json({ error: 'Nie znaleziono zlecenia' }, { status: 404 });
    }

    if (!workOrder.customer.smsConsent) {
      return NextResponse.json({ error: 'Klient nie wyraził zgody na otrzymywanie SMS' }, { status: 400 });
    }

    if (!userBusiness.smsConfig || !userBusiness.smsProvider) {
      return NextResponse.json({ error: 'Dostawca SMS nie jest skonfigurowany' }, { status: 400 });
    }

    const template = userBusiness.reviewSmsTemplate;
    if (!template) {
      return NextResponse.json({ error: 'Szablon SMS z prośbą o opinię nie jest skonfigurowany' }, { status: 400 });
    }

    const message = renderSmsTemplate(template, {
      name: `${workOrder.customer.name} ${workOrder.customer.surname}`,
      staff: userBusiness.name,
      link: userBusiness.googleReviewUrl,
      date: workOrder.receivedAt,
    });

    let smsProvider;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      smsProvider = SmsProviderFactory.create(userBusiness.smsProvider as any, userBusiness.smsConfig as any);
    } catch {
      return NextResponse.json({ error: 'Nieprawidłowa konfiguracja dostawcy SMS' }, { status: 400 });
    }

    // Rezerwacja przed wysyłką: podwójne kliknięcie nie wyśle drugiego SMS.
    const claim = await db.workOrder.updateMany({
      where: { id: workOrderId, businessId: userBusiness.id, reviewSmsStatus: { not: 'sent' } },
      data: { reviewSmsStatus: 'sent', reviewSmsSentAt: new Date() },
    });
    if (claim.count !== 1) {
      return NextResponse.json({ error: 'Ten SMS został już wysłany' }, { status: 409 });
    }

    const smsResult = await sendSafely(smsProvider, workOrder.customer.phone, message);

    if (!smsResult.success) {
      await db.workOrder.update({
        where: { id: workOrderId },
        data: { reviewSmsStatus: 'failed', reviewSmsSentAt: null },
      });
      return NextResponse.json({ error: smsResult.error || 'Dostawca SMS zwrócił błąd' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Review SMS sent successfully', smsResult });
  } catch (error) {
    console.error('Error sending SMS:', error);
    return NextResponse.json({ error: 'Nie udało się wysłać SMS' }, { status: 500 });
  }
}
