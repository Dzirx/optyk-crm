'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Pagination } from '@/components/pagination';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatMoneyCents } from '@/lib/stock-count/format';
import { summarize } from '@/lib/stock-count/math';
import {
  applyResponse, edit, initialEdit, isActive, isBlocking, isBusy, reconcile, requestRestore, requestSave, shouldFlush,
  type LineEdit, type SendRequest, type Step,
} from '@/lib/stock-count/save-queue';
import { todayIso } from '@/lib/time';

interface Line {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  purchasePrice: number | null;
  systemQty: number | null;
  countedQty: number | null;
  systemQtyAtCount: number | null;
  diff: number | null;
}

interface Head {
  id: string;
  countDate: string;
  status: 'open' | 'closed';
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

const PAGE_SIZE = 50;

const GRID = 'grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_5rem_8rem_10rem_11rem] gap-x-3 gap-y-1 items-center';

function DiffBadge({ diff }: { diff: number | null }) {
  const { t } = useLanguage();
  if (diff === null) return <span className="text-gray-400">—</span>;
  if (diff === 0) return <span className="text-gray-500">{t('stockCountDiffOk')}</span>;
  return diff < 0
    ? <span className="font-semibold text-red-600">{t('stockCountDiffShortage')} {-diff}</span>
    : <span className="font-semibold text-green-700">{t('stockCountDiffSurplus')} {diff}</span>;
}

/** Pole „Policzono”: w pełni sterowane stanem ze strony (tekst i status zostają przy odmontowaniu wiersza). */
function CountInput({ line, state, onChange, onSave, onFocus, onBlurField, nextFocus }: {
  line: Line;
  state: LineEdit;
  onChange: (lineId: string, text: string) => void;
  onSave: (lineId: string) => void;
  onFocus: (lineId: string) => void;
  onBlurField: (lineId: string) => void;
  nextFocus: () => void;
}) {
  const { t } = useLanguage();
  const status = state.status;
  return (
    <div>
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        data-count-input
        data-line-id={line.id}
        aria-invalid={status === 'error'}
        aria-label={`${t('stockCountCountedQty')}: ${line.name}`}
        value={state.text}
        onChange={(e) => onChange(line.id, e.target.value)}
        onFocus={() => onFocus(line.id)}
        onBlur={() => {
          onSave(line.id);
          onBlurField(line.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave(line.id);
            nextFocus();
          }
        }}
        className={`w-24 border rounded-lg px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 ${status === 'error' ? 'border-red-500' : 'border-gray-300'}`}
      />
      <span className="text-xs min-w-[4.5rem]" aria-live="polite">
        {status === 'saving' && <span className="text-gray-400">...</span>}
        {status === 'saved' && <span className="text-green-700">✓ {t('stockCountSaved')}</span>}
        {status === 'error' && <span className="text-red-600" title={state.message}>{t('stockCountSaveError')}</span>}
      </span>
    </div>
    {status === 'error' && state.message && <p className="text-xs text-red-600 mt-1 max-w-[16rem]">{state.message}</p>}
    </div>
  );
}

export default function StockCountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useLanguage();
  const router = useRouter();
  const [head, setHead] = useState<Head | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const filterKey = `${search.trim().toLowerCase()}|${category}|${onlyDiff}`;
  // Zmiana filtrów wraca na stronę 1 (strona jest powiązana z kluczem filtrów).
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const requestedPage = pageState.key === filterKey ? pageState.page : 1;
  /** Pozycja do zogniskowania po przejściu na inną stronę (ustawiana przed zmianą strony). */
  const pendingFocus = useRef<string | { first: true } | null>(null);
  const [showFinish, setShowFinish] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  /** Stan pól „Policzono” per pozycja. Źródłem prawdy jest ref (synchroniczny), kopia w state służy do renderu. */
  const editsRef = useRef(new Map<string, LineEdit>());
  const [edits, setEdits] = useState<Map<string, LineEdit>>(() => new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Trwające pętle zapisu per pozycja — „Zakończ” czeka, aż się opróżnią. */
  const runners = useRef(new Map<string, Promise<void>>());
  const linesRef = useRef<Line[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** Rośnie przy każdej odpowiedzi zapisu; GET rozpoczęty przed nią jest nieaktualny. */
  const saveGen = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const saveNowRef = useRef<(lineId: string) => void>(() => {});

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const commit = useCallback((lineId: string, next: LineEdit) => {
    editsRef.current.set(lineId, next);
    setEdits(new Map(editsRef.current));
  }, []);

  const getEdit = useCallback((lineId: string): LineEdit => {
    const existing = editsRef.current.get(lineId);
    if (existing) return existing;
    const line = linesRef.current.find((l) => l.id === lineId);
    return initialEdit(line ? line.countedQty : null);
  }, []);

  const clearTimer = useCallback((lineId: string) => {
    const timer = timers.current.get(lineId);
    if (timer) clearTimeout(timer);
    timers.current.delete(lineId);
  }, []);

  function onSaved(lineId: string, countedQty: number | null, systemQtyAtCount: number | null) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              countedQty,
              systemQtyAtCount,
              systemQty: systemQtyAtCount ?? l.systemQty,
              diff: countedQty === null || systemQtyAtCount === null ? null : countedQty - systemQtyAtCount,
            }
          : l,
      ),
    );
  }

  async function sendRequest(lineId: string, req: SendRequest) {
    try {
      const res = await fetch(`/api/stock-counts/${id}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countedQty: req.countedQty }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false as const, status: res.status, message: String(data.error ?? '') };
      return { ok: true as const, status: res.status, countedQty: data.line.countedQty as number | null, systemQtyAtCount: data.line.systemQtyAtCount as number | null };
    } catch {
      return { ok: false as const, status: 0, message: '' };
    }
  }

  /** Stosuje wynik kroku kolejki i, gdy trzeba, uruchamia pętlę wysyłania (jedna na pozycję). */
  function dispatch(lineId: string, step: Step) {
    commit(lineId, step.state);
    if (!step.send || runners.current.has(lineId)) return;
    let req: SendRequest | null = step.send;
    const run = (async () => {
      while (req) {
        const sent: SendRequest = req;
        const result = await sendRequest(lineId, sent);
        saveGen.current++;
        const r = applyResponse(getEdit(lineId), sent.seq, result.ok ? { ok: true, countedQty: result.countedQty } : result);
        commit(lineId, r.state);
        if (r.applied && result.ok) onSaved(lineId, result.countedQty, result.systemQtyAtCount);
        if (r.applied && !result.ok && (result.status === 404 || result.status === 409)) {
          // Pozycja zniknęła albo spis jest zamknięty: odśwież stronę i pokaż powód u góry.
          const message = result.message;
          void loadRef.current().then(() => setError(message));
        }
        req = r.send;
      }
    })().finally(() => runners.current.delete(lineId));
    runners.current.set(lineId, run);
  }

  const saveNow = useCallback((lineId: string) => {
    clearTimer(lineId);
    dispatch(lineId, requestSave(getEdit(lineId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimer, getEdit]);
  saveNowRef.current = saveNow;

  function onTextChange(lineId: string, text: string) {
    commit(lineId, edit(getEdit(lineId), text));
    clearTimer(lineId);
    timers.current.set(lineId, setTimeout(() => saveNow(lineId), 600));
  }

  function restore(lineId: string) {
    setError('');
    clearTimer(lineId); // zaległy debounce nie nadpisze przywrócenia
    dispatch(lineId, requestRestore(getEdit(lineId)));
  }

  // Przy odmontowaniu (nawigacja) zaległe zapisy lecą, zamiast przepaść razem z timerem.
  useEffect(() => {
    const t = timers.current;
    const edits = editsRef.current;
    return () => {
      t.forEach((x) => clearTimeout(x));
      t.clear();
      for (const [lineId, st] of edits) if (shouldFlush(st)) saveNowRef.current(lineId);
    };
  }, []);

  // Ostrzeżenie przy zamykaniu karty, gdy coś się zapisuje albo ma niezapisany tekst.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      for (const st of editsRef.current.values()) {
        if (isBusy(st) || st.text.trim() !== st.serverText) {
          e.preventDefault();
          e.returnValue = '';
          return;
        }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /** Wysyła zaległy tekst z pól i czeka, aż żadna pozycja nie zapisuje ani nie ma kolejki. */
  async function flushSaves() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    for (const [lineId, st] of editsRef.current) {
      if (shouldFlush(st)) saveNow(lineId);
    }
    while (runners.current.size > 0) {
      await Promise.allSettled([...runners.current.values()]);
    }
  }

  const load = useCallback(async () => {
    try {
      let data;
      // GET rozpoczęty przed którąś odpowiedzią zapisu mógłby nadpisać nowsze liczby: powtarzamy go.
      for (let attempt = 0; ; attempt++) {
        const gen = saveGen.current;
        const res = await fetch(`/api/stock-counts/${id}`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (gen === saveGen.current || attempt >= 4) break;
      }
      setHead(data.stockCount);
      setLines(data.lines);
      linesRef.current = data.lines;
      const serverQty = new Map<string, number | null>((data.lines as Line[]).map((l) => [l.id, l.countedQty]));
      const closed = data.stockCount.status !== 'open';
      for (const [k, st] of [...editsRef.current]) {
        // Pozycja zniknęła albo spis zamknięty: porzuć wpis i timer. Czyste pola biorą wartość z serwera.
        if (closed || !serverQty.has(k)) {
          clearTimer(k);
          editsRef.current.delete(k);
        } else if (!isActive(st)) editsRef.current.delete(k);
        else editsRef.current.set(k, reconcile(st, serverQty.get(k) ?? null));
      }
      setEdits(new Map(editsRef.current));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stockCountSaveError'));
    } finally {
      setLoading(false);
    }
  }, [id, t, clearTimer]);
  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  const isOpen = head?.status === 'open';
  const summary = useMemo(
    () => summarize(lines.map((l) => ({ countedQty: l.countedQty, systemQtyAtCount: l.systemQtyAtCount, price: l.purchasePrice }))),
    [lines],
  );
  const categories = useMemo(() => Array.from(new Set(lines.map((l) => l.category).filter(Boolean))) as string[], [lines]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      const st = edits.get(l.id);
      if (l.id === focusedId || (st && isActive(st))) return true; // wiersz w edycji nie znika przy filtrach
      if (q && !l.name.toLowerCase().includes(q)) return false;
      if (category && l.category !== category) return false;
      if (onlyDiff && !l.diff) return false;
      return true;
    });
  }, [lines, search, category, onlyDiff, edits, focusedId]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  let page = Math.min(requestedPage, pageCount);
  // Pole w edycji nie może zniknąć z ekranu, gdy filtry przesuną granice stron.
  const focusedIdx = focusedId ? visible.findIndex((l) => l.id === focusedId) : -1;
  if (focusedIdx >= 0 && Math.floor(focusedIdx / PAGE_SIZE) + 1 !== page) page = Math.floor(focusedIdx / PAGE_SIZE) + 1;
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = (p: number) => setPageState({ key: filterKey, page: Math.min(Math.max(1, p), pageCount) });

  // Po zmianie strony (Enter na końcu strony, blokada zakończenia) ustawia fokus na wskazanym polu.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('[data-count-input]');
    const el = typeof target === 'string' ? listRef.current?.querySelector<HTMLInputElement>(`[data-count-input][data-line-id="${target}"]`) : inputs?.[0];
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    el.scrollIntoView({ block: 'center' });
  });

  function focusNext(index: number) {
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('[data-count-input]');
    const next = inputs?.[index + 1];
    if (next) {
      next.focus();
    } else if (page < pageCount) {
      // Koniec strony: przechodzimy na następną i ustawiamy fokus na jej pierwszym polu.
      pendingFocus.current = { first: true };
      setFocusedId(null);
      goToPage(page + 1);
    }
  }

  const blockingIds = () => [...editsRef.current].filter(([, st]) => isBlocking(st) || isBusy(st)).map(([k]) => k);

  async function openFinish() {
    setError('');
    await flushSaves();
    const bad = blockingIds();
    if (bad.length > 0) {
      setError(t('stockCountFixErrors'));
      // Pierwsza zła pozycja w kolejności listy: czyścimy filtry i przechodzimy na jej stronę.
      const badSet = new Set(bad);
      const idx = linesRef.current.findIndex((l) => badSet.has(l.id));
      const target = idx >= 0 ? linesRef.current[idx].id : bad[0];
      setSearch('');
      setCategory('');
      setOnlyDiff(false);
      setFocusedId(null);
      pendingFocus.current = target;
      setPageState({ key: '||false', page: idx >= 0 ? Math.floor(idx / PAGE_SIZE) + 1 : 1 });
      return;
    }
    await load(); // świeże stany przed podsumowaniem
    setShowFinish(true);
  }

  async function finish() {
    setBusy(true);
    try {
      const res = await fetch(`/api/stock-counts/${id}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowFinish(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stockCountSaveError'));
      setShowFinish(false);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm(t('cancelStockCountConfirm'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stock-counts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push('/inventory/stock-counts');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stockCountSaveError'));
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">...</div>;
  if (!head) {
    return (
      <div className="p-6">
        <p className="text-red-600 mb-3">{error}</p>
        <BackLink href="/inventory/stock-counts">{t('backToStockCounts')}</BackLink>
      </div>
    );
  }

  const btn = 'px-4 py-2 rounded-lg text-sm font-medium';

  return (
    <div className="p-4 sm:p-6">
      <BackLink href="/inventory/stock-counts">{t('backToStockCounts')}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('stockCounts')} {formatDate(head.countDate)}</h1>
          <p className="text-sm text-gray-600 mt-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full mr-2 ${isOpen ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
              {isOpen ? t('stockCountOpen') : t('stockCountClosed')}
            </span>
            {t('finishSummaryDiffLines')}: <strong>{summary.linesWithDiff}</strong>
          </p>
          {isOpen && <p className="text-sm text-gray-500 mt-2 max-w-4xl">{t('stockCountHint')} {t('stockCountHintDate')}</p>}
          {head.countDate.slice(0, 10) < todayIso() && (
            <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3 max-w-4xl">
              {t('stockCountPastNote').replace('{countDate}', formatDate(head.countDate))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/inventory/stock-counts/${id}/print`} target="_blank" className={`${btn} bg-white text-gray-700 border border-gray-300 hover:bg-gray-50`}>
            {t('printSheet')}
          </Link>
          <a href={`/api/stock-counts/${id}/export`} className={`${btn} bg-white text-gray-700 border border-gray-300 hover:bg-gray-50`}>
            {t('downloadCsv')}
          </a>
          {isOpen && (
            <>
              <button onClick={cancel} disabled={busy} className={`${btn} bg-white text-red-600 border border-red-300 hover:bg-red-50 disabled:opacity-50`}>
                {t('cancelStockCount')}
              </button>
              <button onClick={openFinish} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
                {t('finishStockCount')}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('stockCountSearch')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 w-full sm:w-64"
        />
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 max-w-full">
            <option value="">{t('allCategories')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {isOpen && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            {t('stockCountOnlyDiff')}
          </label>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200" role="table" ref={listRef}>
        <div role="row" className={`${GRID} hidden md:grid px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase rounded-t-xl`}>
          <div role="columnheader">{t('itemName')}</div>
          <div role="columnheader">{t('category')}</div>
          <div role="columnheader">J.m.</div>
          <div role="columnheader" className="text-right">{t('stockCountSystemQty')}</div>
          <div role="columnheader">{t('stockCountCountedQty')}</div>
          <div role="columnheader" className="text-right">{t('stockCountDiff')}</div>
        </div>
        {visible.length === 0 && <p className="p-4 text-sm text-gray-500">{t('noInventoryItems')}</p>}
        <div className="divide-y divide-gray-100">
          {pageRows.map((l, index) => (
            <div key={l.id} role="row" className={`${GRID} px-4 py-3`}>
              <div role="cell" className="font-medium text-gray-900 break-words min-w-0 col-span-2 md:col-span-1">{l.name}</div>
              <div role="cell" className="text-gray-600 text-sm break-words min-w-0 col-span-2 md:col-span-1">
                {l.category || '—'}
                <span className="md:hidden text-gray-500"> · {l.unit} · {t('stockCountSystemQty')}: {l.systemQty ?? '—'}</span>
              </div>
              <div role="cell" className="hidden md:block text-gray-600 text-sm">{l.unit}</div>
              <div role="cell" className="hidden md:block text-right text-gray-700">{l.systemQty ?? '—'}</div>
              <div role="cell">
                {isOpen ? (
                  <CountInput
                    line={l}
                    state={edits.get(l.id) ?? initialEdit(l.countedQty)}
                    onChange={onTextChange}
                    onSave={saveNow}
                    onFocus={setFocusedId}
                    onBlurField={(lineId) => setFocusedId((cur) => (cur === lineId ? null : cur))}
                    nextFocus={() => focusNext(index)}
                  />
                ) : (
                  <span className="text-gray-900">{l.countedQty ?? '—'}</span>
                )}
              </div>
              <div role="cell" className="text-right">
                <span className="md:hidden text-xs text-gray-500 mr-1">{t('stockCountDiff')}:</span>
                <DiffBadge diff={l.diff} />
                {isOpen && !!l.diff && (
                  <button type="button" onClick={() => restore(l.id)} className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline">
                    {t('stockCountRestore')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {visible.length > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={visible.length} onPageChange={goToPage} />}

      {showFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('finishStockCountTitle')}</h2>
            <dl className="text-sm text-gray-700 space-y-1 mb-3">
              <div className="flex justify-between"><dt>{t('finishSummaryDiffLines')}</dt><dd>{summary.linesWithDiff}</dd></div>
              <div className="flex justify-between"><dt>{t('finishSummaryShortage')}</dt><dd className="text-red-600 font-semibold">{summary.shortageUnits}</dd></div>
              <div className="flex justify-between"><dt>{t('finishSummarySurplus')}</dt><dd className="text-green-700 font-semibold">{summary.surplusUnits}</dd></div>
              <div className="flex justify-between"><dt>{t('finishSummaryValueChange')}</dt><dd>{formatMoneyCents(summary.diffValueCents)}</dd></div>
            </dl>
            <p className="text-xs text-gray-500 mb-4">{t('finishIrreversible')}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowFinish(false)} className={`${btn} text-gray-600 border border-gray-300 hover:bg-gray-50`}>{t('cancel')}</button>
              <button onClick={finish} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>{t('finishConfirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
