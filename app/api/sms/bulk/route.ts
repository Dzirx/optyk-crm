import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { SmsProviderFactory } from '@/lib/sms/providers/factory';
import { sendSafely } from '@/lib/sms/delivery';
import { getUserBusiness } from '@/lib/api/get-user-business';

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

    if (!userBusiness.smsConfig || !userBusiness.smsProvider) {
      return NextResponse.json({ error: 'Dostawca SMS nie jest skonfigurowany' }, { status: 400 });
    }

    const body = await req.json();
    const { message, customerIds } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Treść wiadomości jest wymagana' }, { status: 400 });
    }

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ error: 'Nie wybrano odbiorców' }, { status: 400 });
    }

    const customers = await db.customer.findMany({
      where: {
        id: { in: customerIds },
        businessId: userBusiness.id,
        smsConsent: true,
      },
    });

    if (customers.length === 0) {
      return NextResponse.json({ error: 'Brak klientów z zgodą na SMS' }, { status: 400 });
    }

    const smsProvider = SmsProviderFactory.create(
      userBusiness.smsProvider as any,
      userBusiness.smsConfig as any
    );

    let sent = 0;
    let failed = 0;
    const errors: { phone: string; error: string }[] = [];

    for (const customer of customers) {
      const personalizedMessage = message
        .replace(/{name}/g, `${customer.name} ${customer.surname}`)
        .replace(/{staff}/g, userBusiness.name);

      const result = await sendSafely(smsProvider, customer.phone, personalizedMessage);

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push({ phone: customer.phone, error: result.error || 'Nieznany błąd' });
      }
    }

    return NextResponse.json({ sent, failed, errors });
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    return NextResponse.json({ error: 'Nie udało się wysłać SMS' }, { status: 500 });
  }
}
