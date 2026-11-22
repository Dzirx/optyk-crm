'use client';

import { useEffect, useRef, useState } from 'react';
import { formatPower, parsePower, type PowerRange } from '@/lib/work-orders/power';

/**
 * Pole mocy (SPH, CYL, ADD): wpisywanie z klawiatury („-2,5”, „-250”, „+1”) albo wybór z listy.
 * Lista ma plusy u góry i minusy u dołu, a po otwarciu pokazuje bieżącą wartość (pusta = 0,00).
 * Strzałki ↑/↓ zmieniają wartość o jeden krok.
 */
export function PowerInput({ value, onChange, range, label, className }: {
  value: string;
  onChange: (value: string) => void;
  range: PowerRange;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options: string[] = [];
  for (let c = Math.round(range.max * 100); c >= Math.round(range.min * 100); c -= Math.round(range.step * 100)) {
    options.push((c / 100).toFixed(range.decimals));
  }
  const anchor = value !== '' ? value : (Math.min(Math.max(0, range.min), range.max)).toFixed(range.decimals);

  // Po otwarciu lista przewija się do bieżącej wartości (albo do 0,00), a nie na górę (+20,00).
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-value="${anchor}"]`);
    if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + el.clientHeight / 2;
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Lista ma position: fixed (tabela recepty przewija się w poziomie i ucinałaby ją),
    // więc przy przewijaniu okna lub modala jest zamykana.
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  function openList(input: HTMLInputElement) {
    const r = input.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2, width: r.width });
    setOpen(true);
  }

  function commit(text: string) {
    setDraft(null);
    if (text.trim() === '') return onChange('');
    const parsed = parsePower(text, range);
    // Nieczytelny tekst: zostaje poprzednia wartość.
    if (parsed !== null) onChange(parsed);
  }

  function stepBy(dir: 1 | -1) {
    const base = draft !== null ? parsePower(draft, range) ?? value : value;
    const current = base === '' ? 0 : Number(base);
    const next = Math.min(range.max, Math.max(range.min, Math.round((current + dir * range.step) * 100) / 100));
    setDraft(null);
    onChange(next.toFixed(range.decimals));
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? formatPower(value)}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => { openList(e.target); e.target.select(); }}
        onClick={e => { if (!open) openList(e.currentTarget); }}
        onBlur={() => { if (draft !== null) commit(draft); }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1); }
          else if (e.key === 'Enter') { e.preventDefault(); if (draft !== null) commit(draft); setOpen(false); }
          else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
        }}
        placeholder="—"
        aria-label={label}
        className={className}
      />
      {open && pos && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={label}
          style={{ left: pos.left, top: pos.top, width: Math.max(pos.width, 88) }}
          className="fixed z-[60] max-h-56 overflow-y-auto rounded border border-gray-200 bg-white py-1 text-sm shadow-lg"
        >
          <li>
            <button type="button" tabIndex={-1}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setDraft(null); onChange(''); setOpen(false); }}
              className="w-full px-2 py-0.5 text-center text-gray-400 hover:bg-gray-50">—</button>
          </li>
          {options.map(o => (
            <li key={o} data-value={o}>
              <button type="button" tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setDraft(null); onChange(o); setOpen(false); }}
                className={`w-full px-2 py-0.5 text-center hover:bg-blue-50 ${o === value ? 'bg-blue-100 font-medium text-blue-800' : Number(o) === 0 ? 'font-medium text-gray-900' : 'text-gray-800'}`}>
                {formatPower(o)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
