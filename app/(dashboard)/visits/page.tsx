'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';

interface Visit {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  smsConsent: boolean;
  visitDate: string;
  visitType: string | null;
  notes: string | null;
  reminderSmsDate: string | null;
  reminderSmsStatus: string | null;
  reminderSmsSentAt: string | null;
  reviewSmsDate: string | null;
  reviewSmsStatus: string | null;
  reviewSmsSentAt: string | null;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
}

// Pole datetime-local nie ma strefy czasowej. Serwer działa w UTC, więc wysyłamy
// pełną datę ISO policzoną w przeglądarce, a do edycji zamieniamy ISO na czas lokalny.
const localInputToIso = (value: string): string | null => (value ? new Date(value).toISOString() : null);
const isoToLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

  const [formData, setFormData] = useState({
    customerId: '',
    visitDate: '',
    visitType: '',
    notes: '',
    reminderSmsDate: '',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    surname: '',
    phone: '',
    email: '',
    smsConsent: true,
  });

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
      setNewCustomerData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
      setShowNewCustomerForm(false);
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setFormLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(search) ||
      c.surname.toLowerCase().includes(search) ||
      c.phone.includes(search)
    );
  });

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
      setFormData({ customerId: '', visitDate: '', visitType: '', notes: '', reminderSmsDate: '' });
      setShowNewCustomerForm(false);
      setCustomerSearch('');
      setNewCustomerData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
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
      setFormData({ customerId: '', visitDate: '', visitType: '', notes: '', reminderSmsDate: '' });
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

  const generateCalendarDays = () => {
    const date = new Date(selectedDate + 'T12:00:00');
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty slots for days before month starts
    for (let i = 0; i < (startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1); i++) {
      days.push(null);
    }

    // Add all days in month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getVisitsCountForDate = (date: Date) => {
    const dateStr = toLocalDateStr(date);
    return visits.filter(v => {
      const visitDate = toLocalDateStr(new Date(v.visitDate));
      return visitDate === dateStr;
    }).length;
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
        <div className="flex-shrink-0">
          <div className="bg-white shadow rounded-lg p-3 w-[280px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={goToPreviousMonth}
                  className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
                  title={t('previousMonth')}
                >
                  ←
                </button>
                <h3 className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  onClick={goToNextMonth}
                  className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
                  title={t('nextMonth')}
                >
                  →
                </button>
              </div>
            </div>

            <div className="flex justify-center mb-2">
              <button
                onClick={goToToday}
                className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
              >
                {t('today')}
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {/* Day headers */}
              {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((day) => (
                <div key={day} className="text-center text-[10px] font-semibold text-gray-600 py-0.5">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {generateCalendarDays().map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="w-8 h-8" />;
                }

                const dateStr = toLocalDateStr(day);
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === toLocalDateStr(new Date());
                const visitsCount = getVisitsCountForDate(day);

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`w-8 h-8 rounded border flex flex-col items-center justify-center transition-all relative text-xs ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white font-bold'
                        : isToday
                        ? 'border-blue-400 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700'
                    }`}
                  >
                    <span className="leading-none">{day.getDate()}</span>
                    {visitsCount > 0 && (
                      <span
                        className={`text-[8px] px-0.5 leading-none rounded-full ${
                          isSelected ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                        }`}
                      >
                        {visitsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected date info */}
            <div className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-center text-gray-600 text-xs">
                <span className="font-semibold text-gray-900">{filteredVisits.length}</span> {filteredVisits.length === 1 ? t('visit') : t('visitsPlural')} {t('on')}{' '}
                <span className="font-semibold text-blue-600">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Right side - Filters and Visits */}
        <div className="flex-1">

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="bg-white shadow rounded-lg overflow-x-auto overflow-y-auto max-h-[600px]">
        {loading ? (
          <div className="p-8 text-center text-gray-500">{t('loadingVisits')}</div>
        ) : filteredVisits.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {t('noVisitsFound')}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('customer')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('visitDate')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('type')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reminderSMS')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('reviewSMS')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVisits.map((visit) => (
                <tr key={visit.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{visit.customerName}</div>
                    <div className="text-sm text-gray-500">{formatPhone(visit.customerPhone)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(visit.visitDate).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {visit.visitType || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {visit.reminderSmsStatus === 'sent' ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        {t('reminderSmsSent')}
                      </span>
                    ) : visit.reminderSmsStatus === 'failed' ? (
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">{t('reminderSmsFailed')}</span>
                        <button onClick={() => handleSendSms(visit.id, 'reminder')} className="px-3 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
                          {t('sendReminderSms')}
                        </button>
                      </div>
                    ) :!visit.smsConsent ? (
                      <span className="text-gray-400 text-xs">{t('reviewSmsNoConsent')}</span>
                    ) : (
                      <button
                        onClick={() => handleSendSms(visit.id, 'reminder')}
                        className="px-3 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
                      >
                        {t('sendReminderSms')}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {visit.reviewSmsStatus === 'sent' ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        {t('reviewSmsSent')}
                      </span>
                    ) : visit.reviewSmsStatus === 'failed' ? (
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">{t('reviewSmsFailed')}</span>
                        <button onClick={() => handleSendSms(visit.id, 'review')} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">
                          {t('sendReviewSms')}
                        </button>
                      </div>
                    ) :!visit.smsConsent ? (
                      <span className="text-gray-400 text-xs">{t('reviewSmsNoConsent')}</span>
                    ) : (
                      <button
                        onClick={() => handleSendSms(visit.id, 'review')}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        {t('sendReviewSms')}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      {visit.reminderSmsStatus !== 'sent' && visit.reviewSmsStatus !== 'sent' && (
                        <button
                          onClick={() => openEditModal(visit)}
                          className="text-yellow-600 hover:text-yellow-900"
                        >
                          {t('edit')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteVisit(visit.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingVisit) && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ backgroundColor: 'rgba(128, 128, 128, 0.5)' }}>
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {editingVisit ? t('editVisitTitle') : t('addVisitTitle')}
            </h2>
            <form onSubmit={editingVisit ? handleUpdateVisit : handleAddVisit}>
              <div className="space-y-4">
                {!editingVisit && (
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
                              setNewCustomerData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
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
                          onClick={handleCreateCustomer}
                          disabled={formLoading}
                          className="w-full px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                          {formLoading ? t('creating') : t('addCustomer')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {editingVisit && (
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
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingVisit(null);
                    setFormData({ customerId: '', visitDate: '', visitType: '', notes: '', reminderSmsDate: '' });
                    setFormError('');
                    setShowNewCustomerForm(false);
                    setCustomerSearch('');
                    setNewCustomerData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {formLoading ? t('creating') : editingVisit ? t('update') : t('create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
