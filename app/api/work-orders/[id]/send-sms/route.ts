import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { sendSafely } from '@/lib/sms/delivery';
import { withBusiness } from '@/lib/api/handler';
import { renderSmsTemplate } from '@/lib/sms/render';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// POST /api/work-orders/[id]/send-sms - SMS z prośbą o opinię
export const POST = withBusiness(
  async ({ business, params }) => {
    const workOrderId = params.id;

    const workOrder = await db.workOrder.findFirst({
      where: { id: workOrderId, businessId: business.id },
      include: { customer: true },
    });
    if (!workOrder) return bad('Nie znaleziono zlecenia', 404);

    if (!workOrder.customer.smsConsent) return bad('Klient nie wyraził zgody na otrzymywanie SMS');

    if (!business.smsConfig || !business.smsProvider) return bad('Dostawca SMS nie jest skonfigurowany');

    const template = business.reviewSmsTemplate;
    if (!template) return bad('Szablon SMS z prośbą o opinię nie jest skonfigurowany');

    const message = renderSmsTemplate(template, {
      name: `${workOrder.customer.name} ${workOrder.customer.surname}`,
      staff: business.name,
      link: business.googleReviewUrl,
      date: workOrder.receivedAt,
    });

    let smsProvider;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      smsProvider = SmsProviderFactory.create(business.smsProvider as any, business.smsConfig as any);
    } catch {
      return bad('Nieprawidłowa konfiguracja dostawcy SMS');
    }

    // Rezerwacja przed wysyłką: podwójne kliknięcie nie wyśle drugiego SMS.
    const claim = await db.workOrder.updateMany({
      where: { id: workOrderId, businessId: business.id, reviewSmsStatus: { not: 'sent' } },
      data: { reviewSmsStatus: 'sent', reviewSmsSentAt: new Date() },
    });
    if (claim.count !== 1) return bad('Ten SMS został już wysłany', 409);

    const smsResult = await sendSafely(smsProvider, workOrder.customer.phone, message);

    if (!smsResult.success) {
      await db.workOrder.update({
        where: { id: workOrderId },
        data: { reviewSmsStatus: 'failed', reviewSmsSentAt: null },
      });
      return bad(smsResult.error || 'Dostawca SMS zwrócił błąd', 500);
    }

    return NextResponse.json({ message: 'Review SMS sent successfully', smsResult });
  },
  { notFound: 'Nie znaleziono zlecenia', error: 'Nie udało się wysłać SMS' },
);
