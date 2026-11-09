import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAdmin } from '@/lib/api/handler';
import { updateUserAccessSchema } from '@/lib/api/schemas/admin';

const DAY_MS = 24 * 60 * 60 * 1000;

// PATCH /api/admin/users/[id] — zmiana dostępu konta
// { action: 'extend', days } | { action: 'unlimited' } | { action: 'block' }
// Wersja Windows: { action: 'unpinDevices' } | { action: 'deviceLimit', limit }
export const PATCH = withAdmin(
  async ({ params, body }) => {
    const userId = params.id;

    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, accessUntil: true } });
    if (!user || user.role === 'admin') return NextResponse.json({ error: 'Nie znaleziono konta' }, { status: 404 });

    // Wersja Windows: odpięcie komputerów (np. nowy komputer w salonie) i limit komputerów.
    // Uwaga: program na odpiętym komputerze działa dalej — licencja jest sprawdzana offline.
    if (body.action === 'unpinDevices') {
      await db.licenseDevice.deleteMany({ where: { userId } });
      return NextResponse.json({ windowsDevices: [] });
    }
    if (body.action === 'deviceLimit') {
      const updated = await db.user.update({
        where: { id: userId },
        data: { windowsDeviceLimit: body.limit },
        select: { windowsDeviceLimit: true },
      });
      return NextResponse.json(updated);
    }

    const now = new Date();
    let accessUntil: Date | null;
    if (body.action === 'extend') {
      // Przedłużenie liczy się od końca obecnego okresu, jeśli jeszcze trwa.
      const base = user.accessUntil && user.accessUntil > now ? user.accessUntil : now;
      accessUntil = new Date(base.getTime() + body.days * DAY_MS);
    } else if (body.action === 'unlimited') {
      accessUntil = null;
    } else {
      accessUntil = now; // block
    }

    const updated = await db.user.update({ where: { id: userId }, data: { accessUntil }, select: { accessUntil: true } });
    return NextResponse.json({ accessUntil: updated.accessUntil });
  },
  { body: updateUserAccessSchema, notFound: 'Nie znaleziono konta', error: 'Wystąpił błąd serwera' },
);
