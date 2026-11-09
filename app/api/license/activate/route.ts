// Aktywacja wersji Windows. Jedyne miejsce, gdzie program łączy się z chmurą.
//
// Program wysyła e-mail, hasło i SHA-256 numeru sprzętowego komputera. Serwer sprawdza konto,
// limit komputerów i zwraca licencję podpisaną kluczem prywatnym (lib/license.ts).

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { clearFailures, isLimited, recordFailure } from '@/lib/api/rate-limit';
import { licensingConfigured, signLicense } from '@/lib/license';

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;
const HASH_RE = /^[0-9a-f]{64}$/;

function ip(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    if (!licensingConfigured()) {
      return NextResponse.json({ error: 'Aktywacja jest chwilowo niedostępna. Skontaktuj się z nami.' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const machineHash = typeof body.machineHash === 'string' ? body.machineHash.toLowerCase() : '';
    const machineName = typeof body.machineName === 'string' ? body.machineName.slice(0, 255) : null;

    if (!email || !password || !HASH_RE.test(machineHash)) {
      return NextResponse.json({ error: 'Brakujące lub nieprawidłowe dane aktywacji' }, { status: 400 });
    }

    const key = `activate:${ip(req)}:${email}`;
    if (isLimited(key, LIMIT)) {
      return NextResponse.json({ error: 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.' }, { status: 429 });
    }

    const user = await db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      recordFailure(key, WINDOW_MS);
      return NextResponse.json({ error: 'Nieprawidłowy adres e-mail lub hasło' }, { status: 401 });
    }
    clearFailures(key);

    // Licencja jest bezterminowa, więc tylko dla kont opłaconych („Bez limitu” w panelu admina),
    // a nie dla okresu próbnego.
    if (user.role !== 'admin' && user.accessUntil !== null) {
      return NextResponse.json(
        { error: 'Wersja Windows wymaga wykupionej licencji. Skontaktuj się z nami.' },
        { status: 403 },
      );
    }

    const device = await db.$transaction(async (tx) => {
      // Blokada wiersza konta: dwie równoczesne aktywacje nie przekroczą limitu.
      await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const existing = await tx.licenseDevice.findUnique({
        where: { userId_machineHash: { userId: user.id, machineHash } },
      });
      // Ten sam komputer (np. reinstalacja programu) — ponowna licencja bez zużycia limitu.
      if (existing) {
        return tx.licenseDevice.update({ where: { id: existing.id }, data: { machineName: machineName ?? existing.machineName } });
      }
      const count = await tx.licenseDevice.count({ where: { userId: user.id } });
      if (count >= user.windowsDeviceLimit) return null;
      return tx.licenseDevice.create({ data: { userId: user.id, machineHash, machineName } });
    });

    if (!device) {
      return NextResponse.json(
        {
          error:
            'To konto ma już aktywowany program na innym komputerze. ' +
            'Aby przenieść licencję albo dodać kolejny komputer, skontaktuj się z nami.',
        },
        { status: 409 },
      );
    }

    const license = signLicense({
      v: 1,
      lid: device.id,
      sub: user.id,
      email: user.email.toLowerCase(),
      name: user.name,
      machine: machineHash,
      issuedAt: new Date().toISOString(),
    });

    return NextResponse.json({ license, user: { email: user.email.toLowerCase(), name: user.name } });
  } catch (error) {
    console.error('License activation error:', error);
    return NextResponse.json({ error: 'Nie udało się aktywować programu' }, { status: 500 });
  }
}
