'use client';

import { useEffect, useState } from 'react';
import { Pagination } from '@/components/pagination';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { formatDateTimePadded } from '@/lib/time';
import { isCampaignActive, messagePreview } from '@/lib/sms/campaign-helpers';
import { POLL_MS, type Campaign } from './types';

const PAGE_SIZE = 20;

export function statusPillClass(status: string): string {
  if (status === 'done') return 'bg-green-100 text-green-800';
  if (status === 'cancelled') return 'bg-gray-100 text-gray-700';
  return 'bg-blue-100 text-blue-800';
}

/** Plakietka statusu; w toku pokazuje postęp „Wysyłanie… x/y”. */
export function StatusPill({ c }: { c: Pick<Campaign, 'status' | 'sent' | 'failed' | 'total'> }) {
  const { t } = useLanguage();
  const label = isCampaignActive(c.status)
    ? `${t('campaignSendingProgress')} ${c.sent + c.failed}/${c.total}`
    : t(`campaignStatus_${c.status}` as TranslationKey);
  return <span data-testid="campaign-status" className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusPillClass(c.status)}`}>{label}</span>;
}

const GRID = 'lg:grid lg:grid-cols-[8.5rem_minmax(0,1fr)_8rem_4.5rem_6rem] lg:items-center lg:gap-3';

/** Historia wysyłek: tabela (20 na stronę), odświeża się, dopóki któraś wysyłka trwa. */
export function CampaignHistory({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ campaigns: Campaign[]; total: number } | null>(null);
  const [tick, setTick] = useState(0);
  const hasActive = !!data?.campaigns.some((c) => isCampaignActive(c.status));

  useEffect(() => {
    let stop = false;
    fetch(`/api/sms/campaigns?page=${page}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (stop || !d) return;
        const last = Math.max(1, Math.ceil(d.total / PAGE_SIZE));
        if (page > last) setPage(last);
        else setData({ campaigns: d.campaigns, total: d.total });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [page, tick]);

  useEffect(() => {
    if (!hasActive) return;
    const timer = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [hasActive, tick, data]);

  return (
    <section data-testid="campaign-history" className="bg-white rounded-lg shadow-sm p-4 sm:p-5">
      {!data ? (
        <p className="text-sm text-gray-400 py-4">{t('loading')}</p>
      ) : data.campaigns.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">{t('campaignHistoryEmpty')}</p>
      ) : (
        <div>
          <div className={`hidden ${GRID} px-2 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100`}>
            <span>{t('campaignColDate')}</span>
            <span>{t('campaignColMessage')}</span>
            <span>{t('campaignColStatus')}</span>
            <span>{t('campaignColSent')}</span>
            <span>{t('campaignColFailed')}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {data.campaigns.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid="campaign-row"
                  onClick={() => onOpen(c.id)}
                  className={`w-full text-left py-3 px-2 hover:bg-gray-50 rounded flex flex-col gap-1 ${GRID}`}
                >
                  <span className="text-xs lg:text-sm text-gray-500">{formatDateTimePadded(c.createdAt)}</span>
                  <span className="text-sm text-gray-900 break-words min-w-0">{messagePreview(c.message, 60)}</span>
                  <span><StatusPill c={c} /></span>
                  <span className="text-sm text-green-700"><span className="lg:hidden text-gray-500">{t('campaignColSent')}: </span>{c.sent}</span>
                  <span className={`text-sm ${c.failed > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}><span className="lg:hidden text-gray-500">{t('campaignColFailed')}: </span>{c.failed}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </section>
  );
}
