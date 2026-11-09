export interface WorkOrderItem {
  id?: string;
  type: string;
  opSph: string; opCyl: string; opAxis: string; opAdd: string; opPd: string;
  olSph: string; olCyl: string; olAxis: string; olAdd: string; olPd: string;
  frameModel: string;
  ownFrame: boolean;
  lensType: string;
  framePrice: string;
  lensPrice: string;
  inventoryItemIdOp: string;
  inventoryItemIdOl: string;
  inventoryItemIdFrame: string;
  opOrdered: boolean;
  olOrdered: boolean;
  frameOrdered: boolean;
}

export type OrderedKey = 'opOrdered' | 'olOrdered' | 'frameOrdered';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
  sph: string | null;
  cyl: string | null;
  diameter: string | null;
  price: string | null;
}

export interface WorkOrder {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  receivedAt: string;
  pickupDate: string | null;
  status: string;
  totalAmount: string | null;
  deposit: string | null;
  notes: string | null;
  reviewSmsStatus: string | null;
  reviewSmsSentAt: string | null;
  items: WorkOrderItem[];
}

export interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
}

export interface NewCustomerForm {
  name: string;
  surname: string;
  phone: string;
  email: string;
  smsConsent: boolean;
}

export interface WorkOrderForm {
  customerId: string;
  orderNumber: string;
  receivedAt: string;
  pickupDate: string;
  status: string;
  totalAmount: string;
  deposit: string;
  notes: string;
  items: WorkOrderItem[];
}

/** Pola recepty edytowane w tabeli pozycji. */
export type PrescriptionField =
  | 'opSph' | 'opCyl' | 'opAxis' | 'opAdd' | 'opPd'
  | 'olSph' | 'olCyl' | 'olAxis' | 'olAdd' | 'olPd';

/** Zmiana jednego pola pozycji o danym indeksie. */
export type SetItemField = <K extends keyof WorkOrderItem>(index: number, field: K, value: WorkOrderItem[K]) => void;
/** Zmiana kilku pól pozycji o danym indeksie naraz. */
export type SetItemFields = (index: number, fields: Partial<WorkOrderItem>) => void;
