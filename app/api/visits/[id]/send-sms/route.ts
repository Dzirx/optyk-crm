import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { withBusiness } from '@/lib/api/handler';
import { sendVisitSmsSchema } from '@/lib/api/schemas/visits';
import { renderSmsTemplate } from '@/lib/sms/render';
import { recordReviewSms, visitSource } from '@/lib/customers/review-request';
import { claimVisitReview, claimVisitSms, finishVisitReview, logVisitSms, markVisitSmsFailed, sendSafely } from '@/lib/sms/delivery';
import { smsGatewayConfigured } from '@/lib/sms/configured';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// POST /api/visits/[id]/send-sms  { smsType: 'reminder' | 'review' }
export const POST = withBusiness(
  async ({ business, params, body }) => {
    const { smsType } = body;

    // Wizyta musi należeć do klienta tego salonu.
    const visit = await db.visit.findFirst({
      where: { id: params.id, customer: { businessId: business.id } },
      include: { customer: true },
    });
    if (!visit) return bad('Nie znaleziono wizyty', 404);

    if (!visit.customer.smsConsent) return bad('Klient nie wyraził zgody na otrzymywanie SMS');

    if (smsType === 'reminder' && visit.reminderSmsStatus === 'sent') return bad('SMS z przypomnieniem już wysłany');
    if (smsType === 'reminder' && new Date(visit.visitDate).getTime() <= Date.now()) return bad('Wizyta już się odbyła — przypomnienie nie ma sensu');

    if (!smsGatewayConfigured(business.smsProvider, business.smsConfig)) return bad('Dostawca SMS nie jest skonfigurowany');

    const template = smsType === 'reminder' ? business.reminderSmsTemplate : business.reviewSmsTemplate;
    if (!template) return bad(smsType === 'reminder' ? 'Brak szablonu przypomnienia SMS. Uzupełnij go w Ustawieniach.' : 'Brak szablonu prośby o opinię SMS. Uzupełnij go w Ustawieniach.');

    const message = renderSmsTemplate(template, {
      name: `${visit.customer.name} ${visit.customer.surname}`,
      staff: business.name,
      link: business.googleReviewUrl,
      date: visit.visitDate,
    });

    let smsProvider;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      smsProvider = SmsProviderFactory.create(business.smsProvider as any, business.smsConfig as any);
    } catch (error) {
      console.error('SMS provider creation failed:', error);
      return bad('Nieprawidłowa konfiguracja dostawcy SMS');
    }

    // Rezerwacja: chroni przed podwójną wysyłką (podwójne kliknięcie, równoległy cron).
    // Prośbę o opinię można wysłać ponownie (decyzja w oknie potwierdzenia); rezerwacja nadal jest atomowa.
    const reviewPrev = { status: visit.reviewSmsStatus, sentAt: visit.reviewSmsSentAt };
    const claimed = smsType === 'review'
      ? await claimVisitReview(visit.id, reviewPrev)
      : await claimVisitSms(visit.id, smsType, 'notSent');
    if (!claimed) return bad('Ten SMS został już wysłany', 409);

    const smsResult = await sendSafely(smsProvider, visit.customer.phone, message);

    if (!smsResult.success) {
      console.error('SMS sending failed:', smsResult.error);
      if (smsType === 'review') await finishVisitReview(visit.id, false, reviewPrev);
      else await markVisitSmsFailed(visit.id, smsType);
      await logVisitSms({
        visitId: visit.id, smsType, phone: visit.customer.phone, message,
        status: 'failed', errorMessage: smsResult.error,
      });
      return NextResponse.json(
        { error: 'Nie udało się wysłać SMS', details: smsResult.error || 'Nieznany błąd' },
        { status: 500 },
      );
    }

    // Log nie blokuje odpowiedzi — SMS już wyszedł, a status jest ustawiony.
    await logVisitSms({
      visitId: visit.id, smsType, phone: visit.customer.phone, message,
      status: 'sent', messageId: smsResult.messageId, cost: smsResult.cost,
    });

    if (smsType === 'review') await finishVisitReview(visit.id, true, reviewPrev);
    if (smsType === 'review') await recordReviewSms(visit.customerId, visitSource(visit.visitDate));

    return NextResponse.json({ message: `${smsType} SMS sent successfully`, smsResult });
  },
  { body: sendVisitSmsSchema, notFound: 'Nie znaleziono wizyty', error: 'Nie udało się wysłać SMS' },
);
