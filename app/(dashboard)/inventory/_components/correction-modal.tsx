'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { ModalShell } from './modal-shell';

export function CorrectionModal({ item, onClose, onDone }: { item: { id: string; name: string; quantity: number }; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [qty, setQty] = useState(String(item.quantity));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty.trim());
    if (!/^-?\d+$/.test(qty.trim())) { setError(t('stockCountSaveError')); return; }
    if (n === item.quantity) { onClose(); return; }
    if (!reason.trim()) { setError(t('qtyCorrectionReasonRequired')); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: n, note: reason.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || t('stockCountSaveError'));
        return;
      }
      onDone();
    } catch {
      setError(t('stockCountSaveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`${t('qtyCorrectionTitle')} — ${item.name}`}>
      {error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      <p className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm">{t('qtyCorrectionHelp')}</p>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">{t('qtyCorrectionCurrent')}: <span className="font-semibold text-gray-900">{item.quantity}</span></p>
        <div>
          <label htmlFor="corr-qty" className="block text-sm font-medium text-gray-700 mb-1">{t('qtyCorrectionNew')} *</label>
          <input id="corr-qty" type="text" inputMode="numeric" autoFocus value={qty} onChange={e => setQty(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        </div>
        <div>
          <label htmlFor="corr-reason" className="block text-sm font-medium text-gray-700 mb-1">{t('qtyCorrectionReason')} *</label>
          <input id="corr-reason" type="text" maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" placeholder={t('qtyCorrectionReasonPlaceholder')} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">{t('cancel')}</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {submitting ? t('saving') : t('update')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
