import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { clearFailures, isLimited, recordFailure } from '@/lib/api/rate-limit';
import type { UserRole } from '@/lib/types';

// Limit nieudanych logowań: 10 na e-mail z jednego IP i 30 na e-mail z dowolnego IP w ciągu 15 min.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LIMIT_PER_IP_EMAIL = 10;
const LIMIT_PER_EMAIL = 30;

function clientIp(request: Request | undefined): string {
  const forwarded = request?.headers?.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request?.headers?.get('x-real-ip') || 'unknown';
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();
        const keyIp = `login:${clientIp(request)}:${email}`;
        const keyEmail = `login:${email}`;
        if (isLimited(keyIp, LIMIT_PER_IP_EMAIL) || isLimited(keyEmail, LIMIT_PER_EMAIL)) {
          return null;
        }

        // Bez rozróżniania wielkości liter — starsze konta mogą mieć e-mail z wielkimi literami.
        const user = await db.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });

        const passwordMatch = user ? await bcrypt.compare(credentials.password, user.passwordHash) : false;

        if (!user || !passwordMatch) {
          recordFailure(keyIp, LOGIN_WINDOW_MS);
          recordFailure(keyEmail, LOGIN_WINDOW_MS);
          return null;
        }

        clearFailures(keyIp);

        return {
          id: user.id,
          email: user.email,
          name: user.name || '',
          role: user.role as UserRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
