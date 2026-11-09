'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';

interface Business {
  id: string;
  name: string | null;
  phone: string | null;
  googleReviewUrl: string | null;
  smsProvider: string | null;
  createdAt: string;
  userId: string;
  userName: string;
  userEmail: string;
  customerCount: number;
  accessUntil: string | null;
  windowsDeviceLimit: number;
  windowsDevices: { machineName: string | null; activatedAt: string }[];
}

function accessLabel(accessUntil: string | null): { text: string; className: string } {
  if (!accessUntil) return { text: 'Bez limitu', className: 'bg-green-100 text-green-800' };
  const end = new Date(accessUntil);
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { text: `Zablokowany od ${end.toLocaleDateString('pl-PL')}`, className: 'bg-red-100 text-red-800' };
  return {
    text: `Do ${end.toLocaleDateString('pl-PL')} (${days} ${days === 1 ? 'dzień' : 'dni'})`,
    className: days <= 2 ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800',
  };
}

export default function AdminBusinessesPage() {
  const { t } = useLanguage();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/businesses');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setError(t('adminAccessDenied'));
          return;
        }
        throw new Error(data.error || 'Failed to fetch businesses');
      }

      setBusinesses(data.businesses || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch businesses');
    } finally {
      setLoading(false);
    }
  };

  const changeAccess = async (userId: string, action: 'extend' | 'unlimited' | 'block', days?: number) => {
    if (action === 'block' && !confirm('Zablokować dostęp temu kontu?')) return;
    try {
      const response = await fetch('/api/admin/businesses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, days }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nie udało się zmienić dostępu');
      setBusinesses((list) => list.map((b) => (b.userId === userId ? { ...b, accessUntil: data.accessUntil } : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić dostępu');
    }
  };

  const changeWindows = async (business: Business, action: 'unpinDevices' | 'deviceLimit', limit?: number) => {
    if (action === 'unpinDevices' && !confirm(
      'Odpiąć komputery tego salonu?\n\nSalon będzie mógł aktywować program na nowym komputerze. ' +
      'Program na starym komputerze działa dalej (licencja jest sprawdzana bez internetu).',
    )) return;
    try {
      const response = await fetch('/api/admin/businesses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: business.userId, action, limit }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nie udało się zmienić ustawień Windows');
      setBusinesses((list) => list.map((b) => (b.userId === business.userId ? { ...b, ...data } : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić ustawień Windows');
    }
  };

  const getProviderBadgeColor = (provider: string | null) => {
    if (!provider) return 'bg-gray-100 text-gray-800';
    switch (provider) {
      case 'smsapi': return 'bg-blue-100 text-blue-800';
      case 'smsplanet': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-3xl font-bold text-gray-900">{t('adminAllBusinesses')}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {t('adminAllBusinessesSubtitle')}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Stats */}
      {!loading && !error && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{t('totalBusinesses')}</dt>
                    <dd className="text-3xl font-semibold text-gray-900">{businesses.length}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{t('adminTotalCustomers')}</dt>
                    <dd className="text-3xl font-semibold text-gray-900">
                      {businesses.reduce((sum, b) => sum + b.customerCount, 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{t('adminActiveSmsProviders')}</dt>
                    <dd className="text-3xl font-semibold text-gray-900">
                      {businesses.filter(b => b.smsProvider).length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mt-6 bg-white shadow overflow-hidden rounded-lg">
        {loading ? (
          <div className="p-8 text-center text-gray-500">{t('adminLoadingBusinesses')}</div>
        ) : businesses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {t('adminNoBusinessesFound')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('businesses')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('adminOwner')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('adminContact')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('adminSmsProvider')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('adminCreated')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dostęp</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Windows</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {businesses.map((business) => (
                  <tr key={business.userId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{business.name ?? <span className="text-gray-400">— salon nieutworzony —</span>}</div>
                      <div className="text-sm text-gray-500">{business.phone || t('adminNoPhone')}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{business.userName}</div>
                      <div className="text-sm text-gray-500">{business.userEmail}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {business.googleReviewUrl && <a
                        href={business.googleReviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-900 underline"
                      >
                        {t('adminGoogleReview')}
                      </a>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {business.smsProvider ? (
                        <span className={`px-2 py-1 text-xs rounded-full ${getProviderBadgeColor(business.smsProvider)}`}>
                          {business.smsProvider.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">{t('adminSmsNotConfigured')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{business.customerCount}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(business.createdAt).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const a = accessLabel(business.accessUntil);
                        return <span className={`px-2 py-1 text-xs rounded-full ${a.className}`}>{a.text}</span>;
                      })()}
                      <div className="mt-2 flex gap-1">
                        <button onClick={() => changeAccess(business.userId, 'extend', 30)} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">+30 dni</button>
                        <button onClick={() => changeAccess(business.userId, 'extend', 365)} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">+1 rok</button>
                        <button onClick={() => changeAccess(business.userId, 'unlimited')} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">Bez limitu</button>
                        <button onClick={() => changeAccess(business.userId, 'block')} className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50">Zablokuj</button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">
                        {business.windowsDevices.length} / {business.windowsDeviceLimit}{' '}
                        {business.windowsDeviceLimit === 1 ? 'komputer' : 'komputery'}
                      </div>
                      {business.windowsDevices.map((d, i) => (
                        <div key={i} className="text-xs text-gray-500">
                          {d.machineName || 'komputer'} · {new Date(d.activatedAt).toLocaleDateString('pl-PL')}
                        </div>
                      ))}
                      {business.accessUntil !== null && (
                        <div className="text-xs text-amber-700">Aktywacja po ustawieniu „Bez limitu”</div>
                      )}
                      <div className="mt-2 flex gap-1">
                        {business.windowsDevices.length > 0 && (
                          <button onClick={() => changeWindows(business, 'unpinDevices')} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">Odepnij</button>
                        )}
                        <button onClick={() => changeWindows(business, 'deviceLimit', business.windowsDeviceLimit + 1)} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">Limit +1</button>
                        {business.windowsDeviceLimit > 1 && (
                          <button onClick={() => changeWindows(business, 'deviceLimit', business.windowsDeviceLimit - 1)} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">Limit −1</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
