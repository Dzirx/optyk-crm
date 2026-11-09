import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { trialEnd } from '@/lib/access';
import { IS_DESKTOP } from '@/lib/edition';

export async function POST(req: NextRequest) {
  // Wersja Windows: jedno konto tworzone przy instalacji, bez rejestracji.
  if (IS_DESKTOP) {
    return NextResponse.json({ error: 'Rejestracja jest niedostępna' }, { status: 404 });
  }
  try {
    const body = await req.json();
    const { name, password } = body;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!name || !email || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Brakujące wymagane pola' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Hasło musi mieć co najmniej 8 znaków' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 });
    }

    const existingUser = await db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Ten adres e-mail jest już zarejestrowany' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'user',
        accessUntil: trialEnd(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Wystąpił błąd serwera' },
      { status: 500 }
    );
  }
}
