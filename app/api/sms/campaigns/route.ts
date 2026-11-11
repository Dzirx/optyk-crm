import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { campaignListQuerySchema, createCampaignSchema } from '@/lib/api/schemas/campaigns';
import { createCampaign, kickCampaign, serializeCampaign } from '@/lib/sms/campaigns';

const CAMPAIGNS_PAGE_SIZE = 20;

// GET /api/sms/campaigns?page — historia wysyłek salonu, najnowsze pierwsze (20 na stronę).
export const GET = withBusiness(
  async ({ req, business }) => {
    const parsed = campaignListQuerySchema.safeParse(queryObject(req.nextUrl.searchParams, ['page']));
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const page = parsed.data.page ?? 1;
    const where = { businessId: business.id };
    const [total, campaigns] = await Promise.all([
      db.smsCampaign.count({ where }),
      db.smsCampaign.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * CAMPAIGNS_PAGE_SIZE,
        take: CAMPAIGNS_PAGE_SIZE,
      }),
    ]);
    return NextResponse.json({ campaigns: campaigns.map(serializeCampaign), total, page, pageSize: CAMPAIGNS_PAGE_SIZE });
  },
  { error: 'Nie udało się pobrać historii wysyłek' },
);

// POST /api/sms/campaigns { message, customerIds, idempotencyKey } — tworzy kampanię i zwraca ją od razu (201).
// Ten sam klucz idempotencji zwraca istniejącą kampanię (200). Wysyłka rusza w tle.
export const POST = withBusiness(
  async ({ business, body }) => {
    const session = await auth();
    const { campaign, created } = await createCampaign(business, { ...body, userId: session?.user?.id ?? null });
    if (created) kickCampaign(campaign.id);
    return NextResponse.json({ campaign: serializeCampaign(campaign) }, { status: created ? 201 : 200 });
  },
  { body: createCampaignSchema, error: 'Nie udało się utworzyć wysyłki' },
);
