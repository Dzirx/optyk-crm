import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessAddress, businessLegalName, missingPrintDetails } from '../../lib/business-details';

const full = {
  name: 'Optyk Test',
  legalName: 'Zakład Optyczny Jan Testowy',
  street: 'ul. Lipowa 12',
  postalCode: '20-001',
  city: 'Lublin',
  nip: '1234567890',
  phone: '+48500100200',
};

test('adres w jednej linii', () => {
  assert.equal(businessAddress(full), 'ul. Lipowa 12, 20-001 Lublin');
  assert.equal(businessAddress({ ...full, street: null }), '20-001 Lublin');
  assert.equal(businessAddress({ ...full, street: null, postalCode: null, city: null }), '');
});

test('nazwa administratora: pełna nazwa, a bez niej nazwa salonu', () => {
  assert.equal(businessLegalName(full), 'Zakład Optyczny Jan Testowy');
  assert.equal(businessLegalName({ ...full, legalName: '  ' }), 'Optyk Test');
});

test('lista brakujących danych', () => {
  assert.deepEqual(missingPrintDetails(full), []);
  assert.deepEqual(
    missingPrintDetails({ ...full, legalName: null, city: '', phone: null }),
    ['pełna nazwa firmy', 'miejscowość', 'telefon'],
  );
});
