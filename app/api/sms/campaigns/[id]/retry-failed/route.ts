import { NextResponse } from 'next/server';
import { withBusiness } from '@/lib/api/handler';
import { retryCampaignSchema } from '@/lib/api/schemas/campaigns';
import { kickCampaign, previewRetry, retryFailed, serializeCampaign } from '@/lib/sms/campaigns';
import { auth } from '@/lib/auth';

const NOT_FOUND = 'Nie znaleziono wysyłki';

// POST /api/sms/campaigns/[id]/retry-failed { idempotencyKey, recipientIds?, dryRun? } — nowa kampania tylko z nieudanymi
// odbiorcami (wszystkimi albo wskazanymi). `skipped` = pominięci (bez zgody na SMS / usunięci klienci).
export const POST = withBusiness(
  async ({ business, params, body }) => {
    const opts = { recipientIds: body.recipientIds };
    if (body.dryRun) {
      const preview = await previewRetry(business, params.id, opts);
      if (!preview) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
      return NextResponse.json(preview);
    }
    const session = await auth();
    const result = await retryFailed(business, params.id, body.idempotencyKey, session?.user?.id, opts);
    if (!result) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    if (result.created) kickCampaign(result.campaign.id);
    return NextResponse.json({ campaign: serializeCampaign(result.campaign), skipped: result.skipped }, { status: result.created ? 201 : 200 });
  },
  { body: retryCampaignSchema, error: 'Nie udało się ponowić wysyłki', notFound: NOT_FOUND },
);
