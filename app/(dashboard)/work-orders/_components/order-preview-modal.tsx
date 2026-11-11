'use client';

import { SmsFailureNote } from '@/components/sms-failure-note';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';
import { formatPln } from '@/lib/money';
import { formatDateTimePadded } from '@/lib/time';
import { ITEM_TYPES, STATUSES } from '../_lib/constants';
import { displayTotal, orderedLabelsFor, orderedParts, previewElements, showsAwaiting, statusColor } from '../_lib/helpers';
import type { WorkOrder } from '../_lib/types';

interface OrderPreviewModalProps {
  order: WorkOrder;
  onClose: () => void;
  onEdit: (order: WorkOrder) => void;
}

export function OrderPreviewModal({ order: previewOrder, onClose, onEdit }: OrderPreviewModalProps) {
  const { t } = useLanguage();
  const orderedLabels = orderedLabelsFor(t);

  function statusLabel(status: string) {
    const s = STATUSES.find(s => s.value === status);
    return s ? t(s.labelKey) : status;
  }

  function typeLabel(type: string) {
    const it = ITEM_TYPES.find(i => i.value === type);
    return it ? t(it.labelKey) : type;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <span className="font-mono text-lg font-bold text-blue-700">{previewOrder.orderNumber}</span>
          <button onClick={() => onClose()} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Klient */}
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase">{t('customer')}</p>
              <p className="font-medium text-gray-900">{previewOrder.customerName}</p>
              <p className="text-sm text-gray-500">{formatPhone(previewOrder.customerPhone)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('orderStatus')}</p>
              <span className={`mt-1 inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColor(previewOrder.status)}`}>
                {statusLabel(previewOrder.status)}
              </span>
            </div>
          </div>

          {/* Daty + kwota */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('receivedAt')}</p>
              <p className="text-gray-900">{new Date(previewOrder.receivedAt).toLocaleDateString('pl-PL')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('pickupDate')}</p>
              <p className="text-gray-900">{previewOrder.pickupDate ? new Date(previewOrder.pickupDate).toLocaleDateString('pl-PL') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('totalAmount')}</p>
              <p className="font-semibold text-gray-900">
                {displayTotal(previewOrder)}
              </p>
              {previewOrder.deposit && (
                <p className="text-xs text-gray-500">{t('deposit')}: {formatPln(parseFloat(previewOrder.deposit))}</p>
              )}
            </div>
          </div>

          {/* Pozycje */}
          {previewOrder.items.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2">{t('lensItems')}</p>
              <div className="space-y-2">
                {previewOrder.items.map((item, i) => (
                  <div key={item.id ?? i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <p className="font-medium text-gray-800">{typeLabel(item.type)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                      {(item.opSph || item.opCyl) && (
                        <span>OP: {[item.opSph, item.opCyl, item.opAxis && `ax${item.opAxis}`].filter(Boolean).join(' / ')}</span>
                      )}
                      {(item.olSph || item.olCyl) && (
                        <span>OL: {[item.olSph, item.olCyl, item.olAxis && `ax${item.olAxis}`].filter(Boolean).join(' / ')}</span>
                      )}
                      {showsAwaiting(previewOrder.status) && orderedParts([item], orderedLabels).length > 0 && (
                        <span className="text-orange-700">{t('awaitingStockBadge')}: {orderedParts([item], orderedLabels).join(', ')}</span>
                      )}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
                      {previewElements(item, t).map(row => (
                        <li key={row.label} className="flex flex-wrap gap-x-2">
                          <span className="w-24 shrink-0 text-gray-500">{row.label}</span>
                          <span>{row.text}</span>
                          {row.price && <span className="ml-auto">{formatPln(Number(row.price))}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prośba o opinię */}
          {previewOrder.reviewSmsStatus === 'sent' && (
            <p className="text-sm">
              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">{t('reviewSmsSent')}</span>
              {previewOrder.reviewSmsSentAt && (
                <span data-testid="preview-review-sent-at" className="ml-2 text-xs text-gray-500">
                  {t('smsSentOn')} {formatDateTimePadded(previewOrder.reviewSmsSentAt)}
                </span>
              )}
            </p>
          )}

          {previewOrder.reviewSmsStatus === 'failed' && (
            <div className="text-sm">
              <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">{t('reviewSmsFailed')}</span>
              <div className="mt-1"><SmsFailureNote kind="preview-review" failure={previewOrder.reviewSmsFailure} /></div>
            </div>
          )}

          {/* Notatki */}
          {previewOrder.notes && (
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('notes')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewOrder.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <a
            href={`/work-orders/${previewOrder.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800"
          >
            {t('printWorkOrder')}
          </a>
          <button
            onClick={() => { onClose(); onEdit(previewOrder); }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t('edit')}
          </button>
          <button
            onClick={() => onClose()}
            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
