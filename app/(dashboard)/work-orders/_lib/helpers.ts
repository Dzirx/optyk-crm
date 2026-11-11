import { itemsTotal, hasPrices } from '@/lib/work-orders/totals';
import { formatPln } from '@/lib/money';
import type { TranslationKey } from '@/lib/i18n/translations';
import { ORDERED_KEYS, SOURCE_OPTIONS } from './constants';
import type {
  Element, InventoryItem, NewCustomerForm, OrderedKey, Source, WorkOrder, WorkOrderForm, WorkOrderItem,
} from './types';

/** Pola pozycji, w których zapisany jest dany element (szkło OP, szkło OL, oprawka). */
export const ELEMENT_FIELDS = {
  op: { name: 'opLensName', price: 'opLensPrice', inv: 'inventoryItemIdOp', ordered: 'opOrdered', source: 'opSource' },
  ol: { name: 'olLensName', price: 'olLensPrice', inv: 'inventoryItemIdOl', ordered: 'olOrdered', source: 'olSource' },
  frame: { name: 'frameModel', price: 'framePrice', inv: 'inventoryItemIdFrame', ordered: 'frameOrdered', source: 'frameSource' },
} as const satisfies Record<Element, Record<string, keyof WorkOrderItem>>;

type SourceInput = {
  name: string; price: string; inv: string; ordered: boolean; own?: boolean;
};

/** Źródło elementu wyliczone z zapisanych pól (w bazie źródło nie ma osobnej kolumny). */
export function deriveSource({ name, price, inv, ordered, own }: SourceInput): Source {
  if (own) return 'own';
  if (ordered) return 'order';
  if (inv) return 'stock';
  if (name || price) return 'manual';
  return 'none';
}

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

/** Pola elementu po wybraniu „Brak”: bez nazwy, ceny, powiązania z magazynem i znacznika „do zamówienia”. */
export function clearedElement(el: Element): Partial<WorkOrderItem> {
  const f = ELEMENT_FIELDS[el];
  return {
    [f.name]: '', [f.price]: '', [f.inv]: '', [f.ordered]: false, [f.source]: 'none',
    ...(el === 'frame' ? { ownFrame: false } : {}),
  } as Partial<WorkOrderItem>;
}

/** Zmiana pól pozycji po przełączeniu „Skąd” przy jednym elemencie. */
export function changeElementSource(item: WorkOrderItem, el: Element, source: Source): Partial<WorkOrderItem> {
  const f = ELEMENT_FIELDS[el];
  const ownFrame = el === 'frame' ? { ownFrame: source === 'own' } : {};
  const base = { [f.source]: source, [f.ordered]: source === 'order', ...ownFrame };
  switch (source) {
    case 'none':
      return clearedElement(el);
    case 'own':
      return { ...clearedElement(el), ...ownFrame, [f.source]: 'own' } as Partial<WorkOrderItem>;
    case 'manual':
      // Nazwa i cena zostają do edycji, powiązanie z magazynem znika (towar wraca na stan).
      return { ...base, [f.inv]: '' } as Partial<WorkOrderItem>;
    case 'order':
      // „Do zamówienia” to tylko wpisana nazwa i cena: bez powiązania z magazynem (towar wraca na stan).
      return { ...base, [f.inv]: '' } as Partial<WorkOrderItem>;
    case 'stock':
      // Bez wybranego towaru pole nazwy i ceny jest puste, bo wypełni je wybór z magazynu.
      return (item[f.inv] ? base : { ...base, [f.name]: '', [f.price]: '' }) as Partial<WorkOrderItem>;
  }
}

/**
 * Zmiana pól pozycji po wyborze towaru z magazynu (albo po wyczyszczeniu wyboru, gdy inv = null).
 * Lista wyboru zawiera tylko towary na stanie, więc nie ma tu przełączania na „Do zamówienia”.
 */
export function pickInventory(item: WorkOrderItem, el: Element, inv: InventoryItem | null): Partial<WorkOrderItem> {
  const f = ELEMENT_FIELDS[el];
  if (!inv) return { [f.inv]: '', [f.name]: '', [f.price]: '' } as Partial<WorkOrderItem>;
  const updates: Record<string, unknown> = { [f.inv]: inv.id, [f.name]: inv.name };
  if (inv.price != null) updates[f.price] = Number(inv.price).toFixed(2);
  if (el !== 'frame') {
    const sphKey = el === 'op' ? 'opSph' : 'olSph';
    const cylKey = el === 'op' ? 'opCyl' : 'olCyl';
    if (inv.sph != null) updates[sphKey] = Number(inv.sph).toFixed(2);
    if (inv.cyl != null) updates[cylKey] = Number(inv.cyl).toFixed(2);
  }
  return updates as Partial<WorkOrderItem>;
}

