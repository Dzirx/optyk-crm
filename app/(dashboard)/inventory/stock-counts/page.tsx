'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatMoneyCents } from '@/lib/stock-count/format';
import { yearEndDate } from '@/lib/time';

interface CountRow {
  id: string;
  countDate: string;
  status: 'open' | 'closed';
  totalLines: number;
  linesWithDiff: number;
  totalValueCents: number;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export default function StockCountsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(() => yearEndDate());
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stock-counts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCounts(data.stockCounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stockCountSaveError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const open = counts.find((c) => c.status === 'open');

  async function start() {
    setStarting(true);
    setError('');
    try {
      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countDate: date }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('stockCountSaveError'));
        load();
        return;
      }
      router.push(`/inventory/stock-counts/${data.stockCount.id}`);
    } catch {
      setError(t('stockCountSaveError'));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <BackLink href="/inventory">{t('backToInventory')}</BackLink>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">{t('stockCounts')}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">{t('stockCountsSubtitle')}</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        {open ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-700 flex-1 min-w-[14rem]">{t('stockCountAlreadyOpen')}</p>
            <Link href={`/inventory/stock-counts/${open.id}`} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              {t('continueStockCount')}
            </Link>
          </div>
        ) : (
          <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="count-date" className="block text-sm font-medium text-gray-700 mb-1">{t('stockCountDate')}</label>
              <input
                id="count-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <button
              onClick={start}
              disabled={starting || !date}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {t('startStockCount')}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">{t('stockCountStartHint')}</p>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">...</p>
      ) : counts.length === 0 ? (
        <p className="text-gray-500">{t('stockCountNone')}</p>
      ) : (
        <ul className="space-y-3">
          {counts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/inventory/stock-counts/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 hover:border-blue-300"
              >
                <span className="font-semibold text-gray-900">{formatDate(c.countDate)}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                  {c.status === 'open' ? t('stockCountOpen') : t('stockCountClosed')}
                </span>
                <span className="text-sm text-gray-600">{t('finishSummaryDiffLines')}: {c.linesWithDiff}</span>
                <span className="text-sm text-gray-700 font-medium">{formatMoneyCents(c.totalValueCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
