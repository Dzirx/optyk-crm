'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';
import { STATUSES } from '../_lib/constants';
import { displayTotal, orderedLabelsFor, orderedParts, statusColor } from '../_lib/helpers';
import type { WorkOrder } from '../_lib/types';

interface OrderListProps {
  orders: WorkOrder[];
  search: string;
  onSearchChange: (value: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  sendingSmsId: string | null;
  onPreview: (order: WorkOrder) => void;
  onEdit: (order: WorkOrder) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onSendReviewSms: (id: string) => void;
}

export function OrderList({
  orders: filtered, search, onSearchChange, filter, onFilterChange, sendingSmsId,
  onPreview, onEdit, onDelete, onStatusChange, onSendReviewSms,
}: OrderListProps) {
  const { t } = useLanguage();
  const orderedLabels = orderedLabelsFor(t);

  return (
    <>
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Filter */}
      <div className="mb-4 flex gap-2">
        {[
          { value: 'all', label: t('allOrders') },
          { value: 'pending', label: t('pendingOrders') },
          { value: 'ready', label: t('readyOrders') },
          { value: 'completed', label: t('completedOrders') },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{t('noWorkOrdersFound')}</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('orderNumber')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('customer')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('receivedAt')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pickupDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('orderStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('totalAmount')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onPreview(order)}
                      className="font-mono text-sm font-medium text-blue-700 hover:underline hover:text-blue-900 text-left"
                    >
                      {order.orderNumber}
                    </button>
                    {orderedParts(order.items, orderedLabels).length > 0 && (
                      <div className="mt-1">
                        <span className="px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-800">
                          {t('awaitingStockBadge')}: {orderedParts(order.items, orderedLabels).join(', ')}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{order.customerName}</div>
                    <div className="text-sm text-gray-500">{formatPhone(order.customerPhone)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {new Date(order.receivedAt).toLocaleDateString('pl-PL')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {order.pickupDate ? new Date(order.pickupDate).toLocaleDateString('pl-PL') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={order.status}
                      onChange={e => onStatusChange(order.id, e.target.value)}
                      className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${statusColor(order.status)}`}
                    >
                      {STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {displayTotal(order)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onEdit(order)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        {t('edit')}
                      </button>
                      <button
                        onClick={() => onDelete(order.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        {t('delete')}
                      </button>
                      {order.reviewSmsStatus === 'sent' ? (
                        <span className="px-3 py-1 text-xs text-green-700 bg-green-100 rounded">
                          {t('reviewSmsSent')}
                        </span>
                      ) : order.reviewSmsStatus === 'failed' ? (
                        <>
                          <span className="px-3 py-1 text-xs text-red-700 bg-red-100 rounded">{t('reviewSmsFailed')}</span>
                          <button
                            onClick={() => onSendReviewSms(order.id)}
                            disabled={sendingSmsId === order.id}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {sendingSmsId === order.id ? t('sending') : t('sendReviewSms')}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onSendReviewSms(order.id)}
                          disabled={sendingSmsId === order.id}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {sendingSmsId === order.id ? t('sending') : t('sendReviewSms')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
