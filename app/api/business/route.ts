import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAccess } from '@/lib/api/handler';
import { WINDOW_ORDER_ERROR, createBusinessSchema, updateBusinessSchema } from '@/lib/api/schemas/business';
import { smsGatewayConfigured } from '@/lib/sms/configured';

// Salon jest 1:1 z kontem. Te endpointy działają także bez salonu (POST go zakłada),
// a po końcu okresu próbnego odpowiadają 403 (withAccess).
const SERVER_ERROR = 'Wystąpił błąd serwera';

// GET /api/business - salon zalogowanego użytkownika
export const GET = withAccess(
  async ({ userId }) => {
    const business = await db.business.findFirst({ where: { userId } });
    // smsReady: czy salon może wysyłać przypomnienia (dostawca, klucz i szablon); sam klucz nie jest do tego potrzebny w formularzach.
    const gateway = !!business && smsGatewayConfigured(business.smsProvider, business.smsConfig);
    const smsReady = gateway && !!business.reminderSmsTemplate?.trim();
    // reviewSmsReady: to samo dla prośby o opinię (szablon opinii).
    const reviewSmsReady = gateway && !!business.reviewSmsTemplate?.trim();
    return NextResponse.json({ business: business ? { ...business, smsGatewayReady: gateway, smsReady, reviewSmsReady } : null }, { status: 200 });
  },
  { error: SERVER_ERROR },
);

// POST /api/business - załóż salon
export const POST = withAccess(
  async ({ userId, body }) => {
    const existingBusiness = await db.business.findFirst({ where: { userId } });
    if (existingBusiness) {
      return NextResponse.json({ error: 'Firma już istnieje. Zaktualizuj istniejącą firmę.' }, { status: 400 });
    }

    const business = await db.business.create({
      data: {
        userId,
        name: body.name,
        phone: body.phone || null,
        googleReviewUrl: body.googleReviewUrl,
        smsProvider: body.smsProvider || 'smsapi',
        smsConfig: (body.smsConfig || null) as Prisma.InputJsonObject,
        reminderSmsTemplate: body.reminderSmsTemplate || null,
        reviewSmsTemplate: body.reviewSmsTemplate || null,
        ...(body.reminderWindowStart !== undefined && { reminderWindowStart: body.reminderWindowStart }),
        ...(body.reminderWindowEnd !== undefined && { reminderWindowEnd: body.reminderWindowEnd }),
        ...(body.autoReminders !== undefined && { autoReminders: body.autoReminders }),
      },
    });

    return NextResponse.json({ business }, { status: 201 });
  },
  { body: createBusinessSchema, error: SERVER_ERROR },
);

// PATCH /api/business - zmień dane salonu
export const PATCH = withAccess(
  async ({ userId, body }) => {
    const business = await db.business.findFirst({ where: { userId } });
    if (!business) return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });

    const { name, phone, googleReviewUrl, smsProvider, smsConfig, reminderSmsTemplate, reviewSmsTemplate, reminderWindowStart, reminderWindowEnd, autoReminders } = body;
    // Okno sprawdzamy razem z zapisaną wartością drugiego końca.
    if ((reminderWindowStart ?? business.reminderWindowStart) >= (reminderWindowEnd ?? business.reminderWindowEnd)) {
      return NextResponse.json({ error: WINDOW_ORDER_ERROR }, { status: 400 });
    }
    const updated = await db.business.update({
      where: { id: business.id },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(googleReviewUrl !== undefined && { googleReviewUrl }),
        ...(smsProvider !== undefined && { smsProvider }),
        ...(smsConfig !== undefined && { smsConfig }),
        ...(reminderSmsTemplate !== undefined && { reminderSmsTemplate }),
        ...(reviewSmsTemplate !== undefined && { reviewSmsTemplate }),
        ...(reminderWindowStart !== undefined && { reminderWindowStart }),
        ...(reminderWindowEnd !== undefined && { reminderWindowEnd }),
        ...(autoReminders !== undefined && { autoReminders }),
      },
    });

    return NextResponse.json({ business: updated }, { status: 200 });
  },
  { body: updateBusinessSchema, error: SERVER_ERROR },
);

// DELETE /api/business - usuń salon (tylko bez klientów)
export const DELETE = withAccess(
  async ({ userId }) => {
    const business = await db.business.findFirst({ where: { userId } });
    if (!business) return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });

    const customerCount = await db.customer.count({ where: { businessId: business.id } });
    if (customerCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete business with existing customers. Please delete all customers first.' },
        { status: 400 },
      );
    }

    await db.business.delete({ where: { id: business.id } });
    return NextResponse.json({ success: true }, { status: 200 });
  },
  { error: SERVER_ERROR },
);
