'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { Pagination } from '@/components/pagination';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatPln } from '@/lib/money';
import { DeliveryModal } from './_components/delivery-modal';
import { HistoryModal } from './_components/history-modal';
import { CorrectionModal } from './_components/correction-modal';

function genOpts(from: number, to: number, step: number, decimals: number) {
  const opts: { value: string; label: string }[] = [];
  for (let v = from; v <= to + step / 2; v += step) {
    const r = Math.round(v * 1000) / 1000;
    const fixed = r.toFixed(decimals);
    opts.push({ value: fixed, label: r > 0 ? `+${fixed}` : fixed });
  }
  return opts;
}

const SPH_OPTIONS = genOpts(-20, 20, 0.25, 2);
const CYL_OPTIONS = genOpts(-8, 8, 0.25, 2);
const DIAMETER_OPTIONS = ['50.0', '55.0', '60.0', '65.0', '70.0', '75.0', '80.0'];

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
  sph: string | null;
  cyl: string | null;
  diameter: string | null;
  price: string | null;
  purchasePrice: string | null;
  notes: string | null;
}

const PAGE_SIZE = 50;

function emptyForm() {
  return { name: '', quantity: '0', unit: 'szt.', category: '', sph: '', cyl: '', diameter: '', price: '', purchasePrice: '', notes: '' };
}

