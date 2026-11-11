'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDateTimePadded } from '@/lib/time';

interface ReviewRequestModalProps {
  customerId: string;
  customerName: string;
  /** Endpoint wysyłki (POST), np. /api/visits/ID/send-sms albo /api/work-orders/ID/send-sms. */
  sendUrl: string;
  /** Treść żądania (wizyty: { smsType: 'review' }). */
  sendBody?: unknown;
  onClose: () => void;
  /** Wywoływane po udanej wysyłce, zanim modal się zamknie (odświeżenie listy). */
  onSent: () => void | Promise<void>;
  /** Wysyłka nie powiodła się — rodzic odświeża wiersz, żeby pokazać powód. */
  onFailed?: () => void | Promise<void>;
}

type Last = { state: 'loading' } | { state: 'error' } | { state: 'ok'; lastSentAt: string | null; source: string | null };

/** Okno potwierdzenia wysyłki prośby o opinię: pokazuje ostatnią prośbę wysłaną temu klientowi. */
export function ReviewRequestModal({ customerId, customerName, sendUrl, sendBody, onClose, onSent, onFailed }: ReviewRequestModalProps) {
  const { t } = useLanguage();
  const [last, setLast] = useState<Last>({ state: 'loading' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/customers/${customerId}/last-review-request`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (alive) setLast({ state: 'ok', lastSentAt: data.lastSentAt, source: data.source });
      })
      .catch(() => alive && setLast({ state: 'error' }));
    return () => {
      alive = false;
    };
  }, [customerId]);

  // Fokus startowy na „Anuluj” (bezpieczniejszy wybór); po zamknięciu wraca do przycisku, który otworzył okno.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const close = () => {
    if (!sendingRef.current) onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      first.focus();
    }
  };

  const send = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendBody ?? {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.details || data.error || 'Error');
      }
      await onSent();
      sendingRef.current = false;
      onClose();
    } catch (err) {
      sendingRef.current = false;
      Promise.resolve(onFailed?.()).catch(() => {});
      setError(err instanceof Error ? err.message : 'Error');
      setSending(false);
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  };

  let lastText: string;
  if (last.state === 'loading') lastText = t('reviewModalChecking');
  else if (last.state === 'error') lastText = t('reviewModalCheckFailed');
  else if (!last.lastSentAt) lastText = t('reviewModalNever');
  else lastText = `${t('reviewModalLast')}: ${formatDateTimePadded(last.lastSentAt)}${last.source ? ` (${last.source})` : ''}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onMouseDown={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        aria-describedby="review-modal-last"
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5 text-gray-900"
      >
        <h2 id="review-modal-title" className="text-lg font-semibold break-words">
          {t('reviewModalTitle')} — {customerName}
        </h2>
        <p id="review-modal-last" data-testid="review-modal-last" className="mt-3 text-sm text-gray-700">
          {lastText}
        </p>
        {error && (
          <p role="alert" data-testid="review-modal-error" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={sending}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sending ? t('sending') : t('reviewModalSend')}
          </button>
        </div>
      </div>
    </div>
  );
}
