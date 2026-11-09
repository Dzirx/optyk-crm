import { db } from '@/lib/db';
import { hasAccess } from '@/lib/access';

/**
 * Salon zalogowanego użytkownika. Po końcu okresu próbnego zwraca null,
 * więc API salonu przestaje działać (panel pokazuje wtedy komunikat o kontakcie).
 */
export async function getUserBusiness(userId: string) {
  const business = await db.business.findFirst({ where: { userId }, include: { user: { select: { role: true, accessUntil: true } } } });
  if (!business || !hasAccess(business.user)) return null;
  const { user: _user, ...rest } = business;
  return rest;
}

/** Czy użytkownik ma aktywny dostęp (admin, bez limitu albo przed końcem okresu). */
export async function userHasAccess(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, accessUntil: true } });
  return !!user && hasAccess(user);
}
