'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';

interface RecentVisit {
  id: string;
  customerName: string;
  visitDate: string;
  visitType: string | null;
  reminderSmsStatus: string | null;
  reviewSmsStatus: string | null;
  reminderSmsDate: string | null;
  reviewSmsDate: string | null;
}

interface ReadyWorkOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  pickupDate: string | null;
  totalAmount: string | null;
}

interface DashboardContentProps {
  userName: string;
  stats: {
    totalCustomers: number;
    visitsToday: number;
    readyOrders: number;
  };
  recentVisits: RecentVisit[];
  readyWorkOrders: ReadyWorkOrder[];
}

const smsStatusColors: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

function SmsBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${smsStatusColors[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  );
}

export function DashboardContent({ userName, stats, recentVisits, readyWorkOrders }: DashboardContentProps) {
  const { t } = useLanguage();

  const firstName = userName.split(' ')[0];

  const today = new Date();
  const dateStr = today.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const statCards = [
    {
      label: t('totalCustomers'),
      value: stats.totalCustomers,
      borderColor: 'border-blue-500',
      textColor: 'text-blue-600',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: t('visitsToday'),
      value: stats.visitsToday,
      borderColor: 'border-purple-500',
      textColor: 'text-purple-600',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: t('readyForPickup'),
      value: stats.readyOrders,
      borderColor: 'border-green-500',
      textColor: 'text-green-600',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('dashboardTitle')}, {firstName}!
        </h1>
        <p className="text-sm text-gray-400 mt-1 capitalize">{dateStr}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white rounded-lg shadow-sm border-l-4 ${card.borderColor} p-5`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className={`text-3xl font-bold mt-2 ${card.textColor}`}>{card.value}</p>
              </div>
              <div className="text-gray-300 mt-1">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Recent Visits */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{t('recentActivity')}</h2>
            <Link href="/visits" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              {t('viewVisits')} →
            </Link>
          </div>
          {recentVisits.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">{t('noVisitsFound')}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentVisits.map((visit) => (
                <li key={visit.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{visit.customerName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(visit.visitDate).toLocaleDateString('pl-PL')}
                        {visit.visitType && <span> · {visit.visitType}</span>}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {visit.reminderSmsDate && visit.reminderSmsStatus && (
                        <SmsBadge status={visit.reminderSmsStatus} label={t('smsReminder')} />
                      )}
                      {visit.reviewSmsDate && visit.reviewSmsStatus && (
                        <SmsBadge status={visit.reviewSmsStatus} label={t('smsReview')} />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ready Work Orders */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{t('readyForPickup')}</h2>
            <Link href="/work-orders" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              {t('viewWorkOrders')} →
            </Link>
          </div>
          {readyWorkOrders.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">{t('noReadyOrdersFound')}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {readyWorkOrders.map((order) => (
                <li key={order.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{order.customerName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        #{order.orderNumber}
                        {order.pickupDate && (
                          <span> · {t('orderDue')}: {new Date(order.pickupDate).toLocaleDateString('pl-PL')}</span>
                        )}
                      </p>
                    </div>
                    {order.totalAmount && (
                      <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                        {Number(order.totalAmount).toFixed(2)} zł
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">{t('quickActions')}</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/visits"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {t('newVisit')}
          </Link>
          <Link
            href="/customers"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            {t('addCustomer')}
          </Link>
          <Link
            href="/work-orders"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {t('addWorkOrder')}
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('settings')}
          </Link>
        </div>
      </div>
    </div>
  );
}
