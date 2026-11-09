'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';
import type { Visit } from '../_lib/types';

interface VisitListProps {
  loading: boolean;
  visits: Visit[];
  onSendSms: (visitId: string, smsType: 'reminder' | 'review') => void;
  onEdit: (visit: Visit) => void;
  onDelete: (id: string) => void;
}

export function VisitList({ loading, visits: filteredVisits, onSendSms, onEdit, onDelete }: VisitListProps) {
  const { t } = useLanguage();

  return (
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
                      <button onClick={() => onSendSms(visit.id, 'reminder')} className="px-3 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
                        {t('sendReminderSms')}
                      </button>
                    </div>
                  ) :!visit.smsConsent ? (
                    <span className="text-gray-400 text-xs">{t('reviewSmsNoConsent')}</span>
                  ) : (
                    <button
                      onClick={() => onSendSms(visit.id, 'reminder')}
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
                      <button onClick={() => onSendSms(visit.id, 'review')} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">
                        {t('sendReviewSms')}
                      </button>
                    </div>
                  ) :!visit.smsConsent ? (
                    <span className="text-gray-400 text-xs">{t('reviewSmsNoConsent')}</span>
                  ) : (
                    <button
                      onClick={() => onSendSms(visit.id, 'review')}
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
                        onClick={() => onEdit(visit)}
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        {t('edit')}
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(visit.id)}
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
  );
}

