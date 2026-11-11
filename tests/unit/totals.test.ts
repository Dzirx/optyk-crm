import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsTotal, hasPrices, itemTotal } from '../../lib/work-orders/totals';

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

test('ceny szkieł per oko: suma OP + OL', () => {
  assert.equal(itemsTotal([{ framePrice: '100', opLensPrice: '150.10', olLensPrice: '180.20' }]), 430.3);
});

test('cena tylko jednego oka', () => {
  assert.equal(itemTotal({ opLensPrice: '150', olLensPrice: '' }), 150);
});

test('bez cen per oko liczy się stare lensPrice', () => {
  assert.equal(itemTotal({ lensPrice: '420', opLensPrice: null, olLensPrice: '' }), 420);
});

test('hasPrices widzi cenę per oko', () => {
  assert.equal(hasPrices([{ olLensPrice: '10' }]), true);
});
