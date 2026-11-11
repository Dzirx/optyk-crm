'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/pagination';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useLanguage } from '@/lib/i18n/language-context';
import { MAX_BULK_RECIPIENTS } from '@/lib/sms/limits';
import { newIdempotencyKey } from '@/lib/sms/campaign-helpers';
import { CampaignProgress } from './_components/campaign-progress';
import { CampaignHistory } from './_components/campaign-history';
import { CampaignDetails } from './_components/campaign-details';

interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
  smsConsent: boolean;
  visitCount: number;
}

const SMS_LIMIT = 160;
const PAGE_SIZE = 50;

// Kolejność jak w VISIT_RANGES w lib/customers/list-filter.ts: indeks idzie do serwera jako `visitRanges`.
const VISIT_RANGES = ['Brak wizyt', '1–3 wizyty', '4–9 wizyt', '10+ wizyt'];

type SortBy = 'name-asc' | 'name-desc' | 'visits-desc' | 'visits-asc' | 'date-desc' | 'date-asc';

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

const TAB = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px';

/** Strona wiadomości: zakładki „Nowa wiadomość” / „Historia wysyłek”; stan w adresie (?tab=history&campaign=id). */
export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesTabs />
    </Suspense>
  );
}

function MessagesTabs() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const campaignId = params.get('campaign');
  const history = params.get('tab') === 'history' || !!campaignId;
  const openCampaign = (id: string) => router.push(`/messages?tab=history&campaign=${id}`);

  return (
    <div className="text-gray-900">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('messagesTitle')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('messagesSubtitle')}</p>
      </div>
      <div role="tablist" className="flex border-b border-gray-200 mb-5">
        <Link href="/messages" role="tab" aria-selected={!history} data-testid="tab-compose"
          className={`${TAB} ${!history ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          {t('messagesTabNew')}
        </Link>
        <Link href="/messages?tab=history" role="tab" aria-selected={history} data-testid="tab-history"
          className={`${TAB} ${history ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          {t('messagesTabHistory')}
        </Link>
      </div>
      {/* Kreator zostaje zamontowany, więc zaznaczenie i treść przeżywają przełączenie zakładki. */}
      <div className={history ? 'hidden' : ''}>
        <Composer onOpenCampaign={openCampaign} />
      </div>
      {history && (campaignId
        ? <CampaignDetails key={campaignId} campaignId={campaignId} onOpen={openCampaign} />
        : <CampaignHistory onOpen={openCampaign} />)}
    </div>
  );
}

