'use client';

import { useLanguage } from '@/lib/i18n/language-context';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Prosty pager pod tabelą: Poprzednia / Strona X z Y / Następna oraz liczba wyników. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t } = useLanguage();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
      <span>{total} {t('resultsCount')}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('pagePrevious')}
        </button>
        <span>{t('pageLabel')} {page} {t('pageOf')} {pages}</span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="px-3 py-1 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('pageNext')}
        </button>
      </div>
    </div>
  );
}
