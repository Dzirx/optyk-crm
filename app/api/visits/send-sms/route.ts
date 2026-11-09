import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { renderSmsTemplate } from '@/lib/sms/render';
import { claimVisitSms, logVisitSms, markVisitSmsFailed, sendSafely } from '@/lib/sms/delivery';

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
    const { visitId, smsType } = body;

    if (!visitId || !smsType) {
      return NextResponse.json({ error: 'Wymagane ID wizyty i typ SMS' }, { status: 400 });
    }

    if (smsType !== 'reminder' && smsType !== 'review') {
      return NextResponse.json({ error: 'Typ SMS musi być "reminder" lub "review"' }, { status: 400 });
    }

    // Get visit with customer
    const visit = await db.visit.findFirst({
      where: { id: visitId },
      include: {
        customer: true,
      },
    });

    if (!visit || visit.customer.businessId !== userBusiness.id) {
      return NextResponse.json({ error: 'Nie znaleziono wizyty' }, { status: 404 });
    }

    // Check SMS consent
    if (!visit.customer.smsConsent) {
      return NextResponse.json({ error: 'Klient nie wyraził zgody na otrzymywanie SMS' }, { status: 400 });
    }

    // Check if already sent
    if (smsType === 'reminder' && visit.reminderSmsStatus === 'sent') {
      return NextResponse.json({ error: 'SMS z przypomnieniem już wysłany' }, { status: 400 });
    }

    if (smsType === 'review' && visit.reviewSmsStatus === 'sent') {
      return NextResponse.json({ error: 'SMS z prośbą o opinię już wysłany' }, { status: 400 });
    }

    // Verify SMS provider config
    if (!userBusiness.smsConfig || !userBusiness.smsProvider) {
      return NextResponse.json({ error: 'Dostawca SMS nie jest skonfigurowany' }, { status: 400 });
    }

    // Select template based on SMS type
    const template = smsType === 'reminder'
      ? userBusiness.reminderSmsTemplate
      : userBusiness.reviewSmsTemplate;

    if (!template) {
      return NextResponse.json({ error: `${smsType} SMS template not configured` }, { status: 400 });
    }

    // Replace placeholders in template
    const message = renderSmsTemplate(template, {
      name: `${visit.customer.name} ${visit.customer.surname}`,
      staff: userBusiness.name,
      link: userBusiness.googleReviewUrl,
      date: visit.visitDate,
    });

    let smsProvider;
    try {
      smsProvider = SmsProviderFactory.create(
        userBusiness.smsProvider as any,
        userBusiness.smsConfig as any
      );
    } catch (error) {
      console.error('SMS provider creation failed:', error);
      return NextResponse.json({ error: 'Nieprawidłowa konfiguracja dostawcy SMS' }, { status: 400 });
    }

    // Rezerwacja: chroni przed podwójną wysyłką (podwójne kliknięcie, równoległy cron).
    if (!(await claimVisitSms(visit.id, smsType, 'notSent'))) {
      return NextResponse.json({ error: 'Ten SMS został już wysłany' }, { status: 409 });
    }

    const smsResult = await sendSafely(smsProvider, visit.customer.phone, message);

    if (!smsResult.success) {
      console.error('SMS sending failed:', smsResult.error);
      await markVisitSmsFailed(visit.id, smsType);
      await logVisitSms({
        visitId: visit.id, smsType, phone: visit.customer.phone, message,
        status: 'failed', errorMessage: smsResult.error,
      });
      return NextResponse.json({
        error: 'Nie udało się wysłać SMS',
        details: smsResult.error || 'Nieznany błąd',
      }, { status: 500 });
    }

    // Log nie blokuje odpowiedzi — SMS już wyszedł, a status jest ustawiony.
    await logVisitSms({
      visitId: visit.id, smsType, phone: visit.customer.phone, message,
      status: 'sent', messageId: smsResult.messageId, cost: smsResult.cost,
    });

    return NextResponse.json({
      message: `${smsType} SMS sent successfully`,
      smsResult,
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    return NextResponse.json({ error: 'Nie udało się wysłać SMS' }, { status: 500 });
  }
}
