'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { endOfZonedDay, todayIso } from '@/lib/time';
import { ModalShell } from './modal-shell';

/** Dzisiaj: bez daty (serwer użyje „teraz”). Dzień z przeszłości: południe tego dnia (koniec dnia minus 12 h) w strefie salonu. */
export function deliveryOccurredAt(date: string, today: string): string | undefined {
  if (!date || date === today) return undefined;
  return new Date(endOfZonedDay(date).getTime() - 12 * 3600_000).toISOString();
}

export function DeliveryModal({ item, onClose, onDone }: { item: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const today = todayIso();
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Najwcześniejszy dzień dostawy (serwer: początek historii, założenie towaru, ostatnia zakończona inwentaryzacja).
  const [minDate, setMinDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/inventory/${item.id}/movements?page=1&pageSize=1`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.deliveryMinAt === 'string') setMinDate(todayIso(new Date(data.deliveryMinAt)));
      } catch {
        /* bez minimum formularz działa, a serwer i tak sprawdza datę */
      }
    })();
    return () => { cancelled = true; };
  }, [item.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty.trim());
    if (!/^\d+$/.test(qty.trim()) || n < 1 || n > 1_000_000) { setError(t('deliveryQtyInvalid')); return; }
    setSubmitting(true);
    setError('');
    try {
      const body: { quantity: number; occurredAt?: string; note?: string } = { quantity: n };
      const at = deliveryOccurredAt(date, today);
      if (at) body.occurredAt = at;
      if (note.trim()) body.note = note.trim();
      const res = await fetch(`/api/inventory/${item.id}/deliveries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || t('deliveryError'));
        return;
      }
      onDone();
    } catch {
      setError(t('deliveryError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`${t('deliveryTitle')} — ${item.name}`}>
      {error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="delivery-qty" className="block text-sm font-medium text-gray-700 mb-1">{t('quantity')} *</label>
          <input id="delivery-qty" type="text" inputMode="numeric" autoFocus value={qty} onChange={e => setQty(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" placeholder="1" />
        </div>
        <div>
          <label htmlFor="delivery-date" className="block text-sm font-medium text-gray-700 mb-1">{t('deliveryDate')}</label>
          <input id="delivery-date" type="date" value={date} min={minDate} max={today} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        </div>
        <div>
          <label htmlFor="delivery-note" className="block text-sm font-medium text-gray-700 mb-1">{t('deliveryNote')}</label>
          <input id="delivery-note" type="text" maxLength={500} value={note} onChange={e => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" placeholder={t('deliveryNotePlaceholder')} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">{t('cancel')}</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {submitting ? t('saving') : t('deliverySubmit')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
