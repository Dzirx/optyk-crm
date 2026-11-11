'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { Pagination } from '@/components/pagination';
import { formatDateTimePl } from '@/lib/time';
import { ModalShell } from './modal-shell';

const PAGE_SIZE = 20;

interface Movement {
  type: 'INITIAL' | 'DELIVERY' | 'ORDER_OUT' | 'ORDER_RETURN' | 'CORRECTION' | 'STOCKTAKE' | 'REMOVAL';
  delta: number;
  balanceAfter: number;
  occurredAt: string;
  orderNumber: string | null;
  note: string | null;
  userName: string | null;
  userEmail: string | null;
}

export function HistoryModal({ item, onClose }: { item: { id: string; name: string }; onClose: () => void }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/inventory/${item.id}/movements?page=${page}&pageSize=${PAGE_SIZE}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || t('historyError')); return; }
        setMovements(data.movements);
        setTotal(data.total);
      } catch {
        if (!cancelled) setError(t('historyError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.id, page, t]);

  const th = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap';
  return (
    <ModalShell title={`${t('historyTitle')} — ${item.name}`} wide>
      {error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {loading ? (
        <p className="text-gray-500 text-sm">{t('historyLoading')}</p>
      ) : movements.length === 0 && !error ? (
        <p className="text-gray-500 text-sm">{t('historyEmpty')}</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className={th}>{t('historyDate')}</th>
                <th className={th}>{t('historyType')}</th>
                <th className={`${th} text-right`}>{t('historyChange')}</th>
                <th className={`${th} text-right`}>{t('historyQtyAfter')}</th>
                <th className={th}>{t('historyOrder')}</th>
                <th className={th}>{t('notes')}</th>
                <th className={th}>{t('historyWho')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m, i) => (
                <tr key={`${page}-${i}`}>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDateTimePl(m.occurredAt)}</td>
                  <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{t(`movement${m.type}`)}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${m.delta > 0 ? 'text-green-700' : m.delta < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta < 0 ? `−${-m.delta}` : '0'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{m.balanceAfter}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{m.orderNumber || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 min-w-[10rem]">{m.note || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{m.userName || m.userEmail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
      <p className="mt-3 text-xs text-gray-500">{t('historyBackdatedHint')}</p>
      <div className="flex justify-end pt-4">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">{t('close')}</button>
      </div>
    </ModalShell>
  );
}
