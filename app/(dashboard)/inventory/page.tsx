'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';

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
const PREDEFINED_CATEGORIES = ['Szkła okularowe', 'Soczewki kontaktowe', 'Oprawki', 'Inne'];

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
  notes: string | null;
}

function emptyForm() {
  return { name: '', quantity: '0', unit: 'szt.', category: '', sph: '', cyl: '', diameter: '', price: '', notes: '' };
}

export default function InventoryPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError('Błąd ładowania magazynu');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingItem(null);
    setForm(emptyForm());
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
      price: item.price != null ? String(item.price) : '',
      notes: item.notes || '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const method = editingItem ? 'PATCH' : 'POST';
      const url = editingItem ? `/api/inventory/${editingItem.id}` : '/api/inventory';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Błąd zapisu');
        return;
      }
      setShowModal(false);
      fetchItems();
    } catch {
      setError('Błąd zapisu');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('areYouSureInventory'))) return;
    try {
      await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch {
      setError('Błąd usuwania');
    }
  }

  async function saveInlineQty(id: string) {
    const qty = parseInt(editingQtyValue);
    if (isNaN(qty)) { setEditingQtyId(null); return; }
    try {
      await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      });
      setEditingQtyId(null);
      fetchItems();
    } catch {
      setError('Błąd zapisu');
    }
  }

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];
  const filtered = items.filter(i => {
    if (categoryFilter && i.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  function formatPrescription(item: InventoryItem) {
    const parts: string[] = [];
    if (item.sph != null) parts.push(`SPH: ${Number(item.sph) > 0 ? '+' : ''}${Number(item.sph).toFixed(2)}`);
    if (item.cyl != null) parts.push(`CYL: ${Number(item.cyl) > 0 ? '+' : ''}${Number(item.cyl).toFixed(2)}`);
    if (item.diameter != null) parts.push(`Śr: ${Number(item.diameter).toFixed(1)}mm`);
    return parts.join(' | ') || '—';
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inventoryTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('inventorySubtitle')}</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + {t('addInventoryItem')}
        </button>
      </div>

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
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">{t('noInventoryItems')}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('itemName')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('category')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Moce</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('quantity')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('unit')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cena brutto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('notes')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.category || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-600 text-xs">{formatPrescription(item)}</td>
                  <td className="px-4 py-3 text-center">
                    {editingQtyId === item.id ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={editingQtyValue}
                          onChange={e => setEditingQtyValue(e.target.value)}
                          onBlur={() => saveInlineQty(item.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveInlineQty(item.id); if (e.key === 'Escape') setEditingQtyId(null); }}
                          className="w-16 border border-blue-400 rounded px-1 py-0.5 text-center text-sm"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingQtyId(item.id); setEditingQtyValue(String(item.quantity)); }}
                        className={`font-semibold px-2 py-0.5 rounded cursor-pointer hover:bg-gray-100 ${item.quantity <= 0 ? 'text-red-600' : item.quantity <= 2 ? 'text-yellow-600' : 'text-green-700'}`}
                      >
                        {item.quantity}
                        {item.quantity < 0 && (
                          <span className="ml-1 text-xs font-normal" title="Sztuki zamówione do zleceń, czekają na dostawę">
                            (zamówione: {-item.quantity})
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium text-sm">
                    {item.price != null ? `${Number(item.price).toFixed(2)} zł` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.notes || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingItem ? t('editInventoryItem') : t('addInventoryItem')}
            </h2>
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
                    min="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('category')}</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {Array.from(new Set([...PREDEFINED_CATEGORIES, ...categories])).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, category: f.category === c ? '' : c }))}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${form.category === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="lub wpisz własną kategorię..."
                />
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cena brutto (zł)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="0.00"
                />
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
      )}
    </div>
  );
}
