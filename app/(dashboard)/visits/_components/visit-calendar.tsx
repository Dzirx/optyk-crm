'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { toLocalDateStr } from '../_lib/dates';
import type { Visit } from '../_lib/types';

interface VisitCalendarProps {
  visits: Visit[];
  selectedDate: string;
  /** Liczba wizyt pokazana pod kalendarzem (po filtrach strony). */
  filteredCount: number;
  onSelectDate: (dateStr: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

export function VisitCalendar({
  visits, selectedDate, filteredCount, onSelectDate, onPreviousMonth, onNextMonth, onToday,
}: VisitCalendarProps) {
  const { t } = useLanguage();

  const generateCalendarDays = () => {
    const date = new Date(selectedDate + 'T12:00:00');
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty slots for days before month starts
    for (let i = 0; i < (startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1); i++) {
      days.push(null);
    }

    // Add all days in month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getVisitsCountForDate = (date: Date) => {
    const dateStr = toLocalDateStr(date);
    return visits.filter(v => {
      const visitDate = toLocalDateStr(new Date(v.visitDate));
      return visitDate === dateStr;
    }).length;
  };

  return (
    <div className="flex-shrink-0">
      <div className="bg-white shadow rounded-lg p-3 w-[280px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onPreviousMonth}
              className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
              title={t('previousMonth')}
            >
              ←
            </button>
            <h3 className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={onNextMonth}
              className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
              title={t('nextMonth')}
            >
              →
            </button>
          </div>
        </div>

        <div className="flex justify-center mb-2">
          <button
            onClick={onToday}
            className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
          >
            {t('today')}
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {/* Day headers */}
          {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((day) => (
            <div key={day} className="text-center text-[10px] font-semibold text-gray-600 py-0.5">
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {generateCalendarDays().map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="w-8 h-8" />;
            }

            const dateStr = toLocalDateStr(day);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === toLocalDateStr(new Date());
            const visitsCount = getVisitsCountForDate(day);

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDate(dateStr)}
                className={`w-8 h-8 rounded border flex flex-col items-center justify-center transition-all relative text-xs ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white font-bold'
                    : isToday
                    ? 'border-blue-400 bg-blue-50 text-blue-900 font-semibold'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700'
                }`}
              >
                <span className="leading-none">{day.getDate()}</span>
                {visitsCount > 0 && (
                  <span
                    className={`text-[8px] px-0.5 leading-none rounded-full ${
                      isSelected ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {visitsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected date info */}
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-center text-gray-600 text-xs">
            <span className="font-semibold text-gray-900">{filteredCount}</span> {filteredCount === 1 ? t('visit') : t('visitsPlural')} {t('on')}{' '}
            <span className="font-semibold text-blue-600">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
