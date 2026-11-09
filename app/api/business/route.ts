import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userHasAccess } from '@/lib/api/get-user-business';

const ACCESS_EXPIRED = 'Okres próbny zakończył się. Skontaktuj się z nami, aby przedłużyć dostęp.';

// GET /api/business - Get user's business
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }
    if (!(await userHasAccess(session.user.id))) {
      return NextResponse.json({ error: ACCESS_EXPIRED }, { status: 403 });
    }

    const business = await db.business.findFirst({
      where: { userId: session.user.id },
    });

    if (!business) {
      return NextResponse.json({ business: null }, { status: 200 });
    }

    return NextResponse.json({ business }, { status: 200 });
  } catch (error) {
    console.error('Error fetching business:', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}

// POST /api/business - Create business
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }
    if (!(await userHasAccess(session.user.id))) {
      return NextResponse.json({ error: ACCESS_EXPIRED }, { status: 403 });
    }

    // Check if user already has a business (1:1 relationship in MVP)
    const existingBusiness = await db.business.findFirst({
      where: { userId: session.user.id },
    });

    if (existingBusiness) {
      return NextResponse.json(
        { error: 'Firma już istnieje. Zaktualizuj istniejącą firmę.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, phone, googleReviewUrl, smsProvider, smsConfig, reminderSmsTemplate, reviewSmsTemplate } = body;

    // Validation
    if (!name || !googleReviewUrl) {
      return NextResponse.json(
        { error: 'Nazwa i URL Google Reviews są wymagane' },
        { status: 400 }
      );
    }

    // Validate Google Review URL format
    const googleUrlPattern = /^https?:\/\/(www\.)?(g\.page|google\.com\/(maps|search)|goo\.gl)/i;
    if (!googleUrlPattern.test(googleReviewUrl)) {
      return NextResponse.json(
        { error: 'Nieprawidłowy format adresu URL Google Reviews' },
        { status: 400 }
      );
    }

    // Create business
    const newBusiness = await db.business.create({
      data: {
        userId: session.user.id,
        name,
        phone: phone || null,
        googleReviewUrl,
        smsProvider: smsProvider || 'smsapi',
        smsConfig: smsConfig || null,
        reminderSmsTemplate: reminderSmsTemplate || null,
        reviewSmsTemplate: reviewSmsTemplate || null,
      },
    });

    return NextResponse.json({ business: newBusiness }, { status: 201 });
  } catch (error) {
    console.error('Error creating business:', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}

// PATCH /api/business - Update business
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }
    if (!(await userHasAccess(session.user.id))) {
      return NextResponse.json({ error: ACCESS_EXPIRED }, { status: 403 });
    }

    const business = await db.business.findFirst({
      where: { userId: session.user.id },
    });

    if (!business) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    const body = await request.json();
    const { name, phone, googleReviewUrl, smsProvider, smsConfig, reminderSmsTemplate, reviewSmsTemplate } = body;

    // Validation
    if (googleReviewUrl) {
      const googleUrlPattern = /^https?:\/\/(www\.)?(g\.page|google\.com\/(maps|search)|goo\.gl)/i;
      if (!googleUrlPattern.test(googleReviewUrl)) {
        return NextResponse.json(
          { error: 'Nieprawidłowy format adresu URL Google Reviews' },
          { status: 400 }
        );
      }
    }

    // Update business
    const updatedBusiness = await db.business.update({
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

    return NextResponse.json({ business: updatedBusiness }, { status: 200 });
  } catch (error) {
    console.error('Error updating business:', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}

// DELETE /api/business - Delete business (only if no customers)
export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }
    if (!(await userHasAccess(session.user.id))) {
      return NextResponse.json({ error: ACCESS_EXPIRED }, { status: 403 });
    }

    const business = await db.business.findFirst({
      where: { userId: session.user.id },
    });

    if (!business) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    // Check if business has customers
    const customerCount = await db.customer.count({
      where: { businessId: business.id },
    });

    if (customerCount > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete business with existing customers. Please delete all customers first.',
        },
        { status: 400 }
      );
    }

    // Delete business
    await db.business.delete({
      where: { id: business.id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting business:', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}
