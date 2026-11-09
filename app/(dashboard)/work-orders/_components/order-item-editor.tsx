'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { inventoryPriceSum } from '@/lib/work-orders/totals';
import { ADD_OPTIONS, FIELD_OPTIONS, ITEM_TYPES, ORDERED_KEYS } from '../_lib/constants';
import { orderedLabelsFor } from '../_lib/helpers';
import type {
  InventoryItem, PrescriptionField, SetItemField, SetItemFields, WorkOrderItem,
} from '../_lib/types';
import { InventorySelect } from './inventory-select';

interface OrderItemEditorProps {
  item: WorkOrderItem;
  idx: number;
  canRemove: boolean;
  inventoryItems: InventoryItem[];
  setItemField: SetItemField;
  setMultipleItemFields: SetItemFields;
  onRemove: (index: number) => void;
}

/** Jedna komórka recepty: lista wartości albo pole liczbowe (oś). */
function PrescriptionCell({ field, item, idx, setItemField }: {
  field: PrescriptionField;
  item: WorkOrderItem;
  idx: number;
  setItemField: SetItemField;
}) {
  const options = FIELD_OPTIONS[field];
  return (
    <td className="px-1 py-1">
      {options ? (
        <select
          value={item[field]}
          onChange={e => setItemField(idx, field, e.target.value)}
          className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
        >
          <option value="">—</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input type="number" step="1" min="1" max="180"
          value={item[field]}
          onChange={e => setItemField(idx, field, e.target.value)}
          className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-blue-400"
          placeholder="—" />
      )}
    </td>
  );
}

