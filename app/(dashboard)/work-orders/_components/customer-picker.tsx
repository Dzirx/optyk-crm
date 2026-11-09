'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useCustomerSearch, type CustomerHit } from '@/lib/hooks/use-customer-search';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';
import { emptyNewCustomer } from '../_lib/helpers';
import type { NewCustomerForm } from '../_lib/types';

interface CustomerPickerProps {
  selectedCustomerName: string;
  customerId: string;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  showNewCustomerForm: boolean;
  setShowNewCustomerForm: (value: boolean) => void;
  newCustomer: NewCustomerForm;
  setNewCustomer: Dispatch<SetStateAction<NewCustomerForm>>;
  onSelectCustomer: (customer: CustomerHit) => void;
  onClearCustomer: () => void;
}

/** Wybór klienta z listy albo formularz nowego klienta. */
export function CustomerPicker({
  selectedCustomerName, customerId, customerSearch, setCustomerSearch, showNewCustomerForm, setShowNewCustomerForm,
  newCustomer, setNewCustomer, onSelectCustomer, onClearCustomer,
}: CustomerPickerProps) {
  const { t } = useLanguage();
  // Lista wyników otwarta tylko podczas pisania; po wyborze klienta zamknięta.
  const [open, setOpen] = useState(false);
  const { results, loading } = useCustomerSearch(customerSearch, open);

  return (
    !showNewCustomerForm ? (
      <div>
        <div className="relative">
          <input
            type="text"
            placeholder={t('searchCustomers')}
            value={customerSearch}
            onChange={e => { setCustomerSearch(e.target.value); setOpen(true); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500"
            autoComplete="off"
          />
          {open && customerSearch.trim() && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-2 text-sm text-gray-500">{t('searching')}</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">{t('noCustomerResults')}</div>
              ) : (
                results.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onSelectCustomer(c); setOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium text-gray-900">{c.name} {c.surname}</div>
                    <div className="text-sm text-gray-500">{formatPhone(c.phone)}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {customerId && (
          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-green-900">
              {t('selectedCustomer')} {selectedCustomerName}
            </span>
            <button
              type="button"
              onClick={() => { onClearCustomer(); setOpen(false); }}
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
            onClick={() => { setShowNewCustomerForm(false); setNewCustomer(emptyNewCustomer()); }}
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
    )
  );
}
