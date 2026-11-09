'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { itemsTotal, hasPrices, inventoryPriceSum } from '@/lib/work-orders/totals';
import { formatPhone } from '@/lib/phone';

interface WorkOrderItem {
  id?: string;
  type: string;
  opSph: string; opCyl: string; opAxis: string; opAdd: string; opPd: string;
  olSph: string; olCyl: string; olAxis: string; olAdd: string; olPd: string;
  frameModel: string;
  ownFrame: boolean;
  lensType: string;
  framePrice: string;
  lensPrice: string;
  inventoryItemIdOp: string;
  inventoryItemIdOl: string;
  inventoryItemIdFrame: string;
  opOrdered: boolean;
  olOrdered: boolean;
  frameOrdered: boolean;
}

type OrderedKey = 'opOrdered' | 'olOrdered' | 'frameOrdered';
const ORDERED_KEYS: OrderedKey[] = ['opOrdered', 'olOrdered', 'frameOrdered'];

/** Elementy zlecenia oznaczone „do zamówienia” (bez powtórzeń), np. ['OP', 'oprawka']. */
function orderedParts(items: Pick<WorkOrderItem, OrderedKey>[], labels: Record<OrderedKey, string>): string[] {
  const parts = new Set<string>();
  for (const item of items) for (const key of ORDERED_KEYS) if (item[key]) parts.add(labels[key]);
  return [...parts];
}

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
}

interface WorkOrder {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  receivedAt: string;
  pickupDate: string | null;
  status: string;
  totalAmount: string | null;
  deposit: string | null;
  notes: string | null;
  reviewSmsStatus: string | null;
  reviewSmsSentAt: string | null;
  items: WorkOrderItem[];
}

interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
}

const ITEM_TYPES = [
  { value: 'do_dali', labelKey: 'lensTypeDali' },
  { value: 'do_blizy', labelKey: 'lensTypeBlizy' },
  { value: 'progresywne', labelKey: 'lensTypeProgresywne' },
  { value: 'soczewki_kontaktowe', labelKey: 'lensTypeSoczewki' },
];

const STATUSES = [
  { value: 'pending', labelKey: 'orderPending' },
  { value: 'ready', labelKey: 'orderReady' },
  { value: 'completed', labelKey: 'orderCompleted' },
];

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
const ADD_OPTIONS = genOpts(0.25, 4, 0.25, 2);
const PD_OPTIONS  = genOpts(25, 40, 0.5, 1);

const FIELD_OPTIONS: Record<string, { value: string; label: string }[] | null> = {
  opSph: SPH_OPTIONS, opCyl: CYL_OPTIONS, opAxis: null, opAdd: ADD_OPTIONS, opPd: PD_OPTIONS,
  olSph: SPH_OPTIONS, olCyl: CYL_OPTIONS, olAxis: null, olAdd: ADD_OPTIONS, olPd: PD_OPTIONS,
};

function formatInvLabel(inv: InventoryItem) {
  const parts: string[] = [];
  if (inv.sph != null) parts.push(`SPH: ${Number(inv.sph) > 0 ? '+' : ''}${Number(inv.sph).toFixed(2)}`);
  if (inv.cyl != null) parts.push(`CYL: ${Number(inv.cyl) > 0 ? '+' : ''}${Number(inv.cyl).toFixed(2)}`);
  if (inv.diameter != null) parts.push(`Śr: ${Number(inv.diameter).toFixed(1)}mm`);
  return [inv.name, ...parts, `(${inv.quantity} ${inv.unit})`].join(' | ');
}

