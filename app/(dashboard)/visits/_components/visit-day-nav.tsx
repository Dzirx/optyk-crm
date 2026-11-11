'use client';

import { useLanguage } from '@/lib/i18n/language-context';

interface VisitDayNavProps {
  /** Wybrany dzień (yyyy-mm-dd). */
  day: string;
  /** Podpis dnia, np. „Środa, 11.11.2026”. */
  heading: string;
  previous: string;
  next: string;
  isToday: boolean;
  onChange: (day: string) => void;
  onToday: () => void;
}

/** Pasek wyboru dnia: ← poprzedni, nagłówek z dniem tygodnia, następny →, pole daty i „Dziś”. */
export function VisitDayNav({ day, heading, previous, next, isToday, onChange, onToday }: VisitDayNavProps) {
  const { t } = useLanguage();
  const arrow = 'h-10 w-10 flex items-center justify-center rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(previous)} className={arrow} aria-label={t('visitsPreviousDay')} title={t('visitsPreviousDay')}>
        ←
      </button>
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 min-w-[13rem] text-center" aria-live="polite">
        {heading}
      </h2>
      <button type="button" onClick={() => onChange(next)} className={arrow} aria-label={t('visitsNextDay')} title={t('visitsNextDay')}>
        →
      </button>
      <input
        type="date"
        value={day}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label={t('visitsPickDay')}
        title={t('visitsPickDay')}
        className="h-10 rounded-md border border-gray-300 px-3 bg-white text-gray-900"
      />
      <button
        type="button"
        onClick={onToday}
        disabled={isToday}
        className="h-10 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {t('today')}
      </button>
    </div>
  );
}
