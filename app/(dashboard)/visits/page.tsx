'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/pagination';
import { ReviewRequestModal } from '@/components/review-request-modal';
import { useLanguage } from '@/lib/i18n/language-context';
import { visitsLabel } from '@/lib/plural';
import { addDaysIso, dayBounds, formatDatePadded, formatDayHeading, isIsoDay, todayIso } from '@/lib/time';
import { isoToLocalInput, localInputToIso } from './_lib/dates';
import { autoReminderDay, storedReminderDay } from './_lib/reminder';
import { emptyFormData, emptyNewCustomerData } from './_lib/forms';
import type { NewCustomerData, Visit, VisitFormData } from './_lib/types';
import { VisitDayNav } from './_components/visit-day-nav';
import { VisitFormModal } from './_components/visit-form-modal';
import { VisitList } from './_components/visit-list';

const PAGE_SIZE = 50;

export default function VisitsPage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterCustomerId = searchParams?.get('customerId') || null;
  // Wybrany dzień trzymamy w adresie (?day=yyyy-mm-dd); brak lub zła wartość = dziś w strefie salonu.
  const dayParam = searchParams?.get('day') ?? '';
  const day = isIsoDay(dayParam) ? dayParam : todayIso();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [reviewVisit, setReviewVisit] = useState<Visit | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  // Strona widoku „wizyty klienta”; zmiana klienta wraca na stronę 1.
  const [pageState, setPageState] = useState({ key: filterCustomerId, page: 1 });
  const page = pageState.key === filterCustomerId ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterCustomerId, page: p });
  const [customerLabel, setCustomerLabel] = useState('');

  const [formData, setFormData] = useState<VisitFormData>(emptyFormData());
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  // Nazwa wybranego klienta: może go nie być w wynikach wyszukiwania (np. przy edycji wizyty).
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  // Czy salon ma skonfigurowane SMS (klucz API i szablon przypomnienia); null = jeszcze nie wiadomo.
  const [smsReady, setSmsReady] = useState<boolean | null>(null);
  const [autoReminders, setAutoReminders] = useState<boolean | null>(null);
  const [reviewSmsReady, setReviewSmsReady] = useState<boolean | null>(null);
  const [smsGatewayReady, setSmsGatewayReady] = useState<boolean | null>(null);
  const [reminderWindow, setReminderWindow] = useState<{ start: number; end: number } | null>(null);
  const [newCustomerData, setNewCustomerData] = useState<NewCustomerData>(emptyNewCustomerData());

  const setDay = (next: string) => router.replace(`/visits?day=${next}`, { scroll: false });
  const clearCustomerFilter = () => router.replace(`/visits?day=${day}`, { scroll: false });

  // Pobieramy tylko to, co widać: jeden dzień (dokładne granice w strefie salonu)
  // albo jedna strona wizyt wybranego klienta (?customerId=).
  const requestSeq = useRef(0);

  const fetchVisits = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCustomerId) {
        params.set('customerId', filterCustomerId);
        params.set('page', String(page));
        params.set('pageSize', String(PAGE_SIZE));
      } else {
        const { start, end } = dayBounds(day);
        params.set('from', start.toISOString());
        params.set('to', end.toISOString());
      }
      const response = await fetch(`/api/visits?${params}`);
      const data = await response.json();
      if (seq !== requestSeq.current) return; // nowsze żądanie wyprzedziło to

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch visits');
      }

      const found: Visit[] = data.visits || [];
      if (filterCustomerId) {
        const count: number = data.total ?? found.length;
        const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
        if (found.length === 0 && page > lastPage) {
          setPage(lastPage); // np. po usunięciu ostatniej wizyty z ostatniej strony
          return;
        }
        setTotal(count);
        setCustomerLabel(found[0]?.customerName ?? '');
      } else {
        // Wewnątrz dnia: od najwcześniejszej; przy tej samej godzinie stała kolejność po id.
        found.sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.id.localeCompare(b.id));
        setTotal(found.length);
      }
      setVisits(found);
      setError('');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch visits');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, filterCustomerId, page]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/business')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setSmsReady(!!d?.business?.smsReady);
        setAutoReminders(!!d?.business?.autoReminders);
        setReviewSmsReady(!!d?.business?.reviewSmsReady);
        setSmsGatewayReady(!!d?.business?.smsGatewayReady);
        const b = d?.business;
        if (b && typeof b.reminderWindowStart === 'number' && typeof b.reminderWindowEnd === 'number') {
          setReminderWindow({ start: b.reminderWindowStart, end: b.reminderWindowEnd });
        }
      })
      .catch(() => {
        if (!cancelled) setSmsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nazwa klienta do paska filtra, gdy klient nie ma jeszcze wizyt.
  useEffect(() => {
    if (!filterCustomerId || customerLabel) return;
    let cancelled = false;
    fetch(`/api/customers/${filterCustomerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.customer) setCustomerLabel(`${d.customer.name} ${d.customer.surname}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filterCustomerId, customerLabel]);

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

      // Select the new customer
      setFormData({ ...formData, customerId: data.customer.id, smsConsent: data.customer.smsConsent !== false });
      setSelectedCustomerName(`${data.customer.name} ${data.customer.surname}`);

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

  // Dzień przypomnienia wysyłamy tylko, gdy pole jest aktywne (SMS skonfigurowane, klient ze zgodą);
  // wtedy pusty dzień = bez przypomnienia. W przeciwnym razie nie ruszamy zapisanej wartości.
  const visitPayload = () => {
    const { customerId, visitType, notes } = formData;
    const reminderActive = autoReminders === true && smsReady === true && formData.smsConsent;
    return {
      customerId,
      visitType,
      notes,
      visitDate: localInputToIso(formData.visitDate),
      ...(reminderActive ? { reminderSmsDate: formData.reminderSmsDate || null } : {}),
    };
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
        body: JSON.stringify(visitPayload()),
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
      // Nowa wizyta na inny dzień: przechodzimy na ten dzień, żeby nie zniknęła z widoku.
      const newDay = todayIso(new Date(localInputToIso(formData.visitDate) ?? Date.now()));
      if (!filterCustomerId && newDay !== day) setDay(newDay);
      else fetchVisits();
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
      const response = await fetch(`/api/visits/${editingVisit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visitPayload()),
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
      const response = await fetch(`/api/visits/${id}`, {
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
    // Prośba o opinię zawsze przechodzi przez okno potwierdzenia (pokazuje ostatnią prośbę klienta).
    if (smsType === 'review') {
      const visit = visits.find((v) => v.id === visitId);
      if (visit) setReviewVisit(visit);
      return;
    }
    try {
      const response = await fetch(`/api/visits/${visitId}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      fetchVisits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS');
      fetchVisits(); // nieudana wysyłka zapisuje status i powód — pokaż je w wierszu
    }
  };

  const openEditModal = (visit: Visit) => {
    setEditingVisit(visit);
    setSelectedCustomerName(visit.customerName);
    setFormData({
      customerId: visit.customerId,
      visitDate: isoToLocalInput(visit.visitDate),
      visitType: visit.visitType || '',
      notes: visit.notes || '',
      reminderSmsDate: storedReminderDay(visit.reminderSmsDate),
      reminderTouched: false,
      smsConsent: visit.smsConsent,
    });
  };

  const exportToCSV = () => {
    if (visits.length === 0) {
      alert(t('noVisitsToExport'));
      return;
    }

    const headers = [t('customer'), t('phone'), t('visitDate'), t('type'), t('reminderSMS'), t('status'), t('reviewSMS'), t('status')];
    const rows = visits.map(v => [
      v.customerName,
      v.customerPhone,
      new Date(v.visitDate).toLocaleString(),
      v.visitType || '-',
      v.reminderSmsDate ? formatDatePadded(v.reminderSmsDate) : '-',
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
    link.setAttribute('download', `visits_${filterCustomerId ? todayIso() : day}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openAddModal = () => {
    // Dodawanie z widoku dnia: formularz od razu na wybrany dzień (godzina do poprawienia).
    const visitDate = filterCustomerId ? '' : `${day}T09:00`;
    setFormData({ ...emptyFormData(), visitDate, reminderSmsDate: autoReminderDay(visitDate) });
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingVisit(null);
    setFormData(emptyFormData());
    setFormError('');
    setShowNewCustomerForm(false);
    setCustomerSearch('');
    setSelectedCustomerName('');
    setNewCustomerData(emptyNewCustomerData());
  };

  const customerMode = !!filterCustomerId;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-b border-gray-200 pb-5 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('visitsTitle')}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t('visitsSubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
            disabled={visits.length === 0}
          >
            {t('exportCSV')}
          </button>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            {t('addVisit')}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {customerMode ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
            <span className="text-sm text-gray-900">
              {t('visitsOfCustomer')}: <span className="font-semibold">{customerLabel || '…'}</span>
            </span>
            <button
              type="button"
              onClick={clearCustomerFilter}
              className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
            >
              {t('visitsBackToDay')}
            </button>
          </div>
        ) : (
          <VisitDayNav
            day={day}
            heading={formatDayHeading(day, language)}
            onChange={setDay}
            onToday={() => setDay(todayIso())}
            isToday={day === todayIso()}
            previous={addDaysIso(day, -1)}
            next={addDaysIso(day, 1)}
          />
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="mt-4">
          <VisitList
            loading={loading}
            visits={visits}
            showDate={customerMode}
            emptyText={customerMode ? t('visitsNoneForCustomer') : t('visitsNoneThisDay')}
            onAdd={customerMode ? undefined : openAddModal}
            onSendSms={handleSendSms}
            smsReady={smsReady}
            reviewSmsReady={reviewSmsReady}
            smsGatewayReady={smsGatewayReady}
            onEdit={openEditModal}
            onDelete={handleDeleteVisit}
          />
        </div>

        {reviewVisit && (
          <ReviewRequestModal
            customerId={reviewVisit.customerId}
            customerName={reviewVisit.customerName}
            sendUrl={`/api/visits/${reviewVisit.id}/send-sms`}
            sendBody={{ smsType: 'review' }}
            onClose={() => setReviewVisit(null)}
            onSent={fetchVisits}
            onFailed={fetchVisits}
          />
        )}

        {!loading && !customerMode && visits.length > 0 && (
          <p className="mt-3 text-sm text-gray-600">{visitsLabel(total, language)}</p>
        )}
        {customerMode && total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingVisit) && (
        <VisitFormModal
          editing={!!editingVisit}
          smsReady={smsReady}
          autoReminders={autoReminders}
          reminderWindow={reminderWindow}
          reminderLocked={editingVisit?.reminderSmsStatus === 'sent'}
          selectedCustomerName={selectedCustomerName}
          setSelectedCustomerName={setSelectedCustomerName}
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
