import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsTotal, hasPrices, inventoryPriceSum, itemTotal } from '../../lib/work-orders/totals';

test('oprawka + szkła bez błędu zaokrąglenia', () => {
  assert.equal(itemsTotal([{ framePrice: '199.99', lensPrice: '0.01' }]), 200);
});

test('dwie pozycje', () => {
  assert.equal(itemsTotal([{ framePrice: '300', lensPrice: '250.50' }, { framePrice: '', lensPrice: '120' }]), 670.5);
});

test('Decimal z Prisma (0.1 + 0.2)', () => {
  assert.equal(itemsTotal([{ framePrice: { toString: () => '0.1' }, lensPrice: { toString: () => '0.2' } }]), 0.3);
});

test('brak pozycji', () => {
  assert.equal(itemsTotal([]), 0);
});

test('brak cen', () => {
  assert.equal(hasPrices([{ framePrice: '', lensPrice: null }]), false);
});

test('śmieci w cenie są ignorowane', () => {
  assert.equal(itemTotal({ framePrice: 'abc', lensPrice: '10' }), 10);
});

const inv = [
  { id: 'a', price: '150.00' },
  { id: 'b', price: '175.50' },
  { id: 'c', price: null },
];

test('soczewka OP + OL', () => {
  assert.equal(inventoryPriceSum(['a', 'b'], inv), 325.5);
});

test('ta sama soczewka na oba oczy = 2 sztuki', () => {
  assert.equal(inventoryPriceSum(['a', 'a'], inv), 300);
});

test('tylko jedno oko', () => {
  assert.equal(inventoryPriceSum(['a', ''], inv), 150);
});

test('brak ceny w magazynie', () => {
  assert.equal(inventoryPriceSum(['c', ''], inv), null);
});
