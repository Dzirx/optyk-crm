'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { formatDatePadded, formatDateTimePl } from '@/lib/time';
import { ReviewRequestModal } from '@/components/review-request-modal';

interface Item {
  id: string;
  kind: 'sms_failed' | 'sms_gateway' | 'sms_campaign';
  createdAt: string;
  customerName?: string;
  phone?: string;
  smsType?: 'reminder' | 'review';
  reason: string;
  reasonCode: string;
  target?: 'visit' | 'work_order';
  customerId?: string;
  campaignId?: string;
  campaignTotal?: number;
  visitId?: string;
  visitDate?: string;
  visitDay?: string;
  workOrderId?: string;
  orderNumber?: string;
  read: boolean;
  count?: number;
}

const POLL_MS = 60_000;

export function NotificationBell() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      /* brak sieci — spróbujemy przy następnym odświeżeniu */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
    load();
  };

  const [busy, setBusy] = useState<string | null>(null);

  // Otwarcie wysyłki z dzwonka oznacza jej wpis jako przeczytany.
  const openCampaign = (item: Item) => {
    setOpen(false);
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [item.id] }),
    }).then(load, () => {});
  };

  // Przypomnienie (tylko wizyty) wysyłamy od razu; prośba o opinię zawsze przez okno potwierdzenia.
  const retryReminder = async (item: Item) => {
    setBusy(item.id);
    setErrors((e) => ({ ...e, [item.id]: '' }));
    try {
      const res = await fetch(`/api/visits/${item.visitId}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsType: item.smsType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors((e) => ({ ...e, [item.id]: data.details || data.error || 'Error' }));
      }
    } catch {
      setErrors((e) => ({ ...e, [item.id]: 'Error' }));
    } finally {
      setBusy(null);
      load();
    }
  };

  const reasonText = (item: Item) => {
    const key = `notificationsReason_${item.reasonCode}` as TranslationKey;
    const translated = t(key);
    return translated === key ? item.reason : translated;
  };

  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `${t('notifications')} (${unread})` : t('notifications')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative p-2 rounded-full text-gray-600 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span data-testid="bell-badge" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-[18px] text-center">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notifications')}
          className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200 z-50"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b sticky top-0 bg-white">
            <h2 className="font-semibold text-gray-900">{t('notifications')}</h2>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-sm text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                {t('notificationsMarkAllRead')}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">{t('notificationsEmpty')}</p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className={`px-4 py-3 text-sm ${item.read ? 'opacity-60' : ''}`}>
                  {item.kind === 'sms_gateway' ? (
                    <>
                      <p className={item.read ? 'text-gray-800' : 'font-bold text-gray-900'}>{t('notificationsGateway')}</p>
                      <p className="text-gray-600 mt-0.5">{reasonText(item)}</p>
                      <p className="text-gray-600">{t('notificationsAffected')}{item.count}</p>
                      <Link href="/settings" onClick={() => setOpen(false)} className="inline-block mt-2 text-blue-600 hover:underline">
                        {t('notificationsOpenSettings')}
                      </Link>
                    </>
                  ) : item.kind === 'sms_campaign' ? (
                    <>
                      <p data-testid="bell-campaign" className={item.read ? 'text-gray-800' : 'font-bold text-gray-900'}>
                        {t('notificationsCampaign')} {formatDatePadded(item.createdAt)}: {t('campaignNotSent')} {item.count} {t('campaignOf')} {item.campaignTotal}
                      </p>
                      <Link href={`/messages?tab=history&campaign=${item.campaignId}`} onClick={() => openCampaign(item)} className="inline-block mt-2 text-blue-600 hover:underline">
                        {t('notificationsCampaignShow')}
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className={item.read ? 'text-gray-800' : 'font-bold text-gray-900'}>
                        {t('notificationsSmsFailed')}: {item.customerName}
                      </p>
                      <p className="text-gray-600 mt-0.5">
                        {item.smsType === 'reminder' ? t('notificationsSmsReminder') : t('notificationsSmsReview')}
                        {item.phone ? ` · ${item.phone}` : ''} · {item.target === 'work_order' ? item.orderNumber : item.visitDate ? formatDateTimePl(item.visitDate) : ''}
                      </p>
                      <p className="text-red-700 mt-0.5">{reasonText(item)}</p>
                      {errors[item.id] && <p role="alert" className="text-red-700 mt-1">{errors[item.id]}</p>}
                      <div className="flex gap-3 mt-2">
                        <button
                          type="button"
                          onClick={() => (item.smsType === 'review' ? setConfirmItem(item) : retryReminder(item))}
                          disabled={busy === item.id}
                          className="text-blue-600 hover:underline disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                        >
                          {busy === item.id ? t('notificationsSending') : t('notificationsRetry')}
                        </button>
                        {item.target === 'work_order' ? (
                          <Link href={`/work-orders?q=${encodeURIComponent(item.orderNumber ?? '')}`} onClick={() => setOpen(false)} className="text-blue-600 hover:underline">
                            {t('notificationsShowOrder')}
                          </Link>
                        ) : (
                          <Link href={`/visits?day=${item.visitDay}`} onClick={() => setOpen(false)} className="text-blue-600 hover:underline">
                            {t('notificationsShowVisit')}
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {confirmItem && (
        <ReviewRequestModal
          customerId={confirmItem.customerId ?? ''}
          customerName={confirmItem.customerName ?? ''}
          sendUrl={confirmItem.target === 'work_order' ? `/api/work-orders/${confirmItem.workOrderId}/send-sms` : `/api/visits/${confirmItem.visitId}/send-sms`}
          sendBody={confirmItem.target === 'work_order' ? undefined : { smsType: 'review' }}
          onClose={() => { setConfirmItem(null); load(); }}
          onSent={load}
        />
      )}
    </div>
  );
}