export default function InventoryPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deliveryItem, setDeliveryItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [correctionItem, setCorrectionItem] = useState<InventoryItem | null>(null);
  const [reason, setReason] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  // Zmiana frazy albo kategorii wraca na stronę 1 (strona jest powiązana z kluczem wyszukiwania).
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const searchKey = `${debouncedSearch}|${categoryFilter}`;
  const [pageState, setPageState] = useState({ key: searchKey, page: 1 });
  const page = pageState.key === searchKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: searchKey, page: p });
  const [reloadKey, setReloadKey] = useState(0);
  const requestSeq = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [openCountId, setOpenCountId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    const seq = ++requestSeq.current;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (categoryFilter) params.set('category', categoryFilter);
        const res = await fetch(`/api/inventory?${params}`);
        const data = await res.json();
        if (seq !== requestSeq.current) return; // nowsze żądanie wyprzedziło to
        if (!res.ok) throw new Error(data.error || 'Błąd ładowania magazynu');
        // Strona zniknęła (np. po usunięciu ostatniej pozycji na niej): wracamy o jedną.
        const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setItems(data.items || []);
        setTotal(data.total);
        setCategories(data.categories || []);
        setError('');
        setLoading(false);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Błąd ładowania magazynu');
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPage zależy tylko od searchKey
  }, [page, debouncedSearch, categoryFilter, reloadKey]);

  const fetchItems = () => setReloadKey(k => k + 1);

  async function fetchOpenCount() {
    try {
      const res = await fetch('/api/stock-counts');
      const data = await res.json();
      const open = (data.stockCounts ?? []).find((c: { status: string }) => c.status === 'open');
      setOpenCountId(open ? open.id : null);
    } catch {
      setOpenCountId(null);
    }
  }
  useEffect(() => { fetchOpenCount(); }, []);

  function openAdd() {
    setEditingItem(null);
    setForm(emptyForm());
    setFormError('');
    setReason('');
    setShowModal(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      category: item.category || '',
      sph: item.sph != null ? String(item.sph) : '',
      cyl: item.cyl != null ? String(item.cyl) : '',
      diameter: item.diameter != null ? String(item.diameter) : '',
      price: item.price != null ? Number(item.price).toFixed(2).replace('.', ',') : '',
      purchasePrice: item.purchasePrice != null ? Number(item.purchasePrice).toFixed(2).replace('.', ',') : '',
      notes: item.notes || '',
    });
    setFormError('');
    setReason('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (qtyChanged && !reason.trim()) { setFormError(t('qtyCorrectionReasonRequired')); return; }
    setSubmitting(true);
    setFormError('');
    try {
      const method = editingItem ? 'PATCH' : 'POST';
      const url = editingItem ? `/api/inventory/${editingItem.id}` : '/api/inventory';
      // Przy edycji ilość idzie do serwera tylko wtedy, gdy użytkownik ją zmienił (inaczej mogłaby nadpisać świeży stan).
      const { quantity: _unchanged, ...rest } = form;
      void _unchanged;
      const payload = !editingItem ? form : qtyChanged ? { ...form, note: reason.trim() } : rest;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json();
        setFormError(d.error || 'Błąd zapisu');
        return;
      }
      setShowModal(false);
      fetchItems();
    } catch {
      setFormError('Błąd zapisu');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('areYouSureInventory'))) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error || 'Błąd usuwania');
      fetchItems();
    } catch {
      setError('Błąd usuwania');
    }
  }

  const qtyChanged = !!editingItem && form.quantity.trim() !== String(editingItem.quantity);
  function formatPrescription(item: InventoryItem) {
    const parts: string[] = [];
    if (item.sph != null) parts.push(`SPH: ${Number(item.sph) > 0 ? '+' : ''}${Number(item.sph).toFixed(2)}`);
    if (item.cyl != null) parts.push(`CYL: ${Number(item.cyl) > 0 ? '+' : ''}${Number(item.cyl).toFixed(2)}`);
    if (item.diameter != null) parts.push(`Śr: ${Number(item.diameter).toFixed(1)}mm`);
    return parts.join(' | ') || '—';
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inventoryTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('inventorySubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventory/stock-counts"
            className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {t('stockCounts')}
          </Link>
          <button
            onClick={openAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + {t('addInventoryItem')}
          </button>
        </div>
      </div>

      {openCountId && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
          {t('inventoryCountInProgress')}{' '}
          <Link href={`/inventory/stock-counts/${openCountId}`} className="underline font-medium">{t('continueStockCount')}</Link>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Wyszukiwanie i filtr */}
      <div className="mb-4 flex gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj po nazwie, kategorii, uwagach..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 w-72"
        />
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            <option value="">{t('allCategories')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">{t('loadingInventory')}</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500">{t('noInventoryItems')}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('itemName')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('category')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Moce</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('quantity')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('unit')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('purchasePrice')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('salePrice')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('notes')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.category || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-600 text-xs">{formatPrescription(item)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setCorrectionItem(item)}
                      title={t('qtyClickToCorrect')}
                      className={`font-semibold px-2 py-0.5 rounded cursor-pointer hover:bg-gray-100 ${item.quantity <= 0 ? 'text-red-600' : item.quantity <= 2 ? 'text-yellow-600' : 'text-green-700'}`}
                    >
                      {item.quantity}
                      {item.quantity < 0 && (
                        <span className="ml-1 text-xs font-normal" title="Sztuki zamówione do zleceń, czekają na dostawę">
                          (zamówione: {-item.quantity})
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700 text-sm">
                    {item.purchasePrice != null ? formatPln(Number(item.purchasePrice)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium text-sm">
                    {item.price != null ? formatPln(Number(item.price)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.notes || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-3 whitespace-nowrap">
                      <button onClick={() => setDeliveryItem(item)} className="text-green-700 hover:text-green-900 text-xs font-medium">{t('deliveryAction')}</button>
                      <button onClick={() => setHistoryItem(item)} className="text-gray-600 hover:text-gray-900 text-xs font-medium">{t('historyAction')}</button>
                      <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">{t('edit')}</button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">{t('delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}

      {deliveryItem && <DeliveryModal item={deliveryItem} onClose={() => setDeliveryItem(null)} onDone={() => { setDeliveryItem(null); fetchItems(); }} />}
      {historyItem && <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
      {correctionItem && <CorrectionModal item={correctionItem} onClose={() => setCorrectionItem(null)} onDone={() => { setCorrectionItem(null); fetchItems(); }} />}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-6 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingItem ? t('editInventoryItem') : t('addInventoryItem')}
            </h2>
            {formError && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('itemName')} *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="np. Essilor Varilux X 1.67 AR"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('quantity')} *</label>
                  <input
                    type="number"
                    required
                    min={editingItem ? undefined : '0'}
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  {editingItem && <p className="mt-1 text-xs text-gray-500">{t('qtyCorrectionHelp')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('unit')}</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="szt."
                  />
                </div>
              </div>

              {qtyChanged && (
                <div>
                  <label htmlFor="edit-reason" className="block text-sm font-medium text-gray-700 mb-1">{t('qtyCorrectionReason')} *</label>
                  <input
                    id="edit-reason"
                    type="text"
                    maxLength={500}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400"
                    placeholder={t('qtyCorrectionReasonPlaceholder')}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('category')}</label>
                <input
                  type="text"
                  list="inventory-categories"
                  maxLength={100}
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400"
                  placeholder={t('categoryPlaceholder')}
                />
                <datalist id="inventory-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SPH</label>
                  <select
                    value={form.sph}
                    onChange={e => setForm(f => ({ ...f, sph: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {SPH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CYL</label>
                  <select
                    value={form.cyl}
                    onChange={e => setForm(f => ({ ...f, cyl: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {CYL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('diameter')} (mm)</label>
                  <select
                    value={form.diameter}
                    onChange={e => setForm(f => ({ ...f, diameter: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {DIAMETER_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchasePrice')} (zł)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.purchasePrice}
                    onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('salePrice')} (zł)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('notes')}</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Opcjonalne uwagi"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {t('cancel')}
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? t('saving') : (editingItem ? t('update') : t('create'))}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
