import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withBusiness } from '@/lib/api/handler';
import { acknowledgeSmsFailures } from '@/lib/notifications/sms-failures';

const readSchema = z.object({ ids: z.array(z.string().max(64)).max(100).optional() });

// POST /api/notifications/read  { ids?: string[] } — brak ids = wszystkie.
export const POST = withBusiness(
  async ({ business, body }) => {
    const updated = await acknowledgeSmsFailures(business.id, body.ids);
    return NextResponse.json({ updated });
  },
  { body: readSchema, error: 'Nie udało się oznaczyć powiadomień' },
);
