'use client';

import type React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatPhone } from '@/lib/phone';
import { formatDateTimePadded, formatDateTimePl, formatTimePl } from '@/lib/time';
import { SmsFailureCard } from '@/components/sms-failure-note';
import type { Visit } from '../_lib/types';

interface VisitListProps {
  loading: boolean;
  visits: Visit[];
  /** Pokaż pełną datę (widok wizyt klienta); inaczej tylko godzinę (widok dnia). */
  showDate: boolean;
  emptyText: string;
  /** Przycisk „Dodaj wizytę” w pustym stanie (brak = bez przycisku). */
  onAdd?: () => void;
  onSendSms: (visitId: string, smsType: 'reminder' | 'review') => void;
  /** Czy salon ma bramkę SMS i szablon przypomnienia / opinii (null = jeszcze nie wiadomo). */
  smsReady?: boolean | null;
  reviewSmsReady?: boolean | null;
  /** Czy jest bramka SMS (dostawca i klucz API); pozwala podać dokładny powód. */
  smsGatewayReady?: boolean | null;
  onEdit: (visit: Visit) => void;
  onDelete: (id: string) => void;
}

type SmsKind = 'reminder' | 'review';

function SmsCell({ visit, kind, onSend, ready, gatewayReady }: { visit: Visit; kind: SmsKind; onSend: (id: string, kind: SmsKind) => void; ready?: boolean | null; gatewayReady?: boolean | null }) {
  const { t } = useLanguage();
  const status = kind === 'reminder' ? visit.reminderSmsStatus : visit.reviewSmsStatus;
  const sentLabel = t(kind === 'reminder' ? 'reminderSmsSent' : 'reviewSmsSent');
  const sendLabel = t(kind === 'reminder' ? 'sendReminderSms' : 'sendReviewSms');
  const buttonColor = kind === 'reminder' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700';
  const notReady = ready === false;
  const button = notReady ? (
    <>
      <button disabled className="px-3 py-1 text-xs rounded-md bg-gray-200 text-gray-400 cursor-not-allowed">
        {sendLabel}
      </button>
      <span data-testid={`${kind}-not-ready`} className="max-w-[14rem] text-[11px] leading-snug text-gray-500">
        {t(gatewayReady === false ? 'smsSendNeedsApiKey' : kind === 'reminder' ? 'smsSendNeedsReminderTemplate' : 'smsSendNeedsReviewTemplate')}{' '}
        <Link href="/settings" className="font-medium text-blue-700 hover:underline whitespace-nowrap">{t('smsFailureOpenSettings')} →</Link>
      </span>
    </>
  ) : (
    <button onClick={() => onSend(visit.id, kind)} className={`px-3 py-1 text-xs text-white rounded-md ${buttonColor}`}>
      {sendLabel}
    </button>
  );

  const title = t(kind === 'reminder' ? 'smsColumnReminder' : 'smsColumnReview');
  const savedFailure = kind === 'reminder' ? visit.reminderSmsFailure : visit.reviewSmsFailure;
  // Błąd konfiguracji pokazujemy według obecnego stanu Ustawień (np. brak klucza API), nie stanu z chwili wysyłki.
  const failure = savedFailure?.isConfig && notReady
    ? { ...savedFailure, reasonCode: gatewayReady === false ? 'not_configured' : 'no_template' }
    : savedFailure;
  const sentAt = kind === 'reminder' ? visit.reminderSmsSentAt : visit.reviewSmsSentAt;

  // Przypomnienie po rozpoczęciu wizyty nie ma sensu: bez przycisku i bez „Wyślij ponownie”.
  const visitPassed = kind === 'reminder' && new Date(visit.visitDate).getTime() <= Date.now();

  let statusLine: React.ReactNode = null;
  let showButton = visit.smsConsent && !visitPassed;
  if (status === 'sent') {
    statusLine = (
      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
        {sentLabel}
        {sentAt && (
          <span data-testid={`${kind}-sent-at`} className="ml-1 text-green-700/80">
            {formatDateTimePadded(sentAt)}
          </span>
        )}
      </span>
    );
    showButton = kind === 'review' && visit.smsConsent; // przypomnienie wysyłamy raz
  } else if (status === 'failed') {
    statusLine = (
      <SmsFailureCard
        kind={kind}
        title={t(kind === 'reminder' ? 'reminderSmsFailed' : 'reviewSmsFailed')}
        failure={failure}
        noConsent={!visit.smsConsent}
        onRetry={visit.smsConsent && !notReady && !visitPassed && failure?.reasonCode !== 'expired' ? () => onSend(visit.id, kind) : undefined}
      />
    );
    showButton = false; // „Wyślij ponownie” jest w ramce
  } else if (!visit.smsConsent) {
    statusLine = <span className="text-xs text-gray-400">{t('reviewSmsNoConsent')}</span>;
  } else if (visitPassed) {
    statusLine = <span data-testid="reminder-visit-passed" className="text-xs text-gray-400">{t('reminderVisitPassed')}</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1 md:w-56">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{title}</span>
      {statusLine}
      {showButton && button}
    </div>
  );
}

export function VisitList({ loading, visits, showDate, emptyText, onAdd, onSendSms, smsReady, reviewSmsReady, smsGatewayReady, onEdit, onDelete }: VisitListProps) {
  const { t } = useLanguage();

  if (loading) {
    return <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">{t('loadingVisits')}</div>;
  }

  if (visits.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center">
        <p className="text-gray-500">{emptyText}</p>
        {onAdd && (
          <button onClick={onAdd} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            {t('addVisit')}
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="bg-white shadow rounded-lg divide-y divide-gray-200">
      {visits.map((visit) => (
        <li key={visit.id} className="px-4 py-3 flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
          <div className={`font-semibold text-gray-900 ${showDate ? 'md:w-40' : 'md:w-16'}`}>
            {showDate ? formatDateTimePl(visit.visitDate) : formatTimePl(visit.visitDate)}
          </div>
          <div className="min-w-0 md:flex-1">
            <div className="text-sm font-medium text-gray-900 truncate">{visit.customerName}</div>
            <div className="text-sm text-gray-500">{formatPhone(visit.customerPhone)}</div>
          </div>
          <div className="text-sm text-gray-500 md:w-44 truncate">{visit.visitType || '-'}</div>
          <div className="flex flex-wrap items-start gap-4">
            <SmsCell visit={visit} kind="reminder" onSend={onSendSms} ready={smsReady} gatewayReady={smsGatewayReady} />
            <SmsCell visit={visit} kind="review" onSend={onSendSms} ready={reviewSmsReady} gatewayReady={smsGatewayReady} />
          </div>
          <div className="flex gap-3 text-sm md:w-28 md:justify-end">
            {visit.reminderSmsStatus !== 'sent' && visit.reviewSmsStatus !== 'sent' && (
              <button onClick={() => onEdit(visit)} className="text-yellow-600 hover:text-yellow-900">
                {t('edit')}
              </button>
            )}
            <button onClick={() => onDelete(visit.id)} className="text-red-600 hover:text-red-900">
              {t('delete')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
