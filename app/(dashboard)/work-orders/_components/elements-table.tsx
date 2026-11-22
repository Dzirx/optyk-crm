'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { SOURCE_OPTIONS } from '../_lib/constants';
import { ELEMENT_FIELDS, QTY_FIELD, changeElementName, changeElementSource, pickInventory, preferredCategory, selectableInventory } from '../_lib/helpers';
import { qtyOf } from '@/lib/work-orders/totals';
import { formatPln } from '@/lib/money';
import type { Element, InventoryItem, SetItemFields, Source, WorkOrderItem } from '../_lib/types';
import { InventorySelect } from './inventory-select';

// Jedna siatka dla nagłówka i wierszy: etykieta | Skąd | Co (elastyczna) | Ilość × cena zł.
// Poniżej 640 px wiersz się zawija: etykieta + Skąd w pierwszej linii, Co i Cena pod spodem.
const COLS = 'sm:grid-cols-[6rem_11rem_minmax(0,1fr)_13rem]';
const GRID = `grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 ${COLS}`;
const CTRL = 'h-9 w-full border border-gray-200 rounded px-2 text-sm text-gray-900 focus:ring-1 focus:ring-blue-400';
const INPUT = `${CTRL} placeholder:text-gray-400`;
// Pola w jednym wierszu „ilość × cena”: bez w-full, szerokość daje flex.
const QTY_INPUT = `${INPUT.replace('w-full ', '')} w-14 shrink-0 text-center`;
const PRICE_INPUT = `${INPUT.replace('w-full ', '')} min-w-0 flex-1 text-right`;

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
        defaultCategory={(cats) => preferredCategory(el, contact, cats)}
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
  const qtyField = el === 'frame' ? null : QTY_FIELD[el];
  const qty = qtyField ? qtyOf(item[qtyField]) : 1;

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
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1">
            {qtyField ? (
              <>
                <input
                  type="number" step="1" min="1" max="99"
                  value={item[qtyField]}
                  onChange={e => set({ [qtyField]: e.target.value } as Partial<WorkOrderItem>)}
                  onBlur={() => set({ [qtyField]: String(qtyOf(item[qtyField])) } as Partial<WorkOrderItem>)}
                  className={QTY_INPUT}
                  aria-label={`${label}: ${t('qtyShort')}`}
                />
                <span className="shrink-0 text-xs text-gray-500">×</span>
              </>
            ) : (
              <span className="w-[4.25rem] shrink-0" />
            )}
            <input
              type="number" step="0.01" min="0"
              value={price}
              onChange={e => set({ [f.price]: e.target.value } as Partial<WorkOrderItem>)}
              className={PRICE_INPUT}
              placeholder="0.00"
              aria-label={`${label}: ${t('colPrice')}`}
            />
            <span className="shrink-0 text-xs text-gray-500">zł</span>
          </div>
          {qty > 1 && price !== '' && (
            <p className="mt-0.5 text-right text-xs text-gray-600" data-testid={`line-total-${el}`}>
              {t('lineTotal')}: {formatPln(Number(price) * qty)}
            </p>
          )}
        </div>
      ) : (
        <span className="hidden h-9 items-center text-sm text-gray-400 sm:flex">—</span>
      )}
    </div>
  );
}

/** Wiersz „Usługa” (np. montaż): nazwa i cena wliczana do sumy pozycji. */
function ServiceRow({ item, idx, setMultipleItemFields }: {
  item: WorkOrderItem;
  idx: number;
  setMultipleItemFields: SetItemFields;
}) {
  const { t } = useLanguage();
  const set = (fields: Partial<WorkOrderItem>) => setMultipleItemFields(idx, fields);
  return (
    <div className={`${GRID} items-start py-1.5`}>
      <span className="flex h-9 items-center text-xs font-medium text-gray-700">{t('service')}</span>
      <span className="hidden sm:block" />
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <input
          type="text"
          value={item.serviceName}
          onChange={e => set({ serviceName: e.target.value })}
          className={`${INPUT} min-w-0`}
          placeholder={t('servicePlaceholder')}
          aria-label={`${t('service')}: ${t('colWhat')}`}
        />
      </div>
      <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
        <span className="w-[4.25rem] shrink-0" />
        <input
          type="number" step="0.01" min="0"
          value={item.servicePrice}
          // Cena bez nazwy: domyślnie „Montaż”, żeby na wydruku było wiadomo, za co jest kwota.
          onChange={e => set({ servicePrice: e.target.value, ...(item.serviceName.trim() ? {} : { serviceName: t('serviceDefault') }) })}
          className={PRICE_INPUT}
          placeholder="0.00"
          aria-label={`${t('service')}: ${t('colPrice')}`}
        />
        <span className="shrink-0 text-xs text-gray-500">zł</span>
      </div>
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
          <span>{t('colQtyPrice')}</span>
        </div>
        <ElementRow el="op" label={contact ? t('contactLensOp') : t('lensOp')} {...rowProps} />
        <ElementRow el="ol" label={contact ? t('contactLensOl') : t('lensOl')} {...rowProps} />
        {!contact && <ElementRow el="frame" label={t('frame')} {...rowProps} />}
        {!contact && <ServiceRow item={item} idx={idx} setMultipleItemFields={setMultipleItemFields} />}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t('sourceHint')}</p>
    </div>
  );
}
