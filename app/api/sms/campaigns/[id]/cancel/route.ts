import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness } from '@/lib/api/handler';
import { cancelCampaign, serializeCampaign } from '@/lib/sms/campaigns';

const NOT_FOUND = 'Nie znaleziono wysyłki';

// POST /api/sms/campaigns/[id]/cancel — anuluje wysyłkę w toku (queued/sending); inaczej 409.
export const POST = withBusiness(
  async ({ business, params }) => {
    const exists = await db.smsCampaign.findFirst({ where: { id: params.id, businessId: business.id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    if (!(await cancelCampaign(business.id, params.id))) {
      return NextResponse.json({ error: 'Wysyłka jest już zakończona lub anulowana' }, { status: 409 });
    }
    const campaign = await db.smsCampaign.findFirstOrThrow({ where: { id: params.id, businessId: business.id } });
    return NextResponse.json({ campaign: serializeCampaign(campaign) });
  },
  { error: 'Nie udało się anulować wysyłki', notFound: NOT_FOUND },
);
