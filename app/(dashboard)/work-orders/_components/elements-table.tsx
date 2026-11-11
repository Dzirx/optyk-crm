'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { SOURCE_OPTIONS } from '../_lib/constants';
import { ELEMENT_FIELDS, changeElementName, changeElementSource, pickInventory, selectableInventory } from '../_lib/helpers';
import type { Element, InventoryItem, SetItemFields, Source, WorkOrderItem } from '../_lib/types';
import { InventorySelect } from './inventory-select';

// Jedna siatka dla nagłówka i wierszy: etykieta | Skąd | Co (elastyczna) | Cena | zł.
// Poniżej 640 px wiersz się zawija: etykieta + Skąd w pierwszej linii, Co i Cena pod spodem.
const COLS = 'sm:grid-cols-[6rem_11rem_minmax(0,1fr)_7rem_1.5rem]';
const GRID = `grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 ${COLS}`;
const CTRL = 'h-9 w-full border border-gray-200 rounded px-2 text-sm text-gray-900 focus:ring-1 focus:ring-blue-400';
const INPUT = `${CTRL} placeholder:text-gray-400`;

interface ElementRowProps {
  el: Element;
  label: string;
  contact: boolean;
  item: WorkOrderItem;
  idx: number;
  inventoryItems: InventoryItem[];
  setMultipleItemFields: SetItemFields;
}

function ElementRow({ el, label, contact, item, idx, inventoryItems, setMultipleItemFields }: ElementRowProps) {
  const { t } = useLanguage();
  const f = ELEMENT_FIELDS[el];
  const source: Source = item[f.source] ?? 'none';
  const name = item[f.name];
  const price = item[f.price];
  const options = SOURCE_OPTIONS.filter(o => o.value !== 'own' || el === 'frame');
  const set = (fields: Partial<WorkOrderItem>) => setMultipleItemFields(idx, fields);
  const placeholder = el === 'frame' ? t('placeholderFrame') : contact ? t('placeholderContactLens') : t('placeholderLens');

  let what: React.ReactNode;
  if (source === 'stock') {
    what = (
      <InventorySelect
        value={item[f.inv]}
        onChange={() => {}}
        onSelectItem={inv => set(pickInventory(item, el, inv))}
        items={selectableInventory(inventoryItems, item[f.inv])}
        placeholder={t('selectFromInventory')}
      />
    );
  } else if (source === 'order' || source === 'manual') {
    what = (
      <input
        type="text"
        value={name}
        onChange={e => set(changeElementName(el, e.target.value))}
        className={`${INPUT} min-w-0`}
        placeholder={placeholder}
        aria-label={`${label}: ${t('colWhat')}`}
      />
    );
  } else {
    what = <span className="flex h-9 items-center text-sm text-gray-400">—</span>;
  }

  const hasPrice = source !== 'none' && source !== 'own';

  return (
    <div className={`${GRID} items-start py-1.5`}>
      <span className="flex h-9 items-center text-xs font-medium text-gray-700">{label}</span>
      <select
        value={source}
        onChange={e => set(changeElementSource(item, el, e.target.value as Source))}
        className={`${CTRL} bg-white px-1`}
        aria-label={`${label}: ${t('colSource')}`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{t(o.labelKey as TranslationKey)}</option>)}
      </select>
      <div className="col-span-2 min-w-0 sm:col-span-1">{what}</div>
      {hasPrice ? (
        <>
          <input
            type="number" step="0.01" min="0"
            value={price}
            onChange={e => set({ [f.price]: e.target.value } as Partial<WorkOrderItem>)}
            className={`${INPUT} col-span-1 text-right`}
            placeholder="0.00"
            aria-label={`${label}: ${t('colPrice')}`}
          />
          <span className="flex h-9 items-center text-xs text-gray-500">zł</span>
        </>
      ) : (
        <span className="col-span-2 hidden h-9 items-center text-sm text-gray-400 sm:flex">—</span>
      )}
    </div>
  );
}

/** Tabela „Szkła i oprawka”: jeden wiersz na element, w każdym wybór źródła (Skąd), nazwy (Co) i ceny. */
export function ElementsTable({ item, idx, inventoryItems, setMultipleItemFields }: {
  item: WorkOrderItem;
  idx: number;
  inventoryItems: InventoryItem[];
  setMultipleItemFields: SetItemFields;
}) {
  const { t } = useLanguage();
  const contact = item.type === 'soczewki_kontaktowe';
  const rowProps = { contact, item, idx, inventoryItems, setMultipleItemFields };

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('lensesAndFrame')}</p>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50 px-2">
        <div className={`hidden gap-x-2 pt-1.5 text-xs text-gray-500 sm:grid ${COLS}`}>
          <span />
          <span>{t('colSource')}</span>
          <span>{t('colWhat')}</span>
          <span className="col-span-2">{t('colPrice')}</span>
        </div>
        <ElementRow el="op" label={contact ? t('contactLensOp') : t('lensOp')} {...rowProps} />
        <ElementRow el="ol" label={contact ? t('contactLensOl') : t('lensOl')} {...rowProps} />
        {!contact && <ElementRow el="frame" label={t('frame')} {...rowProps} />}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t('sourceHint')}</p>
    </div>
  );
}
