import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { activeUserWhere } from '@/lib/access';
import { renderSmsTemplate } from '@/lib/sms/render';
import { claimVisitSms, logVisitSms, markVisitSmsFailed, sendSafely, type VisitSmsType } from '@/lib/sms/delivery';

/**
 * Cron job to send scheduled SMS messages (reminder + review)
 *
 * This endpoint should be called periodically (e.g., every 5-15 minutes) by a cron service
 * Security: Requires CRON_SECRET in headers
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json({ error: 'Usługa cron nie jest skonfigurowana' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('Unauthorized cron attempt');
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const now = new Date();
    console.log(`[CRON] Starting scheduled SMS job at ${now.toISOString()}`);

    const results = {
      reminderSms: { processed: 0, sent: 0, failed: 0, skipped: 0 },
      reviewSms: { processed: 0, sent: 0, failed: 0, skipped: 0 },
      errors: [] as Array<{ visitId: string; type: string; error: string }>,
    };

    // Find pending reminder SMS (before visit)
    const pendingReminders = await db.visit.findMany({
      where: {
        reminderSmsDate: {
          not: null,
          lte: now,
        },
        reminderSmsStatus: 'pending',
        // Salony po końcu okresu próbnego nie wysyłają SMS.
        customer: { business: { user: activeUserWhere(now) } },
      },
      include: {
        customer: {
          include: {
            business: true,
          },
        },
      },
    });

    console.log(`[CRON] Found ${pendingReminders.length} pending reminder SMS`);

    // Process reminder SMS
    for (const visit of pendingReminders) {
      results.reminderSms.processed++;
      await processSms(visit, 'reminder', results);
    }

    // Find pending review SMS (after visit)
    const pendingReviews = await db.visit.findMany({
      where: {
        reviewSmsDate: {
          not: null,
          lte: now,
        },
        reviewSmsStatus: 'pending',
        // Salony po końcu okresu próbnego nie wysyłają SMS.
        customer: { business: { user: activeUserWhere(now) } },
      },
      include: {
        customer: {
          include: {
            business: true,
          },
        },
      },
    });

    console.log(`[CRON] Found ${pendingReviews.length} pending review SMS`);

    // Process review SMS
    for (const visit of pendingReviews) {
      results.reviewSms.processed++;
      await processSms(visit, 'review', results);
    }

    console.log(`[CRON] Job completed. Reminders: ${results.reminderSms.sent}/${results.reminderSms.processed}, Reviews: ${results.reviewSms.sent}/${results.reviewSms.processed}`);

    return NextResponse.json({
      message: 'Scheduled SMS job completed',
      timestamp: now.toISOString(),
      results,
    });
  } catch (error) {
    console.error('[CRON] Fatal error:', error);
    return NextResponse.json(
      { error: 'Nie udało się przetworzyć zaplanowanego SMS' },
      { status: 500 }
    );
  }
}

async function processSms(visit: any, smsType: VisitSmsType, results: any) {
  const counters = results[`${smsType}Sms`];
  const statusField = smsType === 'reminder' ? 'reminderSmsStatus' : 'reviewSmsStatus';

  // Błąd przed wysyłką: oznacz jako nieudany (SMS nie wyszedł, więc nie ma ryzyka duplikatu).
  async function failBeforeSend(reason: string, message = '') {
    await db.visit.update({ where: { id: visit.id }, data: { [statusField]: 'failed' } });
    await logVisitSms({ visitId: visit.id, smsType, phone: visit.customer.phone, message, status: 'failed', errorMessage: reason });
  }

  try {
    const customer = visit.customer;
    const business = customer.business;

    // Check SMS consent
    if (!customer.smsConsent) {
      console.log(`[CRON] Skipping ${smsType} for visit ${visit.id} - customer has no SMS consent`);
      counters.skipped++;
      await failBeforeSend('Customer has not consented to SMS');
      return;
    }

    // Validate business SMS configuration
    if (!business.smsProvider || !business.smsConfig) {
      console.warn(`[CRON] Business ${business.id} has no SMS configuration`);
      results.errors.push({ visitId: visit.id, type: smsType, error: 'No SMS configuration' });
      counters.failed++;
      await failBeforeSend('Business SMS provider not configured');
      return;
    }

    // Get template
    const template = smsType === 'reminder' ? business.reminderSmsTemplate : business.reviewSmsTemplate;
    if (!template) {
      console.warn(`[CRON] Business ${business.id} missing ${smsType} template`);
      results.errors.push({ visitId: visit.id, type: smsType, error: 'Template not configured' });
      counters.failed++;
      await failBeforeSend('SMS template not configured');
      return;
    }

    // Generate message from template
    const message = renderSmsTemplate(template, {
      name: `${customer.name} ${customer.surname}`,
      staff: business.name,
      link: business.googleReviewUrl,
      date: visit.visitDate,
    });

    // Create SMS provider
    let smsProvider;
    try {
      smsProvider = SmsProviderFactory.create(business.smsProvider as any, business.smsConfig as any);
    } catch (error) {
      console.error(`[CRON] Failed to create SMS provider:`, error);
      results.errors.push({ visitId: visit.id, type: smsType, error: 'Provider creation failed' });
      counters.failed++;
      await failBeforeSend(error instanceof Error ? error.message : 'Provider creation failed', message);
      return;
    }

    // Rezerwacja: tylko jeden proces może wysłać ten SMS (chroni przed duplikatami
    // przy równoległych uruchomieniach crona i przy błędach zapisu po wysyłce).
    if (!(await claimVisitSms(visit.id, smsType, 'pending'))) {
      console.log(`[CRON] ${smsType} for visit ${visit.id} already handled by another run`);
      counters.skipped++;
      return;
    }

    const smsResult = await sendSafely(smsProvider, customer.phone, message);

    if (!smsResult.success) {
      console.error(`[CRON] ${smsType} SMS failed for visit ${visit.id}: ${smsResult.error}`);
      await markVisitSmsFailed(visit.id, smsType);
      await logVisitSms({ visitId: visit.id, smsType, phone: customer.phone, message, status: 'failed', errorMessage: smsResult.error });
      results.errors.push({ visitId: visit.id, type: smsType, error: 'Sending failed' });
      counters.failed++;
      return;
    }

    console.log(`[CRON] ${smsType} SMS sent successfully for visit ${visit.id}`);
    await logVisitSms({
      visitId: visit.id, smsType, phone: customer.phone, message, status: 'sent',
      messageId: smsResult.messageId, cost: smsResult.cost,
    });
    counters.sent++;
  } catch (error) {
    console.error(`[CRON] Unexpected error processing visit ${visit.id}:`, error);
    results.errors.push({ visitId: visit.id, type: smsType, error: 'Unexpected error' });
    counters.failed++;
  }
}
