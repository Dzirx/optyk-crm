// Wysyłka zaplanowanych SMS-ów (przypomnienie przed wizytą, prośba o opinię po wizycie).
// Wywołuje ją wbudowany harmonogram (lib/sms/scheduler.ts, chmura), licznik w wersji Windows
// albo ręcznie endpoint /api/cron/send-scheduled-sms. Każdy SMS jest rezerwowany przed wysłaniem
// (claimVisitSms), więc równoległe uruchomienia nie wyślą go dwa razy.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { activeUserWhere } from '@/lib/access';
import { recordReviewSms, visitSource } from '@/lib/customers/review-request';
import { isWithinSendWindow } from '@/lib/sms/window';
import { renderSmsTemplate } from '@/lib/sms/render';
import { processCampaigns } from '@/lib/sms/campaigns';
import { claimVisitSms, logVisitSms, markVisitSmsFailed, sendSafely, type VisitSmsType } from '@/lib/sms/delivery';
import { smsGatewayConfigured } from '@/lib/sms/configured';

export async function runScheduledSms() {
  const now = new Date();
  console.log(`[CRON] Starting scheduled SMS job at ${now.toISOString()}`);

  const results = {
    reminderSms: { processed: 0, sent: 0, failed: 0, skipped: 0 },
    reviewSms: { processed: 0, sent: 0, failed: 0, skipped: 0 },
    errors: [] as Array<{ visitId: string; type: string; error: string }>,
    campaigns: { campaigns: 0, sent: 0, failed: 0, finished: 0 },
  };

  // Find pending reminder SMS (before visit)
  const pendingReminders = await db.visit.findMany({
    where: {
      reminderSmsDate: {
        not: null,
        lte: now,
      },
      reminderSmsStatus: 'pending',
      // Salony po końcu okresu próbnego nie wysyłają SMS; przy wyłączonych automatycznych
      // przypomnieniach salon wysyła je ręcznie (przypomnienie czeka, bez błędu).
      customer: { business: { user: activeUserWhere(now), autoReminders: true } },
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

  // Process reminder SMS. Poza oknem wysyłki salonu przypomnienie czeka (bez wpisu i błędu),
  // chyba że wizyta już się zaczęła: wtedy i tak nie wyjdzie, więc oznaczamy je jako pominięte.
  for (const visit of pendingReminders) {
    const { reminderWindowStart, reminderWindowEnd } = visit.customer.business;
    const visitStarted = new Date(visit.visitDate).getTime() <= now.getTime();
    if (!visitStarted && !isWithinSendWindow(now, reminderWindowStart, reminderWindowEnd)) continue;
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

  // Wysyłki grupowe (kampanie) w tle: ten sam harmonogram, krótki limit czasu na uruchomienie.
  // Na końcu, żeby przypomnienia i prośby o opinię (zależne od czasu) nie czekały na długą kampanię.
  try {
    results.campaigns = await processCampaigns();
  } catch (error) {
    console.error('[CRON] Campaign processing failed:', error);
  }

  console.log(`[CRON] Job completed. Reminders: ${results.reminderSms.sent}/${results.reminderSms.processed}, Reviews: ${results.reviewSms.sent}/${results.reviewSms.processed}`);

  return { timestamp: now.toISOString(), results };
}

async function processSms(visit: any, smsType: VisitSmsType, results: any) {
  const counters = results[`${smsType}Sms`];
  const statusField = smsType === 'reminder' ? 'reminderSmsStatus' : 'reviewSmsStatus';

  // Błąd przed wysyłką: oznacz jako nieudany (SMS nie wyszedł, więc nie ma ryzyka duplikatu).
  // Warunek „pending” chroni przed nadpisaniem SMS-a, który równoległe uruchomienie już wysłało.
  async function failBeforeSend(reason: string, message = '') {
    const res = await db.visit.updateMany({ where: { id: visit.id, [statusField]: 'pending' }, data: { [statusField]: 'failed' } });
    if (res.count !== 1) return;
    await logVisitSms({ visitId: visit.id, smsType, phone: visit.customer.phone, message, status: 'failed', errorMessage: reason });
  }

  try {
    const customer = visit.customer;
    const business = customer.business;

    // Przypomnienie po rozpoczęciu wizyty nie ma sensu (np. serwer lub komputer z wersją Windows
    // był wyłączony w zaplanowanym czasie). Nie wysyłamy go i zapisujemy powód.
    if (smsType === 'reminder' && new Date(visit.visitDate).getTime() <= Date.now()) {
      console.log(`[CRON] Skipping reminder for visit ${visit.id} - visit already took place`);
      counters.skipped++;
      await failBeforeSend('Reminder skipped: visit already took place');
      return;
    }

    // Check SMS consent
    if (!customer.smsConsent) {
      console.log(`[CRON] Skipping ${smsType} for visit ${visit.id} - customer has no SMS consent`);
      counters.skipped++;
      await failBeforeSend('Customer has not consented to SMS');
      return;
    }

    // Validate business SMS configuration
    if (!smsGatewayConfigured(business.smsProvider, business.smsConfig)) {
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
    if (smsType === 'review') await recordReviewSms(visit.customerId ?? customer.id, visitSource(visit.visitDate));
    counters.sent++;
  } catch (error) {
    console.error(`[CRON] Unexpected error processing visit ${visit.id}:`, error);
    results.errors.push({ visitId: visit.id, type: smsType, error: 'Unexpected error' });
    counters.failed++;
  }
}
