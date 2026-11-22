'use client';

import Link from 'next/link';
import { PRINT_FORMATS, type PrintFormat } from './formats';
import styles from './print.module.css';

export function PrintToolbar({ missingDetails, format }: { missingDetails: string[]; format: PrintFormat }) {
  return (
    <div className={styles.toolbar}>
      {missingDetails.length > 0 && (
        <p className={styles.toolbarWarning}>
          Uzupełnij dane zakładu w{' '}
          <Link href="/settings" className="underline font-medium">ustawieniach</Link>: {missingDetails.join(', ')}.
          Bez nich informacja RODO na wydruku jest niepełna.
        </p>
      )}
      <div className={styles.formatSwitch} role="group" aria-label="Format kartki">
        {(Object.keys(PRINT_FORMATS) as PrintFormat[]).map((f) => (
          <Link key={f} href={`?format=${f}`} aria-current={f === format} replace>
            {PRINT_FORMATS[f].label}
          </Link>
        ))}
      </div>
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
      >
        Drukuj
      </button>
      <Link
        href="/work-orders"
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
      >
        Wróć do zleceń
      </Link>
      <p className={styles.toolbarHint}>
        W oknie drukowania wybierz papier {PRINT_FORMATS[format].label}, druk dwustronny (obracanie wzdłuż dłuższej
        krawędzi), skalę 100% i bez marginesów.
      </p>
    </div>
  );
}
