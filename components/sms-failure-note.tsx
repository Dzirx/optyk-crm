'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/translations';

export interface SmsFailure {
  reasonCode: string;
  reason: string;
  isConfig: boolean;
  at: string;
}

/**
 * Powód nieudanego SMS pod czerwoną plakietką. Brak obiektu `failure` (np. brak logu)
 * przy braku zgody klienta pokazuje powód „brak zgody”; w innym razie nic.
 */
export function SmsFailureNote({ failure, noConsent, kind }: { failure: SmsFailure | null | undefined; noConsent?: boolean; kind: string }) {
  const { t } = useLanguage();
  const consent = failure ? failure.reasonCode === 'consent' : !!noConsent;
  if (!failure && !consent) return null;

  let text: string;
  if (consent) {
    text = t('smsFailureNoConsent');
  } else {
    const key = `notificationsReason_${failure!.reasonCode}` as TranslationKey;
    const translated = t(key);
    text = `${t('smsFailureReason')} ${translated === key ? failure!.reason : translated}`;
  }
  return (
    <p data-testid={`${kind}-failure-reason`} className="basis-full max-w-xs text-xs text-red-700 break-words">
      {text}
      {!consent && failure?.isConfig && (
        <>
          {' '}
          <Link href="/settings" className="text-blue-600 underline whitespace-nowrap">
            {t('smsFailureFillSettings')}
          </Link>
        </>
      )}
    </p>
  );
}

/**
 * Zwięzła ramka „Nie wysłano” z powodem i akcjami (Ustawienia / Wyślij ponownie).
 * Zastępuje czerwoną plakietkę + osobny przycisk + tekst powodu.
 */
export function SmsFailureCard({
  failure, noConsent, kind, onRetry, title,
}: {
  failure: SmsFailure | null | undefined;
  noConsent?: boolean;
  kind: string;
  onRetry?: () => void;
  title: string;
}) {
  const { t } = useLanguage();
  const consent = failure ? failure.reasonCode === 'consent' : !!noConsent;
  let reason: string | null = null;
  if (consent) reason = t('smsFailureNoConsentShort');
  else if (failure) {
    const key = `notificationsReason_${failure.reasonCode}` as TranslationKey;
    const translated = t(key);
    reason = translated === key ? failure.reason : translated;
  }
  return (
    <div data-testid={`${kind}-failure-card`} className="w-full max-w-[15rem] rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-red-700">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path fillRule="evenodd" d="M8.48 2.6a1.75 1.75 0 0 1 3.04 0l6.13 10.9A1.75 1.75 0 0 1 16.13 16H3.87a1.75 1.75 0 0 1-1.52-2.5L8.48 2.6ZM10 6.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6.5Zm0 7.25a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" clipRule="evenodd" />
        </svg>
        {title}
      </div>
      {reason && <p data-testid={`${kind}-failure-reason`} className="mt-0.5 text-red-700/90 break-words">{reason}</p>}
      {(onRetry || (!consent && failure?.isConfig)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {!consent && failure?.isConfig && (
            <Link href="/settings" className="font-medium text-blue-700 hover:underline">
              {t('smsFailureOpenSettings')} →
            </Link>
          )}
          {onRetry && !consent && (
            <button type="button" onClick={onRetry} className="font-medium text-red-700 hover:underline">
              ↻ {t('smsFailureRetry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Wersja kompaktowa do tabel: tylko czerwony znaczek ostrzeżenia.
 * Kliknięcie otwiera okienko z ramką {@link SmsFailureCard} (powód, Ustawienia, Wyślij ponownie).
 */
export function SmsFailureIcon(props: {
  failure: SmsFailure | null | undefined;
  noConsent?: boolean;
  kind: string;
  onRetry?: () => void;
  title: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-testid={`${props.kind}-failure-icon`}
        onClick={() => setOpen(true)}
        title={props.title}
        aria-label={props.title}
        className="inline-flex items-center rounded px-2 py-1 text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path fillRule="evenodd" d="M8.48 2.6a1.75 1.75 0 0 1 3.04 0l6.13 10.9A1.75 1.75 0 0 1 16.13 16H3.87a1.75 1.75 0 0 1-1.52-2.5L8.48 2.6ZM10 6.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6.5Zm0 7.25a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label={props.title} className="relative mx-4 rounded-xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('close')}
              className="absolute right-2 top-1 text-2xl leading-none text-gray-400 hover:text-gray-700">&times;</button>
            <div className="pr-6 [&>div]:max-w-xs [&>div]:text-sm">
              <SmsFailureCard
                {...props}
                onRetry={props.onRetry && (() => { setOpen(false); props.onRetry!(); })}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
