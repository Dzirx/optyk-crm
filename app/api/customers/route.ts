import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { returnOrdersToStock } from '@/lib/work-orders/inventory';

// GET - List all customers for business
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    // Get user's business
    const userBusiness = await getUserBusiness(session.user.id);

    if (!userBusiness) {
      return NextResponse.json({ error: 'Nie znaleziono firmy. Najpierw utwórz firmę.' }, { status: 404 });
    }

    // Get all customers for business
    const allCustomers = await db.customer.findMany({
      where: { businessId: userBusiness.id },
      include: {
        visits: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ customers: allCustomers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Nie udało się pobrać klientów' }, { status: 500 });
  }
}

// POST - Create new customer
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
    const { name, surname, phone, email, smsConsent } = body;

    // Validation
    if (!name || !surname || !phone) {
      return NextResponse.json({ error: 'Imię, nazwisko i telefon są wymagane' }, { status: 400 });
    }

    if (name.length < 2) {
      return NextResponse.json({ error: 'Imię musi mieć co najmniej 2 znaki' }, { status: 400 });
    }

    if (surname.length < 2) {
      return NextResponse.json({ error: 'Nazwisko musi mieć co najmniej 2 znaki' }, { status: 400 });
    }

    // E.164 phone format validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json({ error: 'Nieprawidłowy numer telefonu. Użyj formatu E.164 (np. +48123456789)' }, { status: 400 });
    }

    // Email validation (optional)
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 });
      }
    }

    // Create customer
    const newCustomer = await db.customer.create({
      data: {
        businessId: userBusiness.id,
        name,
        surname,
        phone,
        email: email || null,
        smsConsent: smsConsent !== undefined ? smsConsent : true,
      },
    });

    return NextResponse.json({ customer: newCustomer }, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Nie udało się utworzyć klienta' }, { status: 500 });
  }
}

// PATCH - Update customer
export async function PATCH(req: NextRequest) {
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
    const { id, name, surname, phone, email, smsConsent } = body;

    if (!id) {
      return NextResponse.json({ error: 'Wymagane ID klienta' }, { status: 400 });
    }

    // Verify customer belongs to this business
    const customer = await db.customer.findFirst({
      where: {
        id: id,
        businessId: userBusiness.id,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }

    // Validation
    if (name && name.length < 2) {
      return NextResponse.json({ error: 'Imię musi mieć co najmniej 2 znaki' }, { status: 400 });
    }

    if (surname && surname.length < 2) {
      return NextResponse.json({ error: 'Nazwisko musi mieć co najmniej 2 znaki' }, { status: 400 });
    }

    if (phone) {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone)) {
        return NextResponse.json({ error: 'Nieprawidłowy numer telefonu' }, { status: 400 });
      }

    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 });
      }
    }

    // Update customer
    const updatedCustomer = await db.customer.update({
      where: { id: id },
      data: {
        ...(name && { name }),
        ...(surname && { surname }),
        ...(phone && { phone }),
        ...(email !== undefined && { email }),
        ...(smsConsent !== undefined && { smsConsent }),
      },
    });

    return NextResponse.json({ customer: updatedCustomer });
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Nie udało się zaktualizować klienta' }, { status: 500 });
  }
}

// DELETE - Delete customer
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const userBusiness = await getUserBusiness(session.user.id);

    if (!userBusiness) {
      return NextResponse.json({ error: 'Nie znaleziono firmy' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Wymagane ID klienta' }, { status: 400 });
    }

    // Verify customer belongs to this business
    const customer = await db.customer.findFirst({
      where: {
        id: id,
        businessId: userBusiness.id,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }

    // Usunięcie klienta kasuje kaskadowo jego wizyty i zlecenia. Towar z pozycji
    // zleceń wraca najpierw na stan magazynu — w tej samej transakcji.
    await db.$transaction(async (tx) => {
      await returnOrdersToStock(tx, { workOrder: { customerId: id, businessId: userBusiness.id } });
      await tx.customer.delete({ where: { id } });
    });

    return NextResponse.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Nie udało się usunąć klienta' }, { status: 500 });
  }
}
