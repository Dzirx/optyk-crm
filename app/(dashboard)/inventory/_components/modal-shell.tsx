'use client';

import type { ReactNode } from 'react';

/** Wspólna rama okna: przewija się cała, więc na telefonie nic nie ucieka poza ekran. */
export function ModalShell({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
      <div className="flex min-h-full items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-md'} p-4 sm:p-6 min-w-0`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 break-words">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