function Composer({ onOpenCampaign }: { onOpenCampaign: (id: string) => void }) {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [selectableTotal, setSelectableTotal] = useState(0);
  const [counts, setCounts] = useState({ consented: 0, notConsented: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  // Zaznaczenie żyje poza listą: przeżywa zmianę strony, wyszukiwania i filtrów.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [consentFilter, setConsentFilter] = useState<Set<string>>(new Set(['true']));
  const [visitFilter, setVisitFilter] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('name-asc');
  const [visitDateFrom, setVisitDateFrom] = useState('');
  const [visitDateTo, setVisitDateTo] = useState('');
  const [sending, setSending] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectNotice, setSelectNotice] = useState('');
  // Wysyłka w tle: karta postępu świeżej kampanii, historia i okno szczegółów.
  const [progressId, setProgressId] = useState<string | null>(null);
  // Jeden klucz idempotencji na „napisanie wiadomości”: powtórzone żądanie nie tworzy drugiej kampanii.
  const idempotencyKey = useRef<string | null>(null);
  const [error, setError] = useState('');

  function toggleSet<T extends string>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  // Parametry filtrów dla /api/customers i /api/customers/ids (zgoda: oba lub żaden = bez filtra).
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const filterParams = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(extra);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (consentFilter.size === 1) params.set('smsConsent', [...consentFilter][0]);
    if (visitFilter.size > 0) params.set('visitRanges', [...visitFilter].sort().join(','));
    if (visitDateFrom) params.set('visitFrom', visitDateFrom);
    if (visitDateTo) params.set('visitTo', visitDateTo);
    return params;
  };
  const filterKey = filterParams().toString() + '|' + sortBy;

  // Zmiana filtrów, frazy albo sortowania wraca na stronę 1.
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterKey, page: p });
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    const params = filterParams({ page: String(page), pageSize: String(PAGE_SIZE), sort: sortBy });
    fetch(`/api/customers?${params}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (seq !== requestSeq.current) return; // nowsze żądanie wyprzedziło to
        if (!ok) throw new Error(data.error);
        const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setCustomers(data.customers || []);
        setTotal(data.total);
        setSelectableTotal(data.selectableTotal ?? 0);
        setCounts({ consented: data.counts?.consented ?? 0, notConsented: data.counts?.notConsented ?? 0 });
        setLoading(false);
      })
      .catch(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterParams i setPage zależą tylko od filterKey
  }, [page, filterKey]);

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Wybrać można tylko klientów ze zgodą na SMS.
  const selectableOnPage = customers.filter(c => c.smsConsent);
  const pageFullySelected = selectableOnPage.length > 0 && selectableOnPage.every(c => selected.has(c.id));

  function togglePage() {
    const ids = selectableOnPage.map(c => c.id);
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (pageFullySelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    setSelectNotice('');
    try {
      // Tylko klienci ze zgodą; serwer zwraca same id, najwyżej tyle, ile wolno wysłać naraz.
      const params = filterParams();
      params.set('smsConsent', 'true');
      const res = await fetch(`/api/customers/ids?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setSelected(prev => new Set([...prev, ...(data.ids as string[])]));
      if (data.total > data.ids.length) {
        setSelectNotice(`${t('selectionLimitReached')} ${data.limit} ${t('selectionLimitOf')} ${data.total}.`);
      }
    } catch (err) {
      setSelectNotice(err instanceof Error ? err.message : 'Error');
    } finally {
      setSelectingAll(false);
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectNotice('');
  }

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / SMS_LIMIT) || 1;

  async function handleSend() {
    if (!message.trim() || selected.size === 0 || selected.size > MAX_BULK_RECIPIENTS) return;
    if (!confirm(`${t('confirmBulkSend')} ${selected.size} ${t('confirmBulkSendSuffix')}`)) return;

    setSending(true);
    setError('');

    try {
      idempotencyKey.current ??= newIdempotencyKey();
      const res = await fetch('/api/sms/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, customerIds: Array.from(selected), idempotencyKey: idempotencyKey.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      idempotencyKey.current = null;
      setProgressId(data.campaign.id);
      setMessage('');
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
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
                  {opt.value === 'true' ? counts.consented : counts.notConsented}
                </span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Liczba wizyt">
            {VISIT_RANGES.map((label, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visitFilter.has(String(idx))}
                  onChange={() => setVisitFilter(prev => toggleSet(prev, String(idx)))}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
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
                  onChange={() => setSortBy(opt.value as SortBy)}
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

          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm font-medium text-gray-900">{t('selectedCount')}: {selected.size}</span>
              <button
                type="button"
                onClick={togglePage}
                disabled={selectableOnPage.length === 0}
                className="px-2 py-1 text-xs border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                {pageFullySelected ? t('deselectPage') : t('selectPage')}
              </button>
              <button
                type="button"
                onClick={selectAllMatching}
                disabled={selectingAll || selectableTotal === 0}
                className="px-2 py-1 text-xs border border-blue-300 bg-white text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50"
              >
                {t('selectAllMatching')} ({selectableTotal})
              </button>
              {selected.size > 0 && (
                <button type="button" onClick={clearSelection} className="text-xs text-blue-600 hover:text-blue-800">
                  {t('clearSelection')}
                </button>
              )}
            </div>
            {selectNotice && <p className="text-xs text-orange-600">{selectNotice}</p>}
            {selected.size > MAX_BULK_RECIPIENTS && (
              <p className="text-xs text-red-600">{t('selectionOverLimit')} {MAX_BULK_RECIPIENTS}.</p>
            )}
          </div>

          <div className="overflow-y-auto max-h-[520px] divide-y divide-gray-50">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">{t('loadingCustomers')}</div>
            ) : customers.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">{t('noCustomersFound')}</div>
            ) : (
              customers.map(customer => (
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
                    {customer.visitCount} wiz.
                  </span>
                </label>
              ))
            )}
          </div>

          {total > 0 && (
            <div className="px-4 pb-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          )}
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

          {progressId && (
            <CampaignProgress campaignId={progressId} onOpen={onOpenCampaign} />
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
            disabled={sending || !message.trim() || selected.size === 0 || selected.size > MAX_BULK_RECIPIENTS}
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