function InventorySelect({ value, onChange, onSelectItem, items, placeholder }: {
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (inv: InventoryItem | null) => void;
  items: InventoryItem[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];
  const selected = items.find(i => i.id === value);
  const filtered = items.filter(inv => {
    if (activeCategory && inv.category !== activeCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [inv.name, inv.sph != null ? String(inv.sph) : '', inv.cyl != null ? String(inv.cyl) : '']
      .some(p => p.toLowerCase().includes(q));
  });

  function select(inv: InventoryItem | null) {
    onChange(inv?.id ?? '');
    onSelectItem?.(inv);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-left flex items-center justify-between bg-white gap-1"
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? formatInvLabel(selected) : placeholder}
        </span>
        <span className="text-gray-400 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg min-w-[280px]">
          {/* Zakładki kategorii */}
          {categories.length > 0 && (
            <div className="flex gap-1 px-1.5 pt-1.5 pb-1 border-b border-gray-100 overflow-x-auto flex-wrap">
              <button type="button"
                onClick={() => setActiveCategory('')}
                className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${activeCategory === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Wszystkie
              </button>
              {categories.map(c => (
                <button type="button" key={c}
                  onClick={() => setActiveCategory(c === activeCategory ? '' : c)}
                  className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${activeCategory === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {/* Wyszukiwanie */}
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj..."
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => select(null)}
              className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50">
              — Brak
            </button>
            {filtered.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">Brak wyników</p>}
            {filtered.map(inv => (
              <button type="button" key={inv.id}
                onClick={() => select(inv)}
                className={`w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 ${value === inv.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'}`}>
                {formatInvLabel(inv)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Stare zlecenia mogą nie mieć kwoty — wtedy pokazujemy sumę cen pozycji.
function displayTotal(order: WorkOrder): string {
  if (order.totalAmount != null && order.totalAmount !== '') return `${Number(order.totalAmount).toFixed(2)} zł`;
  return hasPrices(order.items) ? `${itemsTotal(order.items).toFixed(2)} zł` : '—';
}

function emptyItem(): WorkOrderItem {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    type: 'do_dali',
    opSph: '', opCyl: '', opAxis: '', opAdd: '', opPd: '',
    olSph: '', olCyl: '', olAxis: '', olAdd: '', olPd: '',
    frameModel: '', ownFrame: false, lensType: '', framePrice: '', lensPrice: '',
    inventoryItemIdOp: '', inventoryItemIdOl: '', inventoryItemIdFrame: '',
    opOrdered: false, olOrdered: false, frameOrdered: false,
  };
}

function emptyForm() {
  return {
    customerId: '',
    orderNumber: '',
    receivedAt: new Date().toLocaleDateString('sv-SE'), // rrrr-mm-dd w czasie lokalnym
    pickupDate: '',
    status: 'pending',
    totalAmount: '',
    deposit: '',
    notes: '',
    items: [emptyItem()],
  };
}

export default function WorkOrdersPage() {
  const { t } = useLanguage();
  const orderedLabels: Record<OrderedKey, string> = { opOrdered: 'OP', olOrdered: 'OL', frameOrdered: t('orderedFrame') };
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState(emptyForm());
  // false = kwota całkowita liczona automatycznie z pozycji; true = wpisana ręcznie (np. rabat)
  const [totalManual, setTotalManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', surname: '', phone: '', email: '', smsConsent: true });
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<WorkOrder | null>(null);

  useEffect(() => {
    fetchWorkOrders();
    fetchCustomers();
    fetchInventory();
  }, []);

  async function fetchWorkOrders() {
    try {
      const res = await fetch('/api/work-orders');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkOrders(data.workOrders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCustomers() {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch {}
  }

  async function fetchInventory() {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setInventoryItems(data.items || []);
    } catch {}
  }

  function openAdd() {
    setEditingOrder(null);
    setForm(emptyForm());
    setTotalManual(false);
    setCustomerSearch('');
    setShowNewCustomerForm(false);
    setNewCustomer({ name: '', surname: '', phone: '', email: '', smsConsent: true });
    setShowModal(true);
  }

  function openEdit(order: WorkOrder) {
    setEditingOrder(order);
    // Zapisana kwota różna od sumy pozycji = była wpisana ręcznie, więc jej nie nadpisujemy.
    setTotalManual(
      order.totalAmount != null && order.totalAmount !== '' &&
      Math.round(Number(order.totalAmount) * 100) !== Math.round(itemsTotal(order.items) * 100)
    );
    setForm({
      customerId: order.customerId,
      orderNumber: order.orderNumber,
      receivedAt: order.receivedAt.split('T')[0],
      pickupDate: order.pickupDate ? order.pickupDate.split('T')[0] : '',
      status: order.status,
      totalAmount: order.totalAmount ?? '',
      deposit: order.deposit ?? '',
      notes: order.notes ?? '',
      items: order.items.length > 0 ? order.items.map(i => ({
        id: i.id,
        type: i.type,
        opSph: i.opSph != null ? Number(i.opSph).toFixed(2) : '',
        opCyl: i.opCyl != null ? Number(i.opCyl).toFixed(2) : '',
        opAxis: i.opAxis ?? '',
        opAdd: i.opAdd != null ? Number(i.opAdd).toFixed(2) : '',
        opPd: i.opPd != null ? Number(i.opPd).toFixed(1) : '',
        olSph: i.olSph != null ? Number(i.olSph).toFixed(2) : '',
        olCyl: i.olCyl != null ? Number(i.olCyl).toFixed(2) : '',
        olAxis: i.olAxis ?? '',
        olAdd: i.olAdd != null ? Number(i.olAdd).toFixed(2) : '',
        olPd: i.olPd != null ? Number(i.olPd).toFixed(1) : '',
        frameModel: i.frameModel ?? '', ownFrame: i.ownFrame ?? false, lensType: i.lensType ?? '', framePrice: i.framePrice ?? '', lensPrice: i.lensPrice ?? '',
        inventoryItemIdOp: (i as any).inventoryItemIdOp ?? '', inventoryItemIdOl: (i as any).inventoryItemIdOl ?? '', inventoryItemIdFrame: (i as any).inventoryItemIdFrame ?? '',
        opOrdered: i.opOrdered ?? false, olOrdered: i.olOrdered ?? false, frameOrdered: i.frameOrdered ?? false,
      })) : [emptyItem()],
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingOrder(null);
    setCustomerSearch('');
    setShowNewCustomerForm(false);
    setNewCustomer({ name: '', surname: '', phone: '', email: '', smsConsent: true });
  }

  function setItemField(index: number, field: keyof WorkOrderItem, value: any) {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }

  function setMultipleItemFields(index: number, fields: Partial<WorkOrderItem>) {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...fields };
      return { ...prev, items };
    });
  }

  function addItem() {
    setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function removeItem(index: number) {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }

  const itemsSum = itemsTotal(form.items);
  const autoTotal = hasPrices(form.items) ? itemsSum.toFixed(2) : '';
  const effectiveTotal = totalManual ? String(form.totalAmount ?? '') : autoTotal;
  const amountToPay =
    effectiveTotal !== '' ? Number(effectiveTotal) - (form.deposit ? Number(form.deposit) : 0) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      let customerId = form.customerId;

      // Jeśli formularz nowego klienta jest wypełniony — najpierw utwórz klienta
      if (showNewCustomerForm) {
        if (!newCustomer.name || !newCustomer.surname || !newCustomer.phone) {
          setError(t('nameRequiredError'));
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCustomer),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        customerId = data.customer.id;
        await fetchCustomers();
      }

      if (!customerId) { setError(t('pleaseSelectCustomer')); setSubmitting(false); return; }

      const payload = { ...form, totalAmount: effectiveTotal, customerId };
      const url = '/api/work-orders';
      const method = editingOrder ? 'PATCH' : 'POST';
      const body = editingOrder ? { id: editingOrder.id, ...payload } : payload;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchWorkOrders();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendReviewSms(workOrderId: string) {
    setSendingSmsId(workOrderId);
    try {
      const res = await fetch('/api/work-orders/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send SMS');
      await fetchWorkOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS');
    } finally {
      setSendingSmsId(null);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      const res = await fetch('/api/work-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
      await fetchWorkOrders();
    } catch {
      setError('Failed to update status');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('areYouSureWorkOrder'))) return;
    try {
      const res = await fetch(`/api/work-orders?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await fetchWorkOrders();
    } catch {
      setError('Failed to delete work order');
    }
  }

  function statusLabel(status: string) {
    const s = STATUSES.find(s => s.value === status);
    return s ? t(s.labelKey as any) : status;
  }

  function statusColor(status: string) {
    if (status === 'ready') return 'bg-green-100 text-green-800';
    if (status === 'completed') return 'bg-gray-100 text-gray-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  function typeLabel(type: string) {
    const it = ITEM_TYPES.find(i => i.value === type);
    return it ? t(it.labelKey as any) : type;
  }

  const filtered = workOrders
    .filter(o => filter === 'all' || o.status === filter)
    .filter(o => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q);
    });

  if (loading) return <div className="p-6">{t('loadingWorkOrders')}</div>;

  return (
    <div className="text-gray-900">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('workOrdersTitle')}</h1>
          <p className="text-gray-600">{t('workOrdersSubtitle')}</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('addWorkOrder')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Filter */}
      <div className="mb-4 flex gap-2">
        {[
          { value: 'all', label: t('allOrders') },
          { value: 'pending', label: t('pendingOrders') },
          { value: 'ready', label: t('readyOrders') },
          { value: 'completed', label: t('completedOrders') },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{t('noWorkOrdersFound')}</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('orderNumber')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('customer')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('receivedAt')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pickupDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('orderStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('totalAmount')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setPreviewOrder(order)}
                      className="font-mono text-sm font-medium text-blue-700 hover:underline hover:text-blue-900 text-left"
                    >
                      {order.orderNumber}
                    </button>
                    {orderedParts(order.items, orderedLabels).length > 0 && (
                      <div className="mt-1">
                        <span className="px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-800">
                          {t('awaitingStockBadge')}: {orderedParts(order.items, orderedLabels).join(', ')}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{order.customerName}</div>
                    <div className="text-sm text-gray-500">{formatPhone(order.customerPhone)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {new Date(order.receivedAt).toLocaleDateString('pl-PL')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {order.pickupDate ? new Date(order.pickupDate).toLocaleDateString('pl-PL') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={order.status}
                      onChange={e => handleStatusChange(order.id, e.target.value)}
                      className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${statusColor(order.status)}`}
                    >
                      {STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{t(s.labelKey as any)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {displayTotal(order)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openEdit(order)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        {t('edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(order.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        {t('delete')}
                      </button>
                      {order.reviewSmsStatus === 'sent' ? (
                        <span className="px-3 py-1 text-xs text-green-700 bg-green-100 rounded">
                          {t('reviewSmsSent')}
                        </span>
                      ) : order.reviewSmsStatus === 'failed' ? (
                        <>
                          <span className="px-3 py-1 text-xs text-red-700 bg-red-100 rounded">{t('reviewSmsFailed')}</span>
                          <button
                            onClick={() => handleSendReviewSms(order.id)}
                            disabled={sendingSmsId === order.id}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {sendingSmsId === order.id ? t('sending') : t('sendReviewSms')}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleSendReviewSms(order.id)}
                          disabled={sendingSmsId === order.id}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {sendingSmsId === order.id ? t('sending') : t('sendReviewSms')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview Modal */}
      {previewOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setPreviewOrder(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <span className="font-mono text-lg font-bold text-blue-700">{previewOrder.orderNumber}</span>
              <button onClick={() => setPreviewOrder(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Klient */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase">{t('customer')}</p>
                  <p className="font-medium text-gray-900">{previewOrder.customerName}</p>
                  <p className="text-sm text-gray-500">{formatPhone(previewOrder.customerPhone)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('orderStatus')}</p>
                  <span className={`mt-1 inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColor(previewOrder.status)}`}>
                    {statusLabel(previewOrder.status)}
                  </span>
                </div>
              </div>

              {/* Daty + kwota */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('receivedAt')}</p>
                  <p className="text-gray-900">{new Date(previewOrder.receivedAt).toLocaleDateString('pl-PL')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('pickupDate')}</p>
                  <p className="text-gray-900">{previewOrder.pickupDate ? new Date(previewOrder.pickupDate).toLocaleDateString('pl-PL') : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('totalAmount')}</p>
                  <p className="font-semibold text-gray-900">
                    {displayTotal(previewOrder)}
                  </p>
                  {previewOrder.deposit && (
                    <p className="text-xs text-gray-500">{t('deposit')}: {parseFloat(previewOrder.deposit).toFixed(2)} zł</p>
                  )}
                </div>
              </div>

              {/* Pozycje */}
              {previewOrder.items.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-2">{t('lensItems')}</p>
                  <div className="space-y-2">
                    {previewOrder.items.map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <p className="font-medium text-gray-800">{typeLabel(item.type)}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                          {(item.opSph || item.opCyl) && (
                            <span>OP: {[item.opSph, item.opCyl, item.opAxis && `ax${item.opAxis}`].filter(Boolean).join(' / ')}</span>
                          )}
                          {(item.olSph || item.olCyl) && (
                            <span>OL: {[item.olSph, item.olCyl, item.olAxis && `ax${item.olAxis}`].filter(Boolean).join(' / ')}</span>
                          )}
                          {item.frameModel && <span>{t('frame')}: {item.frameModel}{item.ownFrame ? ` (${t('ownFrame')})` : ''}</span>}
                          {orderedParts([item], orderedLabels).length > 0 && (
                            <span className="text-orange-700">{t('awaitingStockBadge')}: {orderedParts([item], orderedLabels).join(', ')}</span>
                          )}
                          {(item.framePrice || item.lensPrice) && (
                            <span>
                              {item.framePrice ? `${t('frame')}: ${item.framePrice} zł` : ''}
                              {item.framePrice && item.lensPrice ? ' | ' : ''}
                              {item.lensPrice ? `${t('lenses')}: ${item.lensPrice} zł` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notatki */}
              {previewOrder.notes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('notes')}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewOrder.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2">
              <a
                href={`/work-orders/${previewOrder.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800"
              >
                {t('printWorkOrder')}
              </a>
              <button
                onClick={() => { setPreviewOrder(null); openEdit(previewOrder); }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t('edit')}
              </button>
              <button
                onClick={() => setPreviewOrder(null)}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="relative w-full max-w-2xl max-h-[90vh] bg-white shadow-2xl flex flex-col rounded-xl border border-gray-200 mx-4">
          <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold">
              {editingOrder ? t('editWorkOrder') : t('addWorkOrder')}
            </h2>
            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>
              )}

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('customer')} <span className="text-red-500">*</span>
                  </label>

                  {!showNewCustomerForm ? (
                    <div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={t('searchCustomers')}
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500"
                          autoComplete="off"
                        />
                        {customerSearch && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {customers
                              .filter(c => {
                                const q = customerSearch.toLowerCase();
                                return `${c.name} ${c.surname}`.toLowerCase().includes(q) || c.phone.includes(q);
                              })
                              .slice(0, 5)
                              .map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setForm(prev => ({ ...prev, customerId: c.id }));
                                    setCustomerSearch(`${c.name} ${c.surname} — ${c.phone}`);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="font-medium text-gray-900">{c.name} {c.surname}</div>
                                  <div className="text-sm text-gray-500">{formatPhone(c.phone)}</div>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>

                      {form.customerId && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                          <span className="text-sm text-green-900">
                            {t('selectedCustomer')} {customers.find(c => c.id === form.customerId)?.name} {customers.find(c => c.id === form.customerId)?.surname}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setForm(prev => ({ ...prev, customerId: '' })); setCustomerSearch(''); }}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            {t('clear')}
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(true)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        {t('createNewCustomer')}
                      </button>
                    </div>
                  ) : (
                    <div className="border border-gray-300 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium text-gray-900">{t('newCustomer')}</h3>
                        <button
                          type="button"
                          onClick={() => { setShowNewCustomerForm(false); setNewCustomer({ name: '', surname: '', phone: '', email: '', smsConsent: true }); }}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">{t('name')} *</label>
                          <input
                            type="text"
                            value={newCustomer.name}
                            onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                            className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">{t('surname')} *</label>
                          <input
                            type="text"
                            value={newCustomer.surname}
                            onChange={e => setNewCustomer(p => ({ ...p, surname: e.target.value }))}
                            className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">{t('phone')} *</label>
                        <input
                          type="tel"
                          value={newCustomer.phone}
                          onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900"
                          placeholder=""
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">{t('emailOptional')}</label>
                        <input
                          type="email"
                          value={newCustomer.email}
                          onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="wo-smsConsent"
                          checked={newCustomer.smsConsent}
                          onChange={e => setNewCustomer(p => ({ ...p, smsConsent: e.target.checked }))}
                          className="rounded"
                        />
                        <label htmlFor="wo-smsConsent" className="text-xs text-gray-700">{t('smsConsent')}</label>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('orderNumber')}</label>
                  <input
                    type="text"
                    value={form.orderNumber}
                    onChange={e => setForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder={t('orderNumberPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('receivedAt')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.receivedAt}
                    onChange={e => setForm(prev => ({ ...prev, receivedAt: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('pickupDate')}</label>
                  <input
                    type="date"
                    value={form.pickupDate}
                    onChange={e => setForm(prev => ({ ...prev, pickupDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('orderStatus')}</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{t(s.labelKey as any)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('totalAmount')} (zł)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={effectiveTotal}
                    onChange={e => {
                      setTotalManual(true);
                      setForm(prev => ({ ...prev, totalAmount: e.target.value }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('itemsSum')}: {itemsSum.toFixed(2)} zł
                    {totalManual && effectiveTotal !== autoTotal && (
                      <button
                        type="button"
                        onClick={() => setTotalManual(false)}
                        className="ml-2 text-blue-600 hover:underline"
                      >
                        {t('recalcTotal')}
                      </button>
                    )}
                  </p>
                  {amountToPay != null && (
                    <p className="text-sm font-medium text-gray-800 mt-1">
                      {t('amountToPay')}: {amountToPay.toFixed(2)} zł
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('deposit')} (zł)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.deposit}
                    onChange={e => setForm(prev => ({ ...prev, deposit: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="0.00"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('notes')}</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>

              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">{t('orderItems')}</h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {t('addItem')}
                  </button>
                </div>

                <div className="space-y-4">
                  {form.items.map((item, idx) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                          <select
                            value={item.type}
                            onChange={e => setItemField(idx, 'type', e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          >
                            {ITEM_TYPES.map(it => (
                              <option key={it.value} value={it.value}>{t(it.labelKey as any)}</option>
                            ))}
                          </select>
                        </div>
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-sm text-red-500 hover:text-red-700"
                          >
                            {t('removeItem')}
                          </button>
                        )}
                      </div>

                      {/* Prescription table */}
                      {item.type === 'progresywne' ? (
                        <div className="mb-3 space-y-2">
                          {/* Do Dali */}
                          <div className="overflow-x-auto">
                            <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">{t('prescriptionDaliLabel')}</p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-blue-50">
                                  <th className="px-2 py-1 text-left text-xs text-gray-500 w-24"></th>
                                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('sph')}</th>
                                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('cyl')}</th>
                                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('axis')}</th>
                                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('pd')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoPrawe')}</td>
                                  {(['opSph', 'opCyl', 'opAxis', 'opPd'] as const).map(field => (
                                    <td key={field} className="px-1 py-1">
                                      {FIELD_OPTIONS[field] ? (
                                        <select
                                          value={(item as any)[field]}
                                          onChange={e => setItemField(idx, field, e.target.value)}
                                          className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                        >
                                          <option value="">—</option>
                                          {FIELD_OPTIONS[field]!.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input type="number" step="1" min="1" max="180"
                                          value={(item as any)[field]}
                                          onChange={e => setItemField(idx, field, e.target.value)}
                                          className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                          placeholder="—" />
                                      )}
                                    </td>
                                  ))}
                                </tr>
                                <tr>
                                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoLewe')}</td>
                                  {(['olSph', 'olCyl', 'olAxis', 'olPd'] as const).map(field => (
                                    <td key={field} className="px-1 py-1">
                                      {FIELD_OPTIONS[field] ? (
                                        <select
                                          value={(item as any)[field]}
                                          onChange={e => setItemField(idx, field, e.target.value)}
                                          className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                        >
                                          <option value="">—</option>
                                          {FIELD_OPTIONS[field]!.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input type="number" step="1" min="1" max="180"
                                          value={(item as any)[field]}
                                          onChange={e => setItemField(idx, field, e.target.value)}
                                          className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                          placeholder="—" />
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          {/* Do Blizy (Add) */}
                          <div className="overflow-x-auto">
                            <p className="text-xs font-semibold text-green-700 mb-1 uppercase tracking-wide">{t('prescriptionNearLabel')}</p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-green-50">
                                  <th className="px-2 py-1 text-left text-xs text-gray-500 w-24"></th>
                                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('add')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoPrawe')}</td>
                                  <td className="px-1 py-1 w-24">
                                    <select
                                      value={item.opAdd}
                                      onChange={e => setItemField(idx, 'opAdd', e.target.value)}
                                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-green-400"
                                    >
                                      <option value="">—</option>
                                      {ADD_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoLewe')}</td>
                                  <td className="px-1 py-1 w-24">
                                    <select
                                      value={item.olAdd}
                                      onChange={e => setItemField(idx, 'olAdd', e.target.value)}
                                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-green-400"
                                    >
                                      <option value="">—</option>
                                      {ADD_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                      <div className="overflow-x-auto mb-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-2 py-1 text-left text-xs text-gray-500 w-24"></th>
                              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('sph')}</th>
                              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('cyl')}</th>
                              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('axis')}</th>
                              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('add')}</th>
                              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('pd')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoPrawe')}</td>
                              {(['opSph', 'opCyl', 'opAxis', 'opAdd', 'opPd'] as const).map(field => (
                                <td key={field} className="px-1 py-1">
                                  {FIELD_OPTIONS[field] ? (
                                    <select
                                      value={(item as any)[field]}
                                      onChange={e => setItemField(idx, field, e.target.value)}
                                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                    >
                                      <option value="">—</option>
                                      {FIELD_OPTIONS[field]!.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input type="number" step="1" min="1" max="180"
                                      value={(item as any)[field]}
                                      onChange={e => setItemField(idx, field, e.target.value)}
                                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                      placeholder="—" />
                                  )}
                                </td>
                              ))}
                            </tr>
                            <tr>
                              <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoLewe')}</td>
                              {(['olSph', 'olCyl', 'olAxis', 'olAdd', 'olPd'] as const).map(field => (
                                <td key={field} className="px-1 py-1">
                                  {FIELD_OPTIONS[field] ? (
                                    <select
                                      value={(item as any)[field]}
                                      onChange={e => setItemField(idx, field, e.target.value)}
                                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                    >
                                      <option value="">—</option>
                                      {FIELD_OPTIONS[field]!.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input type="number" step="1" min="1" max="180"
                                      value={(item as any)[field]}
                                      onChange={e => setItemField(idx, field, e.target.value)}
                                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
                                      placeholder="—" />
                                  )}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      )}

                      {/* Magazyn — per oko */}
                      {inventoryItems.length > 0 && (
                        <div className="mb-3 space-y-2 border border-gray-100 rounded-lg p-2 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('inventoryLink')}</p>
                          {(['op', 'ol'] as const).map(eye => {
                            const fieldKey = eye === 'op' ? 'inventoryItemIdOp' : 'inventoryItemIdOl';
                            const sphKey = eye === 'op' ? 'opSph' : 'olSph';
                            const cylKey = eye === 'op' ? 'opCyl' : 'olCyl';
                            return (
                              <div key={eye} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`inv-${eye}-${idx}`}
                                  checked={!!item[fieldKey]}
                                  onChange={e => {
                                    if (e.target.checked) return;
                                    const otherKey = eye === 'op' ? 'inventoryItemIdOl' : 'inventoryItemIdOp';
                                    const sum = inventoryPriceSum([item[otherKey]], inventoryItems);
                                    setMultipleItemFields(idx, {
                                      [fieldKey]: '', [sphKey]: '', [cylKey]: '',
                                      lensPrice: sum != null ? sum.toFixed(2) : '',
                                    } as any);
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded shrink-0"
                                />
                                <label htmlFor={`inv-${eye}-${idx}`} className="text-xs text-gray-600 font-medium w-32 shrink-0">
                                  {eye === 'op' ? t('takeFromInventoryOp') : t('takeFromInventoryOl')}
                                </label>
                                <InventorySelect
                                  value={item[fieldKey]}
                                  onChange={() => {}}
                                  onSelectItem={inv => {
                                    const updates: Record<string, string> = {};
                                    const otherKey = eye === 'op' ? 'inventoryItemIdOl' : 'inventoryItemIdOp';
                                    if (inv) {
                                      updates[fieldKey] = inv.id;
                                      // Brak na stanie → domyślnie „do zamówienia” (można odznaczyć).
                                      if (inv.quantity <= 0 && inv.id !== item[fieldKey]) (updates as Record<string, unknown>)[eye === 'op' ? 'opOrdered' : 'olOrdered'] = true;
                                      if (inv.sph != null) updates[sphKey] = Number(inv.sph).toFixed(2);
                                      if (inv.cyl != null) updates[cylKey] = Number(inv.cyl).toFixed(2);
                                    } else {
                                      updates[fieldKey] = '';
                                      updates[sphKey] = '';
                                      updates[cylKey] = '';
                                    }
                                    // Cena szkieł/soczewek = suma cen sztuk dla OP i OL (nie tylko ostatnio wybranej).
                                    const sum = inventoryPriceSum([updates[fieldKey], item[otherKey]], inventoryItems);
                                    if (sum != null) updates['lensPrice'] = sum.toFixed(2);
                                    else if (!inv) updates['lensPrice'] = '';
                                    setMultipleItemFields(idx, updates as any);
                                  }}
                                  items={inventoryItems}
                                  placeholder={t('selectFromInventory')}
                                />
                              </div>
                            );
                          })}
                          {/* Oprawka z magazynu */}
                          {item.type !== 'soczewki_kontaktowe' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`inv-frame-${idx}`}
                                checked={!!item.inventoryItemIdFrame}
                                onChange={e => { if (!e.target.checked) setMultipleItemFields(idx, { inventoryItemIdFrame: '', frameModel: '' }); }}
                                className="w-4 h-4 text-blue-600 rounded shrink-0"
                              />
                              <label htmlFor={`inv-frame-${idx}`} className="text-xs text-gray-600 font-medium w-32 shrink-0">
                                {t('takeFromInventoryFrame')}
                              </label>
                              <InventorySelect
                                value={item.inventoryItemIdFrame}
                                onChange={() => {}}
                                onSelectItem={inv => {
                                  if (inv) {
                                    const updates: Partial<WorkOrderItem> = { inventoryItemIdFrame: inv.id, frameModel: inv.name };
                                    if (inv.quantity <= 0 && inv.id !== item.inventoryItemIdFrame) updates.frameOrdered = true;
                                    if (inv.price != null) updates.framePrice = Number(inv.price).toFixed(2);
                                    setMultipleItemFields(idx, updates);
                                  } else {
                                    setMultipleItemFields(idx, { inventoryItemIdFrame: '', frameModel: '', framePrice: '' });
                                  }
                                }}
                                items={inventoryItems}
                                placeholder={t('selectFromInventory')}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Do zamówienia u dostawcy — osobno dla każdego elementu */}
                      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-orange-800" title={t('awaitingStockHint')}>
                          {t('awaitingStock')}:
                        </span>
                        {ORDERED_KEYS.filter(key => key !== 'frameOrdered' || item.type !== 'soczewki_kontaktowe').map(key => (
                          <label key={key} className="flex items-center gap-1.5 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={item[key]}
                              onChange={e => setItemField(idx, key, e.target.checked)}
                              className="h-4 w-4"
                            />
                            {orderedLabels[key]}
                          </label>
                        ))}
                        <p className="w-full text-xs text-gray-500">{t('awaitingStockHint')}</p>
                      </div>

                      {/* Frame + Lens / Contact Lens */}
                      {item.type === 'soczewki_kontaktowe' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">{t('contactLensModel')}</label>
                            <input
                              type="text"
                              value={item.lensType}
                              onChange={e => setItemField(idx, 'lensType', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                              placeholder="np. Acuvue Oasys 1-Day"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('contactLensPrice')} (zł)</label>
                            <input
                              type="number" step="0.01" min="0"
                              value={item.lensPrice}
                              onChange={e => setItemField(idx, 'lensPrice', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('frameModel')}</label>
                            <input
                              type="text"
                              value={item.frameModel}
                              onChange={e => setItemField(idx, 'frameModel', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                              placeholder="np. Ray-Ban RB2140"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('lensType')}</label>
                            <input
                              type="text"
                              value={item.lensType}
                              onChange={e => setItemField(idx, 'lensType', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                              placeholder="np. organiczne AR"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('framePrice')} (zł)</label>
                            <input
                              type="number" step="0.01" min="0"
                              value={item.framePrice}
                              onChange={e => setItemField(idx, 'framePrice', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('lensPrice')} (zł)</label>
                            <input
                              type="number" step="0.01" min="0"
                              value={item.lensPrice}
                              onChange={e => setItemField(idx, 'lensPrice', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="flex items-center gap-2 col-span-2">
                            <input
                              type="checkbox"
                              id={`ownFrame-${idx}`}
                              checked={item.ownFrame}
                              onChange={e => setItemField(idx, 'ownFrame', e.target.checked)}
                              className="rounded"
                            />
                            <label htmlFor={`ownFrame-${idx}`} className="text-sm text-gray-700">{t('ownFrame')}</label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? t('saving') : editingOrder ? t('update') : t('create')}
                </button>
              </div>
            </form>
        </div>
        </div>
      )}
    </div>
  );
}
