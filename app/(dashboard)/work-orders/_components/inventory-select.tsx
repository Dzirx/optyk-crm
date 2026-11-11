'use client';

import { useState, useEffect, useRef } from 'react';
import { formatInvLabel } from '../_lib/helpers';
import type { InventoryItem } from '../_lib/types';

export function InventorySelect({ value, onChange, onSelectItem, items, placeholder }: {
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (inv: InventoryItem | null) => void;
  items: InventoryItem[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];
  const selected = items.find(i => i.id === value);
  const filtered = items.filter(inv => {
    if (activeCategory && inv.category !== activeCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [inv.name, inv.sph != null ? String(inv.sph) : '', inv.cyl != null ? String(inv.cyl) : '']
      .some(p => p.toLowerCase().includes(q));
  });

  function select(inv: InventoryItem | null) {
    onChange(inv?.id ?? '');
    onSelectItem?.(inv);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
          type="button"
          onClick={() => { setOpen(o => !o); setSearch(''); }}
          className="w-full border border-gray-200 rounded px-2 h-9 text-sm text-left flex items-center justify-between bg-white gap-1"
        >
          <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? formatInvLabel(selected) : placeholder}
          </span>
          <span className="text-gray-400 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg min-w-[280px]">
          {/* Zakładki kategorii */}
          {categories.length > 0 && (
            <div className="flex gap-1 px-1.5 pt-1.5 pb-1 border-b border-gray-100 overflow-x-auto flex-wrap">
              <button type="button"
                onClick={() => setActiveCategory('')}
                className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${activeCategory === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Wszystkie
              </button>
              {categories.map(c => (
                <button type="button" key={c}
                  onClick={() => setActiveCategory(c === activeCategory ? '' : c)}
                  className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${activeCategory === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {/* Wyszukiwanie */}
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj..."
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => select(null)}
              className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50">
              — Brak
            </button>
            {filtered.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">Brak wyników</p>}
            {filtered.map(inv => (
              <button type="button" key={inv.id}
                onClick={() => select(inv)}
                className={`w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 ${value === inv.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'}`}>
                {formatInvLabel(inv)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
