'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { isCampaignActive } from '@/lib/sms/campaign-helpers';
import { POLL_MS, type Campaign } from './types';

/** Karta postępu świeżo utworzonej wysyłki: odpytuje serwer co 3 s, dopóki kampania trwa. */
export function CampaignProgress({
  campaignId, onOpen,
}: {
  campaignId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let active = true;
      try {
        const res = await fetch(`/api/sms/campaigns/${campaignId}?page=1&status=failed`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (stop) return;
          setCampaign(data.campaign);
          active = isCampaignActive(data.campaign.status);
        }
      } catch {
        /* brak sieci — spróbujemy ponownie */
      }
      if (!stop && active) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [campaignId]);

  if (!campaign) return null;
  const active = isCampaignActive(campaign.status);
  const done = campaign.sent + campaign.failed;
  const percent = campaign.total > 0 ? Math.round((done / campaign.total) * 100) : 0;
  const tone = active ? 'border-blue-200 bg-blue-50' : campaign.failed > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50';

  return (
    <div data-testid="campaign-progress" className={`p-4 border rounded-lg ${tone}`}>
      {active ? (
        <>
          <p data-testid="campaign-progress-text" className="font-medium text-blue-900">
            {t('campaignSendingProgress')} {done} {t('campaignOf')} {campaign.total}
          </p>
          <div className="mt-2 h-2 bg-blue-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-blue-800">{t('campaignBackgroundNote')}</p>
        </>
      ) : (
        <p data-testid="campaign-progress-text" className={`font-medium ${campaign.failed > 0 ? 'text-red-800' : 'text-green-800'}`}>
          {campaign.status === 'cancelled' && `${t('campaignCancelledNote')}. `}
          {t('campaignSentWord')} {campaign.sent} {t('campaignOf')} {campaign.total}
          {campaign.failed > 0 && `, ${t('campaignNotSent')} ${campaign.failed}`}
        </p>
      )}
      <button type="button" onClick={() => onOpen(campaign.id)} className="mt-2 text-sm text-blue-700 hover:underline">
        {t('campaignOpenDetails')}
      </button>
    </div>
  );
}
