import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAccess } from '@/lib/api/handler';
import { createBusinessSchema, updateBusinessSchema } from '@/lib/api/schemas/business';

// Salon jest 1:1 z kontem. Te endpointy działają także bez salonu (POST go zakłada),
// a po końcu okresu próbnego odpowiadają 403 (withAccess).
const SERVER_ERROR = 'Wystąpił błąd serwera';

// GET /api/business - salon zalogowanego użytkownika
export const GET = withAccess(
  async ({ userId }) => {
    const business = await db.business.findFirst({ where: { userId } });
    return NextResponse.json({ business: business ?? null }, { status: 200 });
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

    const { name, phone, googleReviewUrl, smsProvider, smsConfig, reminderSmsTemplate, reviewSmsTemplate } = body;
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
