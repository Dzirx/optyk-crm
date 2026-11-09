'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';

interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
  smsConsent: boolean;
  visits: { id: string; visitDate: string }[];
}

const SMS_LIMIT = 160;

const VISIT_RANGES = [
  { label: 'Brak wizyt', min: 0, max: 0 },
  { label: '1–3 wizyty', min: 1, max: 3 },
  { label: '4–9 wizyt', min: 4, max: 9 },
  { label: '10+ wizyt', min: 10, max: Infinity },
];

function FilterSection({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {title}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

export default function MessagesPage() {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [consentFilter, setConsentFilter] = useState<Set<string>>(new Set(['true']));
  const [visitFilter, setVisitFilter] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'visits-desc' | 'visits-asc' | 'date-desc' | 'date-asc'>('name-asc');
  const [visitDateFrom, setVisitDateFrom] = useState('');
  const [visitDateTo, setVisitDateTo] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/customers?withVisits=1')
      .then(r => r.json())
      .then(data => setCustomers(data.customers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleSet<T extends string>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  const filtered = useMemo(() => {
    let list = [...customers];

    if (consentFilter.size > 0 && consentFilter.size < 2) {
      const wantConsent = consentFilter.has('true');
      list = list.filter(c => c.smsConsent === wantConsent);
    }

    if (visitFilter.size > 0) {
      list = list.filter(c => {
        const count = c.visits?.length ?? 0;
        return [...visitFilter].some(key => {
          const range = VISIT_RANGES[parseInt(key)];
          return range && count >= range.min && count <= range.max;
        });
      });
    }

    if (visitDateFrom || visitDateTo) {
      const from = visitDateFrom ? new Date(visitDateFrom).getTime() : 0;
      const to = visitDateTo ? new Date(visitDateTo + 'T23:59:59').getTime() : Infinity;
      list = list.filter(c =>
        c.visits?.some(v => {
          const d = new Date(v.visitDate).getTime();
          return d >= from && d <= to;
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        `${c.name} ${c.surname}`.toLowerCase().includes(q) || c.phone.includes(q)
      );
    }

    list.sort((a, b) => {
      const nameCmp = `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`);
      const visitDiff = (a.visits?.length ?? 0) - (b.visits?.length ?? 0);
      const lastA = a.visits?.length ? Math.max(...a.visits.map(v => new Date(v.visitDate).getTime())) : 0;
      const lastB = b.visits?.length ? Math.max(...b.visits.map(v => new Date(v.visitDate).getTime())) : 0;
      if (sortBy === 'name-asc') return nameCmp;
      if (sortBy === 'name-desc') return -nameCmp;
      if (sortBy === 'visits-desc') return -visitDiff;
      if (sortBy === 'visits-asc') return visitDiff;
      if (sortBy === 'date-desc') return lastB - lastA;
      if (sortBy === 'date-asc') return lastA - lastB;
      return nameCmp;
    });

    return list;
  }, [customers, consentFilter, visitFilter, visitDateFrom, visitDateTo, search, sortBy]);

  const activeFilterCount = (consentFilter.size < 2 ? consentFilter.size : 0) + visitFilter.size + (visitDateFrom ? 1 : 0) + (visitDateTo ? 1 : 0);

  function clearFilters() {
    setConsentFilter(new Set(['true']));
    setVisitFilter(new Set());
    setVisitDateFrom('');
    setVisitDateTo('');
    setSearch('');
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectableInView = filtered.filter(c => c.smsConsent);
  const allInViewSelected = selectableInView.length > 0 && selectableInView.every(c => selected.has(c.id));

  function toggleAll() {
    const ids = selectableInView.map(c => c.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      allSelected ? ids.forEach(id => next.delete(id)) : ids.forEach(id => next.add(id));
      return next;
    });
  }

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / SMS_LIMIT) || 1;

  async function handleSend() {
    if (!message.trim() || selected.size === 0) return;
    if (!confirm(`${t('confirmBulkSend')} ${selected.size} ${t('confirmBulkSendSuffix')}`)) return;

    setSending(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/sms/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, customerIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setResult({ sent: data.sent, failed: data.failed });
      setMessage('');
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="text-gray-900">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('messagesTitle')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('messagesSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1fr] gap-5">

        {/* FILTRY — lewa kolumna */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Filtry</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800">
                Wyczyść ({activeFilterCount})
              </button>
            )}
          </div>

          <FilterSection title="Zgoda SMS">
            {[{ value: 'true', label: 'Tak' }, { value: 'false', label: 'Nie' }].map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentFilter.has(opt.value)}
                  onChange={() => setConsentFilter(prev => toggleSet(prev, opt.value))}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {customers.filter(c => String(c.smsConsent) === opt.value).length}
                </span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Liczba wizyt">
            {VISIT_RANGES.map((range, idx) => {
              const count = customers.filter(c => {
                const n = c.visits?.length ?? 0;
                return n >= range.min && n <= range.max;
              }).length;
              return (
                <label key={idx} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visitFilter.has(String(idx))}
                    onChange={() => setVisitFilter(prev => toggleSet(prev, String(idx)))}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-700">{range.label}</span>
                  <span className="ml-auto text-xs text-gray-400">{count}</span>
                </label>
              );
            })}
          </FilterSection>

          <FilterSection title="Data wizyty" defaultOpen={false}>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Od</label>
                <input
                  type="date"
                  value={visitDateFrom}
                  onChange={e => setVisitDateFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Do</label>
                <input
                  type="date"
                  value={visitDateTo}
                  onChange={e => setVisitDateTo(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </FilterSection>

          <FilterSection title="Sortuj według" defaultOpen={false}>
            {[
              { value: 'name-asc', label: 'Nazwisko A–Z' },
              { value: 'name-desc', label: 'Nazwisko Z–A' },
              { value: 'visits-desc', label: 'Najwięcej wizyt' },
              { value: 'visits-asc', label: 'Najmniej wizyt' },
              { value: 'date-desc', label: 'Ostatnia wizyta (najnowsza)' },
              { value: 'date-asc', label: 'Ostatnia wizyta (najstarsza)' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sortBy"
                  checked={sortBy === opt.value}
                  onChange={() => setSortBy(opt.value as typeof sortBy)}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </FilterSection>
        </div>

        {/* LISTA KLIENTÓW */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden self-start">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <input
              type="checkbox"
              checked={allInViewSelected}
              onChange={toggleAll}
              className="rounded"
              disabled={selectableInView.length === 0}
            />
            <span className="text-xs text-gray-500">
              {selected.size > 0
                ? `${selected.size} zaznaczonych`
                : `${filtered.length} klientów`}
            </span>
          </div>

          <div className="overflow-y-auto max-h-[520px] divide-y divide-gray-50">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">{t('loadingCustomers')}</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">{t('noCustomersFound')}</div>
            ) : (
              filtered.map(customer => (
                <label
                  key={customer.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    customer.smsConsent ? 'cursor-pointer hover:bg-gray-50' : 'opacity-40 cursor-not-allowed'
                  } ${selected.has(customer.id) ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(customer.id)}
                    onChange={() => toggleOne(customer.id)}
                    disabled={!customer.smsConsent}
                    className="rounded flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {customer.name} {customer.surname}
                    </p>
                    <p className="text-xs text-gray-400">{customer.phone}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {customer.visits?.length ?? 0} wiz.
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* WIADOMOŚĆ */}
        <div className="space-y-4 self-start">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error === 'SMS provider not configured' ? (
                <>{t('bulkSmsProviderMissing')} <Link href="/settings" className="underline font-medium">{t('settings')}</Link></>
              ) : error}
            </div>
          )}

          {result && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="font-medium text-green-800">{t('bulkSmsSuccess')}</p>
              <div className="flex gap-4 mt-1 text-sm">
                <span className="text-green-700">✓ {t('bulkSmsSent')}: {result.sent}</span>
                {result.failed > 0 && (
                  <span className="text-red-600">✗ {t('bulkSmsFailed')}: {result.failed}</span>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('messageContent')}</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder={t('messagePlaceholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">
                {charCount} {t('messageChars')} · {smsCount} {t('messageSmsCount')}
                {smsCount > 1 && <span className="text-orange-500 ml-1">(podzielona)</span>}
              </span>
              <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${charCount > SMS_LIMIT ? 'bg-orange-400' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(((charCount % SMS_LIMIT) || (charCount > 0 ? SMS_LIMIT : 0)) / SMS_LIMIT * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('placeholderHint')}</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { code: '{name}', desc: 'imię i nazwisko' },
                { code: '{staff}', desc: 'nazwa firmy' },
              ].map(p => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setMessage(prev => prev + p.code)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <code className="text-xs font-mono text-blue-700">{p.code}</code>
                  <span className="text-xs text-gray-400">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || selected.size === 0}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending
              ? t('sending')
              : selected.size > 0
              ? `${t('sendBulkSms')} (${selected.size})`
              : t('sendBulkSms')}
          </button>
        </div>
      </div>
    </div>
  );
}
