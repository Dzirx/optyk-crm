import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySmsFailure } from '../../lib/sms/failure-reason';

const cases: [string, string | null, string, boolean][] = [
  ['brak zgody', 'Customer has not consented to SMS', 'consent', false],
  ['brak dostawcy', 'Business SMS provider not configured', 'not_configured', true],
  ['brak klucza', 'SMSAPI: apiKey is required', 'not_configured', true],
  ['nieznany dostawca', 'Unknown SMS provider: foo', 'not_configured', true],
  ['brak szablonu', 'SMS template not configured', 'no_template', true],
  ['autoryzacja', 'Authorization failed', 'auth', true],
  ['token', 'Invalid token', 'auth', true],
  ['brak środków', 'Not enough points on account', 'no_credits', false],
  ['numer', 'Invalid phone number', 'bad_phone', false],
  ['inny', 'Gateway timeout', 'other', false],
  ['pusty', null, 'other', false],
];
for (const [name, input, code, gateway] of cases) {
  test(`classifySmsFailure: ${name}`, () => {
    const r = classifySmsFailure(input);
    assert.equal(r.code, code);
    assert.equal(r.gateway, gateway);
  });
}

test('classifySmsFailure: surowy błąd skrócony do 120 znaków', () => {
  const r = classifySmsFailure('x'.repeat(300));
  assert.equal(r.code, 'other');
  assert.equal(r.reason.length, 120);
});

test('classifySmsFailure: polskie powody', () => {
  assert.equal(classifySmsFailure('Invalid phone number').reason, 'Nieprawidłowy numer telefonu');
  assert.equal(classifySmsFailure('No credits').reason, 'Brak środków na koncie SMS');
  assert.equal(classifySmsFailure('SMS template not configured').reason, 'Brak szablonu SMS');
});

test('classifySmsFailure: przypomnienie po wizycie (pominięte przez harmonogram)', () => {
  const r = classifySmsFailure('Reminder skipped: visit already took place');
  assert.equal(r.code, 'expired');
  assert.equal(r.gateway, false);
});
