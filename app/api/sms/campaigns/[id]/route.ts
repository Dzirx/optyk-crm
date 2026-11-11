import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withBusiness, zodMessage } from '@/lib/api/handler';
import { queryObject } from '@/lib/api/schemas/common';
import { campaignDetailQuerySchema } from '@/lib/api/schemas/campaigns';
import { serializeCampaign } from '@/lib/sms/campaigns';
import { classifySmsFailure } from '@/lib/sms/failure-reason';

const NOT_FOUND = 'Nie znaleziono wysyłki';
const RECIPIENTS_PAGE_SIZE = 50;

// GET /api/sms/campaigns/[id]?page&status=failed — kampania + odbiorcy (50 na stronę).
export const GET = withBusiness(
  async ({ req, business, params }) => {
    const parsed = campaignDetailQuerySchema.safeParse(queryObject(req.nextUrl.searchParams, ['page', 'status']));
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const page = parsed.data.page ?? 1;

    const campaign = await db.smsCampaign.findFirst({ where: { id: params.id, businessId: business.id } });
    if (!campaign) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const where = { campaignId: campaign.id, ...(parsed.data.status ? { status: parsed.data.status } : {}) };
    const [total, rows] = await Promise.all([
      db.smsCampaignRecipient.count({ where }),
      db.smsCampaignRecipient.findMany({
        where,
        orderBy: [{ customerName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * RECIPIENTS_PAGE_SIZE,
        take: RECIPIENTS_PAGE_SIZE,
        select: { id: true, customerId: true, customerName: true, phone: true, status: true, sentAt: true, errorMessage: true, reasonCode: true },
      }),
    ]);

    const recipients = rows.map((r) => {
      const failure = r.status === 'failed' ? classifySmsFailure(r.errorMessage) : null;
      return {
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerName,
        phone: r.phone,
        status: r.status,
        sentAt: r.sentAt?.toISOString() ?? null,
        reasonCode: failure ? (r.reasonCode ?? failure.code) : null,
        reason: failure?.reason ?? null,
        isConfig: failure?.gateway ?? false,
      };
    });
    return NextResponse.json({ campaign: serializeCampaign(campaign), recipients, total, page, pageSize: RECIPIENTS_PAGE_SIZE });
  },
  { error: 'Nie udało się pobrać wysyłki', notFound: NOT_FOUND },
);
