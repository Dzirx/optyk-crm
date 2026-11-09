import { itemsTotal, hasPrices } from '@/lib/work-orders/totals';
import type { TranslationKey } from '@/lib/i18n/translations';
import { ORDERED_KEYS } from './constants';
import type {
  InventoryItem, NewCustomerForm, OrderedKey, WorkOrder, WorkOrderForm, WorkOrderItem,
} from './types';

/** Etykiety elementów „do zamówienia”: OP, OL, oprawka. */
export function orderedLabelsFor(t: (key: TranslationKey) => string): Record<OrderedKey, string> {
  return { opOrdered: 'OP', olOrdered: 'OL', frameOrdered: t('orderedFrame') };
}

/** Elementy zlecenia oznaczone „do zamówienia” (bez powtórzeń), np. ['OP', 'oprawka']. */
export function orderedParts(items: Pick<WorkOrderItem, OrderedKey>[], labels: Record<OrderedKey, string>): string[] {
  const parts = new Set<string>();
  for (const item of items) for (const key of ORDERED_KEYS) if (item[key]) parts.add(labels[key]);
  return [...parts];
}

export function formatInvLabel(inv: InventoryItem) {
  const parts: string[] = [];
  if (inv.sph != null) parts.push(`SPH: ${Number(inv.sph) > 0 ? '+' : ''}${Number(inv.sph).toFixed(2)}`);
  if (inv.cyl != null) parts.push(`CYL: ${Number(inv.cyl) > 0 ? '+' : ''}${Number(inv.cyl).toFixed(2)}`);
  if (inv.diameter != null) parts.push(`Śr: ${Number(inv.diameter).toFixed(1)}mm`);
  return [inv.name, ...parts, `(${inv.quantity} ${inv.unit})`].join(' | ');
}

// Stare zlecenia mogą nie mieć kwoty — wtedy pokazujemy sumę cen pozycji.
export function displayTotal(order: WorkOrder): string {
  if (order.totalAmount != null && order.totalAmount !== '') return `${Number(order.totalAmount).toFixed(2)} zł`;
  return hasPrices(order.items) ? `${itemsTotal(order.items).toFixed(2)} zł` : '—';
}

export function statusColor(status: string) {
  if (status === 'ready') return 'bg-green-100 text-green-800';
  if (status === 'completed') return 'bg-gray-100 text-gray-800';
  return 'bg-yellow-100 text-yellow-800';
}

export function emptyItem(): WorkOrderItem {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    type: 'do_dali',
    opSph: '', opCyl: '', opAxis: '', opAdd: '', opPd: '',
    olSph: '', olCyl: '', olAxis: '', olAdd: '', olPd: '',
    frameModel: '', ownFrame: false, lensType: '', framePrice: '', lensPrice: '',
    inventoryItemIdOp: '', inventoryItemIdOl: '', inventoryItemIdFrame: '',
    opOrdered: false, olOrdered: false, frameOrdered: false,
  };
}

export function emptyForm(): WorkOrderForm {
  return {
    customerId: '',
    orderNumber: '',
    receivedAt: new Date().toLocaleDateString('sv-SE'), // rrrr-mm-dd w czasie lokalnym
    pickupDate: '',
    status: 'pending',
    totalAmount: '',
    deposit: '',
    notes: '',
    items: [emptyItem()],
  };
}

export function emptyNewCustomer(): NewCustomerForm {
  return { name: '', surname: '', phone: '', email: '', smsConsent: true };
}

/** Zamienia zapisane zlecenie na stan formularza edycji. */
export function orderToForm(order: WorkOrder): WorkOrderForm {
  return {
    customerId: order.customerId,
    orderNumber: order.orderNumber,
    receivedAt: order.receivedAt.split('T')[0],
    pickupDate: order.pickupDate ? order.pickupDate.split('T')[0] : '',
    status: order.status,
    totalAmount: order.totalAmount ?? '',
    deposit: order.deposit ?? '',
    notes: order.notes ?? '',
    items: order.items.length > 0 ? order.items.map(i => ({
      id: i.id,
      type: i.type,
      opSph: i.opSph != null ? Number(i.opSph).toFixed(2) : '',
      opCyl: i.opCyl != null ? Number(i.opCyl).toFixed(2) : '',
      opAxis: i.opAxis ?? '',
      opAdd: i.opAdd != null ? Number(i.opAdd).toFixed(2) : '',
      opPd: i.opPd != null ? Number(i.opPd).toFixed(1) : '',
      olSph: i.olSph != null ? Number(i.olSph).toFixed(2) : '',
      olCyl: i.olCyl != null ? Number(i.olCyl).toFixed(2) : '',
      olAxis: i.olAxis ?? '',
      olAdd: i.olAdd != null ? Number(i.olAdd).toFixed(2) : '',
      olPd: i.olPd != null ? Number(i.olPd).toFixed(1) : '',
      frameModel: i.frameModel ?? '', ownFrame: i.ownFrame ?? false, lensType: i.lensType ?? '', framePrice: i.framePrice ?? '', lensPrice: i.lensPrice ?? '',
      inventoryItemIdOp: i.inventoryItemIdOp ?? '', inventoryItemIdOl: i.inventoryItemIdOl ?? '', inventoryItemIdFrame: i.inventoryItemIdFrame ?? '',
      opOrdered: i.opOrdered ?? false, olOrdered: i.olOrdered ?? false, frameOrdered: i.frameOrdered ?? false,
    })) : [emptyItem()],
  };
}
