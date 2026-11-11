import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { listSmsFailureNotifications } from '@/lib/notifications/sms-failures';

// GET /api/notifications — nierozwiązane nieudane SMS-y salonu (ostatnie 30 dni), najnowsze pierwsze.
export const GET = withBusiness(
  async ({ business }) => {
    const { items, unreadCount } = await listSmsFailureNotifications(business.id);
    return NextResponse.json({ unreadCount, items });
  },
  { error: 'Nie udało się pobrać powiadomień' },
);
