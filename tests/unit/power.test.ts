import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADD_RANGE, CYL_RANGE, SPH_RANGE, formatPower, parsePower } from '../../lib/work-orders/power';

test('wpisywanie mocy z klawiatury', () => {
  const cases: [string, string | null][] = [
    ['-2.5', '-2.50'], ['-2,5', '-2.50'], ['+1', '1.00'], ['1', '1.00'], ['−0,75', '-0.75'],
    ['-125', '-1.25'], ['-075', '-0.75'], ['300', '3.00'], ['-1.3', '-1.25'], ['-1.13', '-1.25'],
    ['0', '0.00'], ['-0.1', '0.00'], [' -2 ', '-2.00'], ['abc', null], ['', null], ['-', null], ['1..2', null],
  ];
  for (const [input, expected] of cases) assert.equal(parsePower(input, SPH_RANGE), expected, input);
});

test('wartość obcinana do zakresu', () => {
  assert.equal(parsePower('-25.00', SPH_RANGE), '-20.00');
  assert.equal(parsePower('9.5', CYL_RANGE), '8.00');
  assert.equal(parsePower('0', ADD_RANGE), '0.25');
});

test('wyświetlanie mocy ze znakiem', () => {
  assert.equal(formatPower('1.25'), '+1.25');
  assert.equal(formatPower('-2.00'), '-2.00');
  assert.equal(formatPower('0.00'), '0.00');
  assert.equal(formatPower(''), '');
});