export function OrderItemEditor({
  item, idx, canRemove, inventoryItems, setItemField, setMultipleItemFields, onRemove,
}: OrderItemEditorProps) {
  const { t } = useLanguage();
  const orderedLabels = orderedLabelsFor(t);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
          <select
            value={item.type}
            onChange={e => setItemField(idx, 'type', e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
          >
            {ITEM_TYPES.map(it => (
              <option key={it.value} value={it.value}>{t(it.labelKey)}</option>
            ))}
          </select>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            {t('removeItem')}
          </button>
        )}
      </div>

      {/* Prescription table */}
      {item.type === 'progresywne' ? (
        <div className="mb-3 space-y-2">
          {/* Do Dali */}
          <div className="overflow-x-auto">
            <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">{t('prescriptionDaliLabel')}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-50">
                  <th className="px-2 py-1 text-left text-xs text-gray-500 w-24"></th>
                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('sph')}</th>
                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('cyl')}</th>
                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('axis')}</th>
                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('pd')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoPrawe')}</td>
                  {(['opSph', 'opCyl', 'opAxis', 'opPd'] as const).map(field => (
                    <PrescriptionCell key={field} field={field} item={item} idx={idx} setItemField={setItemField} />
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoLewe')}</td>
                  {(['olSph', 'olCyl', 'olAxis', 'olPd'] as const).map(field => (
                    <PrescriptionCell key={field} field={field} item={item} idx={idx} setItemField={setItemField} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {/* Do Blizy (Add) */}
          <div className="overflow-x-auto">
            <p className="text-xs font-semibold text-green-700 mb-1 uppercase tracking-wide">{t('prescriptionNearLabel')}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-50">
                  <th className="px-2 py-1 text-left text-xs text-gray-500 w-24"></th>
                  <th className="px-2 py-1 text-center text-xs text-gray-500">{t('add')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoPrawe')}</td>
                  <td className="px-1 py-1 w-24">
                    <select
                      value={item.opAdd}
                      onChange={e => setItemField(idx, 'opAdd', e.target.value)}
                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-green-400"
                    >
                      <option value="">—</option>
                      {ADD_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoLewe')}</td>
                  <td className="px-1 py-1 w-24">
                    <select
                      value={item.olAdd}
                      onChange={e => setItemField(idx, 'olAdd', e.target.value)}
                      className="w-full border border-gray-200 rounded px-1 py-1 text-center text-sm text-gray-900 focus:ring-1 focus:ring-green-400"
                    >
                      <option value="">—</option>
                      {ADD_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 py-1 text-left text-xs text-gray-500 w-24"></th>
              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('sph')}</th>
              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('cyl')}</th>
              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('axis')}</th>
              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('add')}</th>
              <th className="px-2 py-1 text-center text-xs text-gray-500">{t('pd')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoPrawe')}</td>
              {(['opSph', 'opCyl', 'opAxis', 'opAdd', 'opPd'] as const).map(field => (
                <PrescriptionCell key={field} field={field} item={item} idx={idx} setItemField={setItemField} />
              ))}
            </tr>
            <tr>
              <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{t('okoLewe')}</td>
              {(['olSph', 'olCyl', 'olAxis', 'olAdd', 'olPd'] as const).map(field => (
                <PrescriptionCell key={field} field={field} item={item} idx={idx} setItemField={setItemField} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {/* Magazyn — per oko */}
      {inventoryItems.length > 0 && (
        <div className="mb-3 space-y-2 border border-gray-100 rounded-lg p-2 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('inventoryLink')}</p>
          {(['op', 'ol'] as const).map(eye => {
            const fieldKey = eye === 'op' ? 'inventoryItemIdOp' : 'inventoryItemIdOl';
            const sphKey = eye === 'op' ? 'opSph' : 'olSph';
            const cylKey = eye === 'op' ? 'opCyl' : 'olCyl';
            return (
              <div key={eye} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`inv-${eye}-${idx}`}
                  checked={!!item[fieldKey]}
                  onChange={e => {
                    if (e.target.checked) return;
                    const otherKey = eye === 'op' ? 'inventoryItemIdOl' : 'inventoryItemIdOp';
                    const sum = inventoryPriceSum([item[otherKey]], inventoryItems);
                    setMultipleItemFields(idx, {
                      [fieldKey]: '', [sphKey]: '', [cylKey]: '',
                      lensPrice: sum != null ? sum.toFixed(2) : '',
                    } as Partial<WorkOrderItem>);
                  }}
                  className="w-4 h-4 text-blue-600 rounded shrink-0"
                />
                <label htmlFor={`inv-${eye}-${idx}`} className="text-xs text-gray-600 font-medium w-32 shrink-0">
                  {eye === 'op' ? t('takeFromInventoryOp') : t('takeFromInventoryOl')}
                </label>
                <InventorySelect
                  value={item[fieldKey]}
                  onChange={() => {}}
                  onSelectItem={inv => {
                    const updates: Record<string, string> = {};
                    const otherKey = eye === 'op' ? 'inventoryItemIdOl' : 'inventoryItemIdOp';
                    if (inv) {
                      updates[fieldKey] = inv.id;
                      // Brak na stanie → domyślnie „do zamówienia” (można odznaczyć).
                      if (inv.quantity <= 0 && inv.id !== item[fieldKey]) (updates as Record<string, unknown>)[eye === 'op' ? 'opOrdered' : 'olOrdered'] = true;
                      if (inv.sph != null) updates[sphKey] = Number(inv.sph).toFixed(2);
                      if (inv.cyl != null) updates[cylKey] = Number(inv.cyl).toFixed(2);
                    } else {
                      updates[fieldKey] = '';
                      updates[sphKey] = '';
                      updates[cylKey] = '';
                    }
                    // Cena szkieł/soczewek = suma cen sztuk dla OP i OL (nie tylko ostatnio wybranej).
                    const sum = inventoryPriceSum([updates[fieldKey], item[otherKey]], inventoryItems);
                    if (sum != null) updates['lensPrice'] = sum.toFixed(2);
                    else if (!inv) updates['lensPrice'] = '';
                    setMultipleItemFields(idx, updates as Partial<WorkOrderItem>);
                  }}
                  items={inventoryItems}
                  placeholder={t('selectFromInventory')}
                />
              </div>
            );
          })}
          {/* Oprawka z magazynu */}
          {item.type !== 'soczewki_kontaktowe' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`inv-frame-${idx}`}
                checked={!!item.inventoryItemIdFrame}
                onChange={e => { if (!e.target.checked) setMultipleItemFields(idx, { inventoryItemIdFrame: '', frameModel: '' }); }}
                className="w-4 h-4 text-blue-600 rounded shrink-0"
              />
              <label htmlFor={`inv-frame-${idx}`} className="text-xs text-gray-600 font-medium w-32 shrink-0">
                {t('takeFromInventoryFrame')}
              </label>
              <InventorySelect
                value={item.inventoryItemIdFrame}
                onChange={() => {}}
                onSelectItem={inv => {
                  if (inv) {
                    const updates: Partial<WorkOrderItem> = { inventoryItemIdFrame: inv.id, frameModel: inv.name };
                    if (inv.quantity <= 0 && inv.id !== item.inventoryItemIdFrame) updates.frameOrdered = true;
                    if (inv.price != null) updates.framePrice = Number(inv.price).toFixed(2);
                    setMultipleItemFields(idx, updates);
                  } else {
                    setMultipleItemFields(idx, { inventoryItemIdFrame: '', frameModel: '', framePrice: '' });
                  }
                }}
                items={inventoryItems}
                placeholder={t('selectFromInventory')}
              />
            </div>
          )}
        </div>
      )}

      {/* Do zamówienia u dostawcy — osobno dla każdego elementu */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-orange-800" title={t('awaitingStockHint')}>
          {t('awaitingStock')}:
        </span>
        {ORDERED_KEYS.filter(key => key !== 'frameOrdered' || item.type !== 'soczewki_kontaktowe').map(key => (
          <label key={key} className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={item[key]}
              onChange={e => setItemField(idx, key, e.target.checked)}
              className="h-4 w-4"
            />
            {orderedLabels[key]}
          </label>
        ))}
        <p className="w-full text-xs text-gray-500">{t('awaitingStockHint')}</p>
      </div>

      {/* Frame + Lens / Contact Lens */}
      {item.type === 'soczewki_kontaktowe' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">{t('contactLensModel')}</label>
            <input
              type="text"
              value={item.lensType}
              onChange={e => setItemField(idx, 'lensType', e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="np. Acuvue Oasys 1-Day"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('contactLensPrice')} (zł)</label>
            <input
              type="number" step="0.01" min="0"
              value={item.lensPrice}
              onChange={e => setItemField(idx, 'lensPrice', e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="0.00"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('frameModel')}</label>
            <input
              type="text"
              value={item.frameModel}
              onChange={e => setItemField(idx, 'frameModel', e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="np. Ray-Ban RB2140"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('lensType')}</label>
            <input
              type="text"
              value={item.lensType}
              onChange={e => setItemField(idx, 'lensType', e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="np. organiczne AR"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('framePrice')} (zł)</label>
            <input
              type="number" step="0.01" min="0"
              value={item.framePrice}
              onChange={e => setItemField(idx, 'framePrice', e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('lensPrice')} (zł)</label>
            <input
              type="number" step="0.01" min="0"
              value={item.lensPrice}
              onChange={e => setItemField(idx, 'lensPrice', e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <input
              type="checkbox"
              id={`ownFrame-${idx}`}
              checked={item.ownFrame}
              onChange={e => setItemField(idx, 'ownFrame', e.target.checked)}
              className="rounded"
            />
            <label htmlFor={`ownFrame-${idx}`} className="text-sm text-gray-700">{t('ownFrame')}</label>
          </div>
        </div>
      )}
    </div>
  );
}
