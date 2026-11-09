'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';
import { emptyNewCustomerData } from '../_lib/forms';
import type { Customer, NewCustomerData, VisitFormData } from '../_lib/types';

interface VisitCustomerPickerProps {
  customers: Customer[];
  formData: VisitFormData;
  setFormData: Dispatch<SetStateAction<VisitFormData>>;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  showNewCustomerForm: boolean;
  setShowNewCustomerForm: (value: boolean) => void;
  newCustomerData: NewCustomerData;
  setNewCustomerData: Dispatch<SetStateAction<NewCustomerData>>;
  formLoading: boolean;
  onCreateCustomer: () => void;
}

/** Wybór klienta (wyszukiwarka) albo formularz nowego klienta — tylko przy dodawaniu wizyty. */
export function VisitCustomerPicker({
  customers, formData, setFormData, customerSearch, setCustomerSearch, showNewCustomerForm,
  setShowNewCustomerForm, newCustomerData, setNewCustomerData, formLoading, onCreateCustomer,
}: VisitCustomerPickerProps) {
  const { t } = useLanguage();

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(search) ||
      c.surname.toLowerCase().includes(search) ||
      c.phone.includes(search)
    );
  });

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{t('customer')}</label>

      {!showNewCustomerForm ? (
        <div className="relative">
          <input
            type="text"
            placeholder={t('searchCustomers')}
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 bg-white placeholder:text-gray-400"
            style={{ color: '#000000' }}
            autoComplete="off"
          />

          {customerSearch && filteredCustomers.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredCustomers.slice(0, 3).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, customerId: c.id });
                    setCustomerSearch(`${c.name} ${c.surname} - ${c.phone}`);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{c.name} {c.surname}</div>
                  <div className="text-sm text-gray-600">{formatPhone(c.phone)}</div>
                </button>
              ))}
            </div>
          )}

          {formData.customerId && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
              <span className="text-sm text-green-900">
                {t('selectedCustomer')} {customers.find(c => c.id === formData.customerId)?.name} {customers.find(c => c.id === formData.customerId)?.surname}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, customerId: '' });
                  setCustomerSearch('');
                }}
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
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-gray-900">{t('newCustomer')}</h3>
            <button
              type="button"
              onClick={() => {
                setShowNewCustomerForm(false);
                setNewCustomerData(emptyNewCustomerData());
              }}
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
                value={newCustomerData.name}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 bg-white text-sm"
                style={{ color: '#000000' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t('surname')} *</label>
              <input
                type="text"
                value={newCustomerData.surname}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, surname: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 bg-white text-sm"
                style={{ color: '#000000' }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t('phone')} *</label>
            <input
              type="tel"
              value={newCustomerData.phone}
              onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 bg-white text-sm"
              style={{ color: '#000000' }}
              placeholder=""
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t('emailOptional')}</label>
            <input
              type="email"
              value={newCustomerData.email}
              onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 bg-white text-sm"
              style={{ color: '#000000' }}
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="smsConsent"
              checked={newCustomerData.smsConsent}
              onChange={(e) => setNewCustomerData({ ...newCustomerData, smsConsent: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="smsConsent" className="ml-2 block text-xs text-gray-700">
              {t('smsConsent')}
            </label>
          </div>
          <button
            type="button"
            onClick={onCreateCustomer}
            disabled={formLoading}
            className="w-full px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            {formLoading ? t('creating') : t('addCustomer')}
          </button>
        </div>
      )}
    </div>
  );
}
