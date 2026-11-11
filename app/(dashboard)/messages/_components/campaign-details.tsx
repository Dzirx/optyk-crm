'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Pagination } from '@/components/pagination';
import { formatPhone } from '@/lib/phone';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { formatDateTimePadded } from '@/lib/time';
import { recipientsLabel } from '@/lib/plural';
import { isCampaignActive, newIdempotencyKey } from '@/lib/sms/campaign-helpers';
import { StatusPill } from './campaign-history';
import { formatShortDateTime } from './format';
import { POLL_MS, type Campaign, type CampaignRecipient } from './types';

const PAGE_SIZE = 50;
type Filter = 'all' | 'sent' | 'failed';
type Dialog =
  | { kind: 'cancel' }
  | { kind: 'retry'; ids: string[] | null; count: number | null; skipped: number };

const ROW = 'sm:grid sm:grid-cols-[1.5rem_minmax(0,1fr)_8rem_9.5rem_minmax(0,1.2fr)] sm:items-start sm:gap-3';

/** Szczegóły wysyłki: pełna treść, liczniki, odbiorcy (50 na stronę), filtry, ponowienie i anulowanie. */
export function CampaignDetails({ campaignId, onOpen }: { campaignId: string; onOpen: (id: string) => void }) {
  const { t, language } = useLanguage();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const retryKey = useRef<string | null>(null);
  const active = campaign ? isCampaignActive(campaign.status) : false;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (filter !== 'all') params.set('status', filter);
    try {
      const res = await fetch(`/api/sms/campaigns/${campaignId}?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCampaign(data.campaign);
      setRecipients(data.recipients);
      setTotal(data.total);
      setError('');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('campaignLoadError'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t zmienia się tylko z językiem
  }, [campaignId, page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDialog(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function postRetry(ids: string[] | null, dryRun: boolean) {
    retryKey.current ??= newIdempotencyKey();
    const res = await fetch(`/api/sms/campaigns/${campaignId}/retry-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: retryKey.current, ...(ids ? { recipientIds: ids } : {}), ...(dryRun ? { dryRun: true } : {}) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  }

  // Okno potwierdzenia: najpierw podgląd (ilu dostanie SMS, ilu pominięto), potem tworzenie nowej wysyłki.
  async function openRetry(ids: string[] | null) {
    retryKey.current = null;
    setError('');
    setDialog({ kind: 'retry', ids, count: null, skipped: 0 });
    try {
      const preview = await postRetry(ids, true);
      setDialog({ kind: 'retry', ids, count: preview.count, skipped: preview.skipped });
    } catch (e) {
      setDialog(null);
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function confirmRetry() {
    if (dialog?.kind !== 'retry') return;
    setBusy(true);
    try {
      const data = await postRetry(dialog.ids, false);
      retryKey.current = null;
      setDialog(null);
      setSelected(new Set());
      onOpen(data.campaign.id);
    } catch (e) {
      setDialog(null);
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sms/campaigns/${campaignId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  const reasonText = (r: CampaignRecipient) => {
    const key = `notificationsReason_${r.reasonCode}` as TranslationKey;
    const translated = t(key);
    return translated === key ? r.reason : translated;
  };
  const statusText = (r: CampaignRecipient) =>
    r.status === 'sent' && r.sentAt
      ? `${t('campaignRecipient_sent')} ${formatShortDateTime(r.sentAt)}`
      : t(`campaignRecipient_${r.status}` as TranslationKey);

  const chips: Array<{ value: Filter; label: string; count: number }> = campaign
    ? [
        { value: 'all', label: t('campaignFilterAll'), count: campaign.total },
        { value: 'sent', label: t('campaignFilterSent'), count: campaign.sent },
        { value: 'failed', label: t('campaignFilterFailed'), count: campaign.failed },
      ]
    : [];

  return (
    <div data-testid="campaign-details" className="space-y-4">
      <div>
        <BackLink href="/messages?tab=history">{t('campaignBackToHistory')}</BackLink>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {campaign && (
        <>
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill c={campaign} />
              <span className="text-gray-500">{formatDateTimePadded(campaign.createdAt)}</span>
              <span data-testid="campaign-counts" className="text-gray-700">
                {t('campaignSentWord')} {campaign.sent} {t('campaignOf')} {campaign.total}
                {campaign.failed > 0 && <span className="text-red-600">, {t('campaignNotSent')} {campaign.failed}</span>}
              </span>
            </div>
            {active && (
              <div className="h-2 bg-blue-100 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={campaign.total ? Math.round(((campaign.sent + campaign.failed) / campaign.total) * 100) : 0}>
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${campaign.total ? ((campaign.sent + campaign.failed) / campaign.total) * 100 : 0}%` }} />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('campaignMessage')}</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 rounded p-2">{campaign.message}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {campaign.failed > 0 && (
                <>
                  <button type="button" data-testid="campaign-retry-selected" disabled={busy || selected.size === 0} onClick={() => openRetry([...selected])}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {t('campaignRetrySelected')} ({selected.size})
                  </button>
                  <button type="button" data-testid="campaign-retry-all" disabled={busy} onClick={() => openRetry(null)}
                    className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                    {t('campaignRetryAll')} ({campaign.failed})
                  </button>
                </>
              )}
              {active && (
                <button type="button" data-testid="campaign-cancel" disabled={busy} onClick={() => setDialog({ kind: 'cancel' })}
                  className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 sm:ml-auto">
                  {t('campaignCancel')}
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-5">
            <div className="flex flex-wrap gap-2 mb-3">
              {chips.map((c) => (
                <button key={c.value} type="button" data-testid={`campaign-filter-${c.value}`} aria-pressed={filter === c.value}
                  onClick={() => { setFilter(c.value); setPage(1); }}
                  className={`px-3 py-1 rounded-full text-sm border ${filter === c.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  {c.label} ({c.count})
                </button>
              ))}
            </div>

            <div className={`hidden ${ROW} px-2 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100`}>
              <span />
              <span>{t('campaignRecipientName')}</span>
              <span>{t('campaignRecipientPhone')}</span>
              <span>{t('campaignRecipientStatus')}</span>
              <span>{t('campaignRecipientReason')}</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {recipients.map((r) => (
                <li key={r.id} data-testid="campaign-recipient" data-status={r.status} className={`px-2 py-2 text-sm flex flex-col gap-0.5 ${ROW}`}>
                  <span className="h-5">
                    {r.status === 'failed' && (
                      <input type="checkbox" aria-label={t('campaignSelectRow')} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="rounded" />
                    )}
                  </span>
                  <span className="min-w-0 font-medium text-gray-900 break-words">{r.customerName}</span>
                  <span className="text-gray-500">{formatPhone(r.phone)}</span>
                  <span className={r.status === 'failed' ? 'text-red-700 font-medium' : r.status === 'sent' ? 'text-green-700' : 'text-gray-500'}>
                    {statusText(r)}
                  </span>
                  <span className="min-w-0 text-xs text-red-700 break-words" data-testid="campaign-recipient-reason">
                    {r.status === 'failed' && r.reason && (
                      <>
                        {reasonText(r)}
                        {r.isConfig && (
                          <>
                            {' '}
                            <Link href="/settings" className="text-blue-600 underline whitespace-nowrap">{t('smsFailureOpenSettings')}</Link>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
          </div>
        </>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div role="alertdialog" aria-modal="true" data-testid="campaign-confirm" className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
            {dialog.kind === 'cancel' ? (
              <p className="text-sm text-gray-900">{t('campaignCancelConfirm')}</p>
            ) : dialog.count === null ? (
              <p className="text-sm text-gray-500">…</p>
            ) : (
              <div className="space-y-2 text-sm text-gray-900">
                <p data-testid="campaign-confirm-text">
                  {dialog.count > 0 ? `${t('campaignRetryConfirm')} ${recipientsLabel(dialog.count, language)}?` : t('campaignNothingToSend')}
                </p>
                {dialog.skipped > 0 && (
                  <p data-testid="campaign-confirm-skipped" className="text-orange-700">
                    {t('campaignSkippedPrefix')} {dialog.skipped} — {t('campaignSkippedSuffix')}.
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                {dialog.kind === 'cancel' ? t('campaignKeep') : t('campaignClose')}
              </button>
              {(dialog.kind === 'cancel' || (dialog.count ?? 0) > 0) && (
                <button type="button" data-testid="campaign-confirm-yes" disabled={busy} onClick={dialog.kind === 'cancel' ? confirmCancel : confirmRetry}
                  className={`px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 ${dialog.kind === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {dialog.kind === 'cancel' ? t('campaignCancelYes') : t('campaignRetryConfirmYes')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
