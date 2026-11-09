// Dostęp do panelu: okres próbny po rejestracji, potem przedłużenie przez admina.

import type { Prisma } from '@prisma/client';
import { IS_DESKTOP } from '@/lib/edition';

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS) > 0 ? Number(process.env.TRIAL_DAYS) : 5;

/** Dane kontaktowe pokazywane po zakończeniu okresu próbnego (z .env). */
export const CONTACT = {
  email: process.env.CONTACT_EMAIL || '',
  phone: process.env.CONTACT_PHONE || '',
};

export function trialEnd(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

type AccessUser = { role: string; accessUntil: Date | null };

/** Admin i konta bez daty końca mają dostęp bez limitu. */
export function hasAccess(user: AccessUser, now = new Date()): boolean {
  if (IS_DESKTOP) return true; // Wersja Windows nie ma okresu próbnego.
  return user.role === 'admin' || user.accessUntil === null || user.accessUntil > now;
}

/** Ile pełnych lub rozpoczętych dni zostało (null = bez limitu). */
export function daysLeft(user: AccessUser, now = new Date()): number | null {
  if (IS_DESKTOP || user.role === 'admin' || user.accessUntil === null) return null;
  return Math.max(0, Math.ceil((user.accessUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Warunek Prisma: właściciel salonu ma aktywny dostęp (np. dla crona SMS). */
export function activeUserWhere(now = new Date()): Prisma.UserWhereInput {
  if (IS_DESKTOP) return {};
  return { OR: [{ role: 'admin' }, { accessUntil: null }, { accessUntil: { gt: now } }] };
}
