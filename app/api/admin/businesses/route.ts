import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const DAY_MS = 24 * 60 * 60 * 1000;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Brak dostępu — wymagane uprawnienia administratora' }, { status: 403 });
  }
  return null;
}

// GET /api/admin/businesses — wszystkie konta salonów (także bez założonego salonu)
export async function GET() {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const users = await db.user.findMany({
      where: { role: { not: 'admin' } },
      include: {
        business: { include: { _count: { select: { customers: true } } } },
        licenseDevices: { select: { machineName: true, activatedAt: true }, orderBy: { activatedAt: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const businesses = users.map((u) => ({
      id: u.business?.id ?? u.id,
      name: u.business?.name ?? null,
      phone: u.business?.phone ?? null,
      googleReviewUrl: u.business?.googleReviewUrl ?? null,
      smsProvider: u.business?.smsProvider ?? null,
      createdAt: u.business?.createdAt ?? u.createdAt,
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      accessUntil: u.accessUntil,
      customerCount: u.business?._count.customers ?? 0,
      windowsDeviceLimit: u.windowsDeviceLimit,
      windowsDevices: u.licenseDevices,
    }));

    return NextResponse.json({ businesses });
  } catch (error) {
    console.error('Error fetching businesses (admin):', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}

// PATCH /api/admin/businesses — zmiana dostępu konta
// { userId, action: 'extend', days } | { userId, action: 'unlimited' } | { userId, action: 'block' }
// Wersja Windows: { userId, action: 'unpinDevices' } | { userId, action: 'deviceLimit', limit }
export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { userId, action, days, limit } = await req.json();
    if (typeof userId !== 'string') return NextResponse.json({ error: 'Wymagane ID użytkownika' }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, accessUntil: true } });
    if (!user || user.role === 'admin') return NextResponse.json({ error: 'Nie znaleziono konta' }, { status: 404 });

    // Wersja Windows: odpięcie komputerów (np. nowy komputer w salonie) i limit komputerów.
    // Uwaga: program na odpiętym komputerze działa dalej — licencja jest sprawdzana offline.
    if (action === 'unpinDevices') {
      await db.licenseDevice.deleteMany({ where: { userId } });
      return NextResponse.json({ windowsDevices: [] });
    }
    if (action === 'deviceLimit') {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 0 || n > 50) return NextResponse.json({ error: 'Nieprawidłowy limit komputerów' }, { status: 400 });
      const updated = await db.user.update({ where: { id: userId }, data: { windowsDeviceLimit: n }, select: { windowsDeviceLimit: true } });
      return NextResponse.json(updated);
    }

    const now = new Date();
    let accessUntil: Date | null;
    if (action === 'extend') {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 3660) return NextResponse.json({ error: 'Nieprawidłowa liczba dni' }, { status: 400 });
      // Przedłużenie liczy się od końca obecnego okresu, jeśli jeszcze trwa.
      const base = user.accessUntil && user.accessUntil > now ? user.accessUntil : now;
      accessUntil = new Date(base.getTime() + n * DAY_MS);
    } else if (action === 'unlimited') {
      accessUntil = null;
    } else if (action === 'block') {
      accessUntil = now;
    } else {
      return NextResponse.json({ error: 'Nieznana operacja' }, { status: 400 });
    }

    const updated = await db.user.update({ where: { id: userId }, data: { accessUntil }, select: { accessUntil: true } });
    return NextResponse.json({ accessUntil: updated.accessUntil });
  } catch (error) {
    console.error('Error updating access (admin):', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera' }, { status: 500 });
  }
}
