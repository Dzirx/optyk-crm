'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { ADD_OPTIONS, FIELD_OPTIONS, ITEM_TYPES } from '../_lib/constants';
import type {
  InventoryItem, PrescriptionField, SetItemField, SetItemFields, WorkOrderItem,
} from '../_lib/types';
import { clearedElement } from '../_lib/helpers';
import { ElementsTable } from './elements-table';

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

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
          <select
            value={item.type}
            onChange={e => {
              const type = e.target.value;
              // Soczewki kontaktowe nie mają oprawki: czyścimy ją, żeby nie pobierała towaru z magazynu.
              if (type === 'soczewki_kontaktowe' && item.frameSource !== 'none') {
                setMultipleItemFields(idx, {
                  type, ...clearedElement('frame'),
                });
              } else {
                setItemField(idx, 'type', type);
              }
            }}
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

      <ElementsTable
        item={item}
        idx={idx}
        inventoryItems={inventoryItems}
        setMultipleItemFields={setMultipleItemFields}
      />
    </div>
  );
}
