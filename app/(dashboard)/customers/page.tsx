'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { Pagination } from '@/components/pagination';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatPhone as formatPhoneDisplay } from '@/lib/phone';

interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
  email: string | null;
  smsConsent: boolean;
  createdAt: string;
  visitCount?: number;
}

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'consented' | 'not-consented'>('all');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, consented: 0, notConsented: 0 });
  // Zmiana frazy albo filtra wraca na stronę 1 (strona jest powiązana z kluczem wyszukiwania).
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const searchKey = `${debouncedSearch}|${filter}`;
  const [pageState, setPageState] = useState({ key: searchKey, page: 1 });
  const page = pageState.key === searchKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: searchKey, page: p });
  const [reloadKey, setReloadKey] = useState(0);
  const requestSeq = useRef(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    phone: '',
    email: '',
    smsConsent: true,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    const seq = ++requestSeq.current;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (filter !== 'all') params.set('smsConsent', filter === 'consented' ? 'true' : 'false');
        const response = await fetch(`/api/customers?${params}`);
        const data = await response.json();
        if (seq !== requestSeq.current) return; // nowsze żądanie wyprzedziło to

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch customers');
        }

        // Strona zniknęła (np. po usunięciu ostatniego klienta na niej): wracamy o jedną.
        const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setCustomers(data.customers || []);
        setTotal(data.total);
        setCounts(data.counts);
        setError('');
        setLoading(false);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch customers');
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPage zależy tylko od searchKey
  }, [page, debouncedSearch, filter, reloadKey]);

  const fetchCustomers = () => setReloadKey((k) => k + 1);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, phone: formData.phone.trim().replace(/\s/g, '') }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create customer');
      }

      setShowAddModal(false);
      setFormData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
      fetchCustomers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    setFormError('');
    setFormLoading(true);

    try {
      const response = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          phone: formData.phone.trim().replace(/\s/g, ''),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update customer');
      }

      setEditingCustomer(null);
      setFormData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
      fetchCustomers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update customer');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm(t('areYouSureDeleteAllVisits'))) return;

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete customer');
      }

      fetchCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete customer');
    }
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      surname: customer.surname,
      phone: formatPhoneDisplay(customer.phone),
      email: customer.email || '',
      smsConsent: customer.smsConsent,
    });
  };

  const exportToCSV = async () => {
    if (total === 0) {
      alert(t('noCustomersToExport'));
      return;
    }

    // Eksport obejmuje wszystkich pasujących klientów (bez `page`), nie tylko bieżącą stronę.
    let all: Customer[];
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (filter !== 'all') params.set('smsConsent', filter === 'consented' ? 'true' : 'false');
      const response = await fetch(`/api/customers?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch customers');
      all = data.customers || [];
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch customers');
      return;
    }

    const headers = [t('name'), t('surname'), t('phone'), t('email'), t('smsConsent'), t('visitsCount')];
    const rows = all.map(c => [
      c.name,
      c.surname,
      c.phone,
      c.email || '',
      c.smsConsent ? t('yes') : t('no'),
      c.visitCount || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `customers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-b border-gray-200 pb-5 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('customersTitle')}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t('customersSubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            disabled={total === 0}
          >
            {t('exportCSV')}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            {t('addCustomer')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mt-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchCustomersList')}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Filter */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-md ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          {t('all')} ({counts.all})
        </button>
        <button
          onClick={() => setFilter('consented')}
          className={`px-4 py-2 rounded-md ${filter === 'consented' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          {t('smsConsentFilter')} ({counts.consented})
        </button>
        <button
          onClick={() => setFilter('not-consented')}
          className={`px-4 py-2 rounded-md ${filter === 'not-consented' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          {t('noConsentFilter')} ({counts.notConsented})
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="mt-6 bg-white shadow overflow-hidden rounded-lg">
        {loading ? (
          <div className="p-8 text-center text-gray-500">{t('loadingCustomers')}</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {t('noCustomersFound')}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('name')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('phone')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('email')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('smsConsent')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('visitsCount')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {customer.name} {customer.surname}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatPhoneDisplay(customer.phone)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {customer.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${customer.smsConsent ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {customer.smsConsent ? t('yes') : t('no')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {customer.visitCount || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <Link
                        href={`/visits?customerId=${customer.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {t('viewVisits')}
                      </Link>
                      <button
                        onClick={() => openEditModal(customer)}
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        {t('edit')}
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(customer.id)}
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

      {total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}

      {/* Add/Edit Modal */}
      {(showAddModal || editingCustomer) && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ backgroundColor: 'rgba(128, 128, 128, 0.5)' }}>
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {editingCustomer ? t('editCustomerTitle') : t('addCustomerTitle')}
            </h2>
            <form onSubmit={editingCustomer ? handleUpdateCustomer : handleAddCustomer}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('name')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                    style={{ color: '#000000' }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('surname')}</label>
                  <input
                    type="text"
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                    style={{ color: '#000000' }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('phone')}</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: formatPhoneDisplay(e.target.value) })}
                    placeholder=""
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white placeholder:text-gray-400"
                    style={{ color: '#000000' }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('emailOptional')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
                    style={{ color: '#000000' }}
                  />
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.smsConsent}
                      onChange={(e) => setFormData({ ...formData, smsConsent: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">{t('smsConsent')}</span>
                  </label>
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
                    setEditingCustomer(null);
                    setFormData({ name: '', surname: '', phone: '', email: '', smsConsent: true });
                    setFormError('');
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
                  {formLoading ? t('saving') : editingCustomer ? t('update') : t('create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
