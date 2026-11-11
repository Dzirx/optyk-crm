import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changeElementName, changeElementSource, clearedElement, emptyItem, orderToForm, pickInventory, selectableInventory,
} from '../../app/(dashboard)/work-orders/_lib/helpers';
import type { InventoryItem, WorkOrder, WorkOrderItem } from '../../app/(dashboard)/work-orders/_lib/types';

const inv = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'inv1', name: 'Hoya 1.6 AR', quantity: 3, unit: 'szt.', category: null, sph: '-1.50', cyl: '-0.25', diameter: null, price: '150',
  ...over,
});

function apply(item: WorkOrderItem, fields: Partial<WorkOrderItem>): WorkOrderItem {
  return { ...item, ...fields };
}

function orderWith(item: Partial<WorkOrderItem>): WorkOrder {
  return {
    id: 'o', customerId: 'c', customerName: '', customerPhone: '', orderNumber: '1', receivedAt: '2026-11-09',
    pickupDate: null, status: 'pending', totalAmount: null, deposit: null, notes: null,
    reviewSmsStatus: null, reviewSmsSentAt: null,
    items: [{ ...emptyItem(), id: 'i1', ...item }],
  };
}

test('wybór z magazynu wypełnia nazwę, cenę i receptę', () => {
  const item = apply(emptyItem(), changeElementSource(emptyItem(), 'op', 'stock'));
  const next = apply(item, pickInventory(item, 'op', inv()));
  assert.equal(next.opSource, 'stock');
  assert.equal(next.opLensName, 'Hoya 1.6 AR');
  assert.equal(next.opLensPrice, '150.00');
  assert.equal(next.opSph, '-1.50');
  assert.equal(next.inventoryItemIdOp, 'inv1');
  assert.equal(next.opOrdered, false);
});

test('lista wyboru: tylko towary na stanie + już wybrany', () => {
  const list = [inv({ id: 'a', quantity: 2 }), inv({ id: 'b', quantity: 0 }), inv({ id: 'c', quantity: 0 })];
  assert.deepEqual(selectableInventory(list, '').map(i => i.id), ['a']);
  assert.deepEqual(selectableInventory(list, 'c').map(i => i.id), ['a', 'c']);
});

test('„Brak” czyści nazwę, cenę, powiązanie i znacznik zamówienia', () => {
  const item = apply(emptyItem(), { frameSource: 'order', frameModel: 'X', framePrice: '10', inventoryItemIdFrame: 'a', frameOrdered: true });
  const next = apply(item, changeElementSource(item, 'frame', 'none'));
  assert.deepEqual(
    [next.frameModel, next.framePrice, next.inventoryItemIdFrame, next.frameOrdered, next.frameSource],
    ['', '', '', false, 'none'],
  );
});

test('„Własna klienta” ustawia ownFrame i czyści resztę', () => {
  const item = apply(emptyItem(), { frameSource: 'manual', frameModel: 'X', framePrice: '10' });
  const next = apply(item, changeElementSource(item, 'frame', 'own'));
  assert.equal(next.ownFrame, true);
  assert.equal(next.frameModel, '');
  assert.equal(next.frameSource, 'own');
  assert.equal(apply(next, changeElementSource(next, 'frame', 'manual')).ownFrame, false);
});

test('„Do zamówienia” ustawia znacznik, „Bez magazynu” odpina magazyn', () => {
  const item = apply(emptyItem(), { opSource: 'stock', inventoryItemIdOp: 'a', opLensName: 'X' });
  const ordered = apply(item, changeElementSource(item, 'op', 'order'));
  assert.equal(ordered.opOrdered, true);
  assert.equal(ordered.inventoryItemIdOp, '');
  assert.equal(ordered.opLensName, 'X');
  const manual = apply(ordered, changeElementSource(ordered, 'op', 'manual'));
  assert.equal(manual.opOrdered, false);
  assert.equal(manual.inventoryItemIdOp, '');
  assert.equal(manual.opLensName, 'X');
});

test('stara pozycja „do zamówienia” z powiązaniem: wczytanie nie rusza powiązania, zmiana nazwy je odpina', () => {
  const f = orderToForm(orderWith({ olOrdered: true, inventoryItemIdOl: 'a', olLensName: 'Essilor' })).items[0];
  assert.equal(f.olSource, 'order');
  assert.equal(f.inventoryItemIdOl, 'a');
  const renamed = apply(f, changeElementName('ol', 'Inna nazwa'));
  assert.equal(renamed.inventoryItemIdOl, '');
  assert.equal(renamed.olLensName, 'Inna nazwa');
  assert.equal(renamed.olOrdered, true);
});

test('wczytanie: źródło wynika z zapisanych pól', () => {
  const f = orderToForm(orderWith({
    ownFrame: true, olOrdered: true, inventoryItemIdOp: 'a', opLensName: 'Hoya', olLensName: 'Essilor', frameModel: '',
  })).items[0];
  assert.deepEqual([f.opSource, f.olSource, f.frameSource], ['stock', 'order', 'own']);
  assert.equal(orderToForm(orderWith({ frameModel: 'Ray-Ban' })).items[0].frameSource, 'manual');
  assert.equal(orderToForm(orderWith({ framePrice: '99' })).items[0].frameSource, 'manual');
  assert.equal(orderToForm(orderWith({})).items[0].frameSource, 'none');
});

test('wczytanie starej pozycji: lensType i lensPrice trafiają do OP', () => {
  const f = orderToForm(orderWith({ lensType: 'organiczne AR', lensPrice: '420.00' })).items[0];
  assert.equal(f.opLensName, 'organiczne AR');
  assert.equal(f.opLensPrice, '420.00');
  assert.equal(f.olLensName, '');
  assert.equal(f.opSource, 'manual');
  assert.equal(f.olSource, 'none');
});

test('clearedElement dla szkła nie rusza ownFrame', () => {
  assert.equal('ownFrame' in clearedElement('op'), false);
});
