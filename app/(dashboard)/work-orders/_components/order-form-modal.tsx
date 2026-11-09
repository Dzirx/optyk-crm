'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { STATUSES } from '../_lib/constants';
import { emptyItem } from '../_lib/helpers';
import type {
  InventoryItem, NewCustomerForm, SetItemField, SetItemFields, WorkOrderForm,
} from '../_lib/types';
import { CustomerPicker } from './customer-picker';
import { OrderItemEditor } from './order-item-editor';

interface OrderFormModalProps {
  editing: boolean;
  error: string;
  submitting: boolean;
  form: WorkOrderForm;
  setForm: Dispatch<SetStateAction<WorkOrderForm>>;
  selectedCustomerName: string;
  setSelectedCustomerName: (value: string) => void;
  inventoryItems: InventoryItem[];
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  showNewCustomerForm: boolean;
  setShowNewCustomerForm: (value: boolean) => void;
  newCustomer: NewCustomerForm;
  setNewCustomer: Dispatch<SetStateAction<NewCustomerForm>>;
  // Kwoty: patrz totals w page.tsx (itemsSum, autoTotal, effectiveTotal, amountToPay).
  totalManual: boolean;
  setTotalManual: (value: boolean) => void;
  itemsSum: number;
  autoTotal: string;
  effectiveTotal: string;
  amountToPay: number | null;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function OrderFormModal({
  editing, error, submitting, form, setForm, selectedCustomerName, setSelectedCustomerName, inventoryItems,
  customerSearch, setCustomerSearch, showNewCustomerForm, setShowNewCustomerForm, newCustomer, setNewCustomer,
  totalManual, setTotalManual, itemsSum, autoTotal, effectiveTotal, amountToPay, onSubmit, onClose,
}: OrderFormModalProps) {
  const { t } = useLanguage();

  const setItemField: SetItemField = (index, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const setMultipleItemFields: SetItemFields = (index, fields) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...fields };
      return { ...prev, items };
    });
  };

  function addItem() {
    setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function removeItem(index: number) {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="relative w-full max-w-2xl max-h-[90vh] bg-white shadow-2xl flex flex-col rounded-xl border border-gray-200 mx-4">
      <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
        <h2 className="text-lg font-semibold">
          {editing ? t('editWorkOrder') : t('addWorkOrder')}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('customer')} <span className="text-red-500">*</span>
              </label>

              <CustomerPicker
                selectedCustomerName={selectedCustomerName}
                customerId={form.customerId}
                customerSearch={customerSearch}
                setCustomerSearch={setCustomerSearch}
                showNewCustomerForm={showNewCustomerForm}
                setShowNewCustomerForm={setShowNewCustomerForm}
                newCustomer={newCustomer}
                setNewCustomer={setNewCustomer}
                onSelectCustomer={c => {
                  setForm(prev => ({ ...prev, customerId: c.id }));
                  setCustomerSearch(`${c.name} ${c.surname} — ${c.phone}`);
                  setSelectedCustomerName(`${c.name} ${c.surname}`);
                }}
                onClearCustomer={() => { setForm(prev => ({ ...prev, customerId: '' })); setCustomerSearch(''); setSelectedCustomerName(''); }}
              />
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
                  <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
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
              <OrderItemEditor
                key={item.id}
                item={item}
                idx={idx}
                canRemove={form.items.length > 1}
                inventoryItems={inventoryItems}
                setItemField={setItemField}
                setMultipleItemFields={setMultipleItemFields}
                onRemove={removeItem}
              />
            ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? t('saving') : editing ? t('update') : t('create')}
            </button>
          </div>
        </form>
    </div>
    </div>
  );
}
