'use client';

import Link from 'next/link';
import styles from './print.module.css';
import type { PriceBasis } from '@/lib/stock-count/math';

// Pasek tylko na ekranie (ukryty przy drukowaniu): wybór podstawy wyceny, drukowanie, powrót.
export function PrintToolbar({ id, basis }: { id: string; basis: PriceBasis }) {
  const tab = (active: boolean) =>
    `px-3 py-2 rounded-lg text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`;
  return (
    <div className={styles.toolbar}>
      <div className="flex gap-1" role="group" aria-label="Podstawa wyceny">
        <Link href={`/inventory/stock-counts/${id}/print?price=purchase`} replace className={tab(basis === 'purchase')}>Cena zakupu</Link>
        <Link href={`/inventory/stock-counts/${id}/print?price=sale`} replace className={tab(basis === 'sale')}>Cena sprzedaży</Link>
      </div>
      <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
        Drukuj
      </button>
      <Link href={`/inventory/stock-counts/${id}`} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium">
        Wróć
      </Link>
    </div>
  );
}
