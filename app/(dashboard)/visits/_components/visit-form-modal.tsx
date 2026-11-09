'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import type { Customer, NewCustomerData, VisitFormData } from '../_lib/types';
import { VisitCustomerPicker } from './visit-customer-picker';

interface VisitFormModalProps {
  editing: boolean;
  customers: Customer[];
  formData: VisitFormData;
  setFormData: Dispatch<SetStateAction<VisitFormData>>;
  formError: string;
  formLoading: boolean;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  showNewCustomerForm: boolean;
  setShowNewCustomerForm: (value: boolean) => void;
  newCustomerData: NewCustomerData;
  setNewCustomerData: Dispatch<SetStateAction<NewCustomerData>>;
  onCreateCustomer: () => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function VisitFormModal({
  editing, customers, formData, setFormData, formError, formLoading, customerSearch, setCustomerSearch,
  showNewCustomerForm, setShowNewCustomerForm, newCustomerData, setNewCustomerData,
  onCreateCustomer, onSubmit, onClose,
}: VisitFormModalProps) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ backgroundColor: 'rgba(128, 128, 128, 0.5)' }}>
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-900">
          {editing ? t('editVisitTitle') : t('addVisitTitle')}
        </h2>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            {!editing && (
              <VisitCustomerPicker
                customers={customers}
                formData={formData}
                setFormData={setFormData}
                customerSearch={customerSearch}
                setCustomerSearch={setCustomerSearch}
                showNewCustomerForm={showNewCustomerForm}
                setShowNewCustomerForm={setShowNewCustomerForm}
                newCustomerData={newCustomerData}
                setNewCustomerData={setNewCustomerData}
                formLoading={formLoading}
                onCreateCustomer={onCreateCustomer}
              />
            )}

            {editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('customer')}</label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                  style={{ color: '#000000' }}
                  required
                  disabled
                >
                  <option value="">{t('selectCustomerLabel')}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.surname} - {c.phone}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('visitDate')}</label>
              <input
                type="datetime-local"
                value={formData.visitDate}
                onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                style={{ color: '#000000' }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('visitTypeOptional')}</label>
              <input
                type="text"
                value={formData.visitType}
                onChange={(e) => setFormData({ ...formData, visitType: e.target.value })}
                placeholder={t('visitTypePlaceholder')}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white placeholder:text-gray-400"
                style={{ color: '#000000' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('notesOptional')}</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                style={{ color: '#000000' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('reminderSmsDateOptional')}</label>
              <input
                type="datetime-local"
                value={formData.reminderSmsDate}
                onChange={(e) => setFormData({ ...formData, reminderSmsDate: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                style={{ color: '#000000' }}
              />
            </div>
          </div>

          {formError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {formError}
            </div>
          )}

          <div className="mt-6 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {formLoading ? t('creating') : editing ? t('update') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
