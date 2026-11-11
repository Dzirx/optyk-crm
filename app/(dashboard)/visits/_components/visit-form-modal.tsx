'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { autoReminderDay } from '../_lib/reminder';
import type { NewCustomerData, VisitFormData } from '../_lib/types';
import { VisitCustomerPicker } from './visit-customer-picker';

interface VisitFormModalProps {
  editing: boolean;
  selectedCustomerName: string;
  setSelectedCustomerName: (value: string) => void;
  // null = jeszcze nie wiadomo (trwa pobieranie ustawień salonu).
  smsReady: boolean | null;
  // Automatyczne przypomnienia salonu (false = wysyłka ręczna, pole ukryte).
  autoReminders: boolean | null;
  // Okno wysyłki przypomnień salonu (minuty od północy), do podpowiedzi pod polem.
  reminderWindow: { start: number; end: number } | null;
  // Wysłane przypomnienie nie może już zmienić dnia.
  reminderLocked: boolean;
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

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function VisitFormModal({
  editing, smsReady, autoReminders, reminderWindow, reminderLocked, selectedCustomerName, setSelectedCustomerName, formData, setFormData, formError, formLoading, customerSearch, setCustomerSearch,
  showNewCustomerForm, setShowNewCustomerForm, newCustomerData, setNewCustomerData,
  onCreateCustomer, onSubmit, onClose,
}: VisitFormModalProps) {
  const { t } = useLanguage();
  const reminderDisabled = smsReady !== true || !formData.smsConsent;

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
                selectedCustomerName={selectedCustomerName}
                setSelectedCustomerName={setSelectedCustomerName}
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
                <input
                  type="text"
                  value={selectedCustomerName}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                  style={{ color: '#000000' }}
                  readOnly
                  disabled
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('visitDate')}</label>
              <input
                type="datetime-local"
                value={formData.visitDate}
                onChange={(e) => {
                  const visitDate = e.target.value;
                  // Dzień przypomnienia podąża za datą wizyty, dopóki użytkownik go nie zmienił.
                  const follow = !formData.reminderTouched && !reminderLocked;
                  setFormData({ ...formData, visitDate, ...(follow ? { reminderSmsDate: autoReminderDay(visitDate) } : {}) });
                }}
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
            {autoReminders === false ? (
              <p data-testid="auto-reminders-off" className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
                {t('autoRemindersOffInForm')}
              </p>
            ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('reminderSmsDateOptional')}</label>
              <input
                type="date"
                value={reminderDisabled ? '' : formData.reminderSmsDate}
                onChange={(e) => setFormData({ ...formData, reminderSmsDate: e.target.value, reminderTouched: true })}
                disabled={reminderDisabled || reminderLocked}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                style={{ color: '#000000' }}
              />
              {smsReady === false && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('reminderNeedsSmsSetup')}{' '}
                  <Link href="/settings" className="text-blue-600 hover:text-blue-800 underline">{t('settings')}</Link>
                </p>
              )}
              {smsReady !== false && !formData.smsConsent && (
                <p className="mt-1 text-xs text-gray-500">{t('reminderNoCustomerConsent')}</p>
              )}
              {!reminderDisabled && !reminderLocked && formData.reminderSmsDate && reminderWindow && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('reminderSendsBetween')} {hhmm(reminderWindow.start)}–{hhmm(reminderWindow.end)}
                </p>
              )}
            </div>
            )}
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
