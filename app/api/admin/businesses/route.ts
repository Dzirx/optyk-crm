import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAdmin } from '@/lib/api/handler';

// GET /api/admin/businesses — wszystkie konta salonów (także bez założonego salonu)
// Zmiana dostępu konta: PATCH /api/admin/users/[id]
export const GET = withAdmin(
  async () => {
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
  },
  { error: 'Wystąpił błąd serwera' },
);
