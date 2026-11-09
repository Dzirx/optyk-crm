'use client';

import { useState, useEffect, useRef } from 'react';
import { Pagination } from '@/components/pagination';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useLanguage } from '@/lib/i18n/language-context';
import { itemsTotal, hasPrices } from '@/lib/work-orders/totals';
import { emptyForm, emptyNewCustomer, orderToForm } from './_lib/helpers';
import type { InventoryItem, WorkOrder } from './_lib/types';
import { OrderFormModal } from './_components/order-form-modal';
import { OrderList } from './_components/order-list';
import { OrderPreviewModal } from './_components/order-preview-modal';

const PAGE_SIZE = 50;

export default function WorkOrdersPage() {
  const { t } = useLanguage();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
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
  // Nazwa wybranego klienta: może go nie być w wynikach wyszukiwania (np. przy edycji zlecenia).
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer());
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<WorkOrder | null>(null);


  // Zmiana frazy albo statusu wraca na stronę 1 (strona jest powiązana z kluczem wyszukiwania).
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const searchKey = `${debouncedSearch}|${filter}`;
  const [pageState, setPageState] = useState({ key: searchKey, page: 1 });
  const page = pageState.key === searchKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: searchKey, page: p });
  const [reloadKey, setReloadKey] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    fetchInventory();
  }, []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (filter !== 'all') params.set('status', filter);
        const res = await fetch(`/api/work-orders?${params}`);
        const data = await res.json();
        if (seq !== requestSeq.current) return; // nowsze żądanie wyprzedziło to
        if (!res.ok) throw new Error(data.error);

        // Strona zniknęła (np. po usunięciu ostatniego zlecenia na niej): wracamy o jedną.
        const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setWorkOrders(data.workOrders || []);
        setTotal(data.total);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPage zależy tylko od searchKey
  }, [page, debouncedSearch, filter, reloadKey]);

  /** Pobiera ponownie bieżącą stronę (po dodaniu, edycji, usunięciu, zmianie statusu, SMS). */
  async function fetchWorkOrders() {
    setReloadKey((k) => k + 1);
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
    setSelectedCustomerName('');
    setShowNewCustomerForm(false);
    setNewCustomer(emptyNewCustomer());
    setShowModal(true);
  }


  function openEdit(order: WorkOrder) {
    setEditingOrder(order);
    // Zapisana kwota różna od sumy pozycji = była wpisana ręcznie, więc jej nie nadpisujemy.
    setTotalManual(
      order.totalAmount != null && order.totalAmount !== '' &&
      Math.round(Number(order.totalAmount) * 100) !== Math.round(itemsTotal(order.items) * 100)
    );
    setForm(orderToForm(order));
    setCustomerSearch('');
    setSelectedCustomerName(order.customerName);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingOrder(null);
    setCustomerSearch('');
    setShowNewCustomerForm(false);
    setNewCustomer(emptyNewCustomer());
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
      }

      if (!customerId) { setError(t('pleaseSelectCustomer')); setSubmitting(false); return; }

      const payload = { ...form, totalAmount: effectiveTotal, customerId };
      const url = editingOrder ? `/api/work-orders/${editingOrder.id}` : '/api/work-orders';
      const method = editingOrder ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const res = await fetch(`/api/work-orders/${workOrderId}/send-sms`, { method: 'POST' });
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
      const res = await fetch(`/api/work-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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
      const res = await fetch(`/api/work-orders/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await fetchWorkOrders();
    } catch {
      setError('Failed to delete work order');
    }
  }

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

      <OrderList
        orders={workOrders}
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        sendingSmsId={sendingSmsId}
        onPreview={setPreviewOrder}
        onEdit={openEdit}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        onSendReviewSms={handleSendReviewSms}
      />

      {total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}

      {previewOrder && (
        <OrderPreviewModal
          order={previewOrder}
          onClose={() => setPreviewOrder(null)}
          onEdit={openEdit}
        />
      )}

      {showModal && (
        <OrderFormModal
          editing={!!editingOrder}
          error={error}
          submitting={submitting}
          form={form}
          setForm={setForm}
          selectedCustomerName={selectedCustomerName}
          setSelectedCustomerName={setSelectedCustomerName}
          inventoryItems={inventoryItems}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
          showNewCustomerForm={showNewCustomerForm}
          setShowNewCustomerForm={setShowNewCustomerForm}
          newCustomer={newCustomer}
          setNewCustomer={setNewCustomer}
          totalManual={totalManual}
          setTotalManual={setTotalManual}
          itemsSum={itemsSum}
          autoTotal={autoTotal}
          effectiveTotal={effectiveTotal}
          amountToPay={amountToPay}
          onSubmit={handleSubmit}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