/**
 * Zmiana nazwy ręcznie wpisanego elementu. Stara pozycja „do zamówienia” z powiązaniem z magazynem
 * zachowuje je, dopóki wiersz nie jest zmieniany — zmiana nazwy odpina towar (stan wraca na magazyn).
 */
export function changeElementName(el: Element, name: string): Partial<WorkOrderItem> {
  const f = ELEMENT_FIELDS[el];
  return { [f.name]: name, [f.inv]: '' } as Partial<WorkOrderItem>;
}

/** Towary na stanie do wyboru; towar już wybrany w tym wierszu zostaje na liście, nawet przy stanie 0. */
export function selectableInventory(items: InventoryItem[], currentId: string): InventoryItem[] {
  return items.filter(i => i.quantity > 0 || i.id === currentId);
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
  if (order.totalAmount != null && order.totalAmount !== '') return formatPln(Number(order.totalAmount));
  return hasPrices(order.items) ? formatPln(itemsTotal(order.items)) : '—';
}

/** „Czeka na” ma sens tylko w realizacji: po „Gotowe”/„Odebrane” towar musiał już dojść. */
export function showsAwaiting(status: string): boolean {
  return status === 'pending';
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
    opLensName: '', olLensName: '', opLensPrice: '', olLensPrice: '',
    inventoryItemIdOp: '', inventoryItemIdOl: '', inventoryItemIdFrame: '',
    opOrdered: false, olOrdered: false, frameOrdered: false,
    opSource: 'none', olSource: 'none', frameSource: 'none',
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
    items: order.items.length > 0 ? order.items.map(itemToForm) : [emptyItem()],
  };
}

function itemToForm(i: WorkOrderItem): WorkOrderItem {
  // Stare pozycje mają jedną nazwę i jedną cenę szkieł: trafiają do OP, żeby suma została taka sama.
  const hasPerEye = !!(i.opLensName || i.olLensName || i.opLensPrice || i.olLensPrice);
  const opLensName = hasPerEye ? (i.opLensName ?? '') : (i.lensType ?? '');
  const opLensPrice = hasPerEye ? (i.opLensPrice ?? '') : (i.lensPrice ?? '');
  const item: WorkOrderItem = {
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
    frameModel: i.frameModel ?? '', ownFrame: i.ownFrame ?? false, framePrice: i.framePrice ?? '',
    // lensType i lensPrice liczy serwer z pól per oko — formularz ich nie wysyła.
    lensType: '', lensPrice: '',
    opLensName, olLensName: i.olLensName ?? '', opLensPrice, olLensPrice: i.olLensPrice ?? '',
    inventoryItemIdOp: i.inventoryItemIdOp ?? '', inventoryItemIdOl: i.inventoryItemIdOl ?? '', inventoryItemIdFrame: i.inventoryItemIdFrame ?? '',
    opOrdered: i.opOrdered ?? false, olOrdered: i.olOrdered ?? false, frameOrdered: i.frameOrdered ?? false,
  };
  const fields = ELEMENT_FIELDS;
  const pick = (el: Element, own = false) => deriveSource({
    name: item[fields[el].name], price: item[fields[el].price], inv: item[fields[el].inv], ordered: item[fields[el].ordered], own,
  });
  item.opSource = pick('op');
  item.olSource = pick('ol');
  item.frameSource = pick('frame', item.ownFrame);
  return item;
}

export interface PreviewElementRow { label: string; text: string; price: string }

/** Wiersze „szkło OP / szkło OL / oprawka” do podglądu zlecenia: nazwa ze źródłem w nawiasie i cena. */
export function previewElements(item: WorkOrderItem, t: (key: TranslationKey) => string): PreviewElementRow[] {
  const f = itemToForm(item);
  const contact = f.type === 'soczewki_kontaktowe';
  const els: [Element, string][] = [
    ['op', contact ? t('contactLensOp') : t('lensOp')],
    ['ol', contact ? t('contactLensOl') : t('lensOl')],
    ...(contact ? [] : [['frame', t('frame')] as [Element, string]]),
  ];
  const rows: PreviewElementRow[] = [];
  for (const [el, label] of els) {
    const fields = ELEMENT_FIELDS[el];
    const source = f[fields.source] ?? 'none';
    if (source === 'none') continue;
    const sourceLabel = t(SOURCE_OPTIONS.find(o => o.value === source)!.labelKey);
    const name = f[fields.name];
    const price = f[fields.price];
    rows.push({
      label,
      text: source === 'own' ? sourceLabel : `${name || '—'} (${sourceLabel})`,
      price: price !== '' ? Number(price).toFixed(2) : '',
    });
  }
  return rows;
}
