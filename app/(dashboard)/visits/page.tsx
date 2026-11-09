'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { isoToLocalInput, localInputToIso, toLocalDateStr } from './_lib/dates';
import { emptyFormData, emptyNewCustomerData } from './_lib/forms';
import type { Customer, NewCustomerData, Visit, VisitFormData } from './_lib/types';
import { VisitCalendar } from './_components/visit-calendar';
import { VisitFormModal } from './_components/visit-form-modal';
import { VisitList } from './_components/visit-list';

export default function VisitsPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const filterCustomerId = searchParams?.get('customerId');

  const [visits, setVisits] = useState<Visit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateStr(new Date()));

  const [formData, setFormData] = useState<VisitFormData>(emptyFormData());
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerData, setNewCustomerData] = useState<NewCustomerData>(emptyNewCustomerData());

  useEffect(() => {
    fetchVisits();
    fetchCustomers();
  }, []);

  const fetchVisits = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/visits');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch visits');
      }

      setVisits(data.visits || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch visits');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      if (response.ok) {
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerData.name || !newCustomerData.surname || !newCustomerData.phone) {
      setFormError(t('nameRequiredError'));
      return;
    }

    setFormLoading(true);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomerData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create customer');
      }

      // Refresh customers list
      await fetchCustomers();

      // Select the new customer
      setFormData({ ...formData, customerId: data.customer.id });

      // Reset and hide new customer form
      setNewCustomerData(emptyNewCustomerData());
      setShowNewCustomerForm(false);
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.customerId) {
      setFormError(t('pleaseSelectCustomer'));
      return;
    }

    setFormLoading(true);

    try {
      const response = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          visitDate: localInputToIso(formData.visitDate),
          reminderSmsDate: localInputToIso(formData.reminderSmsDate),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create visit');
      }

      setShowAddModal(false);
      setFormData(emptyFormData());
      setShowNewCustomerForm(false);
      setCustomerSearch('');
      setNewCustomerData(emptyNewCustomerData());
      fetchVisits();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create visit');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVisit) return;

    setFormError('');
    setFormLoading(true);

    try {
      const response = await fetch('/api/visits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingVisit.id,
          ...formData,
          visitDate: localInputToIso(formData.visitDate),
          reminderSmsDate: localInputToIso(formData.reminderSmsDate),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update visit');
      }

      setEditingVisit(null);
      setFormData(emptyFormData());
      fetchVisits();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update visit');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteVisit = async (id: string) => {
    if (!confirm(t('areYouSure'))) return;

    try {
      const response = await fetch(`/api/visits?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete visit');
      }

      fetchVisits();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete visit');
    }
  };

  const handleSendSms = async (visitId: string, smsType: 'reminder' | 'review') => {
    try {
      const response = await fetch('/api/visits/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId, smsType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      fetchVisits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS');
    }
  };

  const openEditModal = (visit: Visit) => {
    setEditingVisit(visit);
    setFormData({
      customerId: visit.customerId,
      visitDate: isoToLocalInput(visit.visitDate),
      visitType: visit.visitType || '',
      notes: visit.notes || '',
      reminderSmsDate: isoToLocalInput(visit.reminderSmsDate),
    });
  };

  const exportToCSV = () => {
    if (filteredVisits.length === 0) {
      alert(t('noVisitsToExport'));
      return;
    }

    const headers = [t('customer'), t('phone'), t('visitDate'), t('type'), t('reminderSMS'), t('status'), t('reviewSMS'), t('status')];
    const rows = filteredVisits.map(v => [
      v.customerName,
      v.customerPhone,
      new Date(v.visitDate).toLocaleString(),
      v.visitType || '-',
      v.reminderSmsDate ? new Date(v.reminderSmsDate).toLocaleString() : '-',
      v.reminderSmsStatus || '-',
      v.reviewSmsDate ? new Date(v.reviewSmsDate).toLocaleString() : '-',
      v.reviewSmsStatus || '-',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `visits_${toLocalDateStr(new Date())}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const goToToday = () => {
    setSelectedDate(toLocalDateStr(new Date()));
  };

  const goToPreviousMonth = () => {
    const date = new Date(selectedDate + 'T12:00:00');
    date.setMonth(date.getMonth() - 1);
    setSelectedDate(toLocalDateStr(date));
  };

  const goToNextMonth = () => {
    const date = new Date(selectedDate + 'T12:00:00');
    date.setMonth(date.getMonth() + 1);
    setSelectedDate(toLocalDateStr(date));
  };

  let filteredVisits = visits;
  if (filterCustomerId) {
    filteredVisits = visits.filter(v => v.customerId === filterCustomerId);
  } else {
    filteredVisits = filteredVisits.filter(v => {
      const visitDate = toLocalDateStr(new Date(v.visitDate));
      return visitDate === selectedDate;
    });
  }

  const closeModal = () => {
    setShowAddModal(false);
    setEditingVisit(null);
    setFormData(emptyFormData());
    setFormError('');
    setShowNewCustomerForm(false);
    setCustomerSearch('');
    setNewCustomerData(emptyNewCustomerData());
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-b border-gray-200 pb-5 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('visitsTitle')}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t('visitsSubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            disabled={filteredVisits.length === 0}
          >
            {t('exportCSV')}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            {t('addVisit')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-4">
        {/* Left side - Calendar */}
        <VisitCalendar
          visits={visits}
          selectedDate={selectedDate}
          filteredCount={filteredVisits.length}
          onSelectDate={setSelectedDate}
          onPreviousMonth={goToPreviousMonth}
          onNextMonth={goToNextMonth}
          onToday={goToToday}
        />

        {/* Right side - Filters and Visits */}
        <div className="flex-1">

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <VisitList
            loading={loading}
            visits={filteredVisits}
            onSendSms={handleSendSms}
            onEdit={openEditModal}
            onDelete={handleDeleteVisit}
          />
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingVisit) && (
        <VisitFormModal
          editing={!!editingVisit}
          customers={customers}
          formData={formData}
          setFormData={setFormData}
          formError={formError}
          formLoading={formLoading}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
          showNewCustomerForm={showNewCustomerForm}
          setShowNewCustomerForm={setShowNewCustomerForm}
          newCustomerData={newCustomerData}
          setNewCustomerData={setNewCustomerData}
          onCreateCustomer={handleCreateCustomer}
          onSubmit={editingVisit ? handleUpdateVisit : handleAddVisit}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
