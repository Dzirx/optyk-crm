import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluralPl, wynikiPl, pozycjePl, resultsLabel, wizytyPl, visitsLabel } from '../../lib/plural';
import { formatPln } from '../../lib/money';

test('wyniki: 1, 2-4, 5+, 12-14, 22-24', () => {
  assert.equal(wynikiPl(1), 'wynik');
  for (const n of [2, 3, 4, 22, 23, 24, 102]) assert.equal(wynikiPl(n), 'wyniki', String(n));
  for (const n of [0, 5, 11, 12, 13, 14, 15, 21, 25, 100, 111, 112]) assert.equal(wynikiPl(n), 'wyników', String(n));
});

test('pozycje', () => {
  assert.equal(pozycjePl(1), 'pozycja');
  assert.equal(pozycjePl(3), 'pozycje');
  assert.equal(pozycjePl(13), 'pozycji');
});

test('pluralPl ogólnie', () => {
  assert.equal(pluralPl(2, 'a', 'b', 'c'), 'b');
});

test('resultsLabel PL i EN', () => {
  assert.equal(resultsLabel(1, 'pl'), '1 wynik');
  assert.equal(resultsLabel(2, 'pl'), '2 wyniki');
  assert.equal(resultsLabel(56, 'pl'), '56 wyników');
  assert.equal(resultsLabel(1, 'en'), '1 result');
  assert.equal(resultsLabel(0, 'en'), '0 results');
  assert.equal(resultsLabel(7, 'en'), '7 results');
});

test('formatPln: przecinek dziesiętny', () => {
  assert.equal(formatPln(699.98), '699,98 zł');
  assert.equal(formatPln(0), '0,00 zł');
  assert.equal(formatPln(250.5), '250,50 zł');
  assert.equal(formatPln(1234.5), '1234,50 zł');
});

test('wizyty: 1, 2-4, 5+, 12-14, 22-24', () => {
  assert.equal(wizytyPl(1), 'wizyta');
  for (const n of [2, 3, 4, 22, 23, 24, 102]) assert.equal(wizytyPl(n), 'wizyty', String(n));
  for (const n of [0, 5, 11, 12, 13, 14, 15, 21, 25, 100, 111]) assert.equal(wizytyPl(n), 'wizyt', String(n));
});

test('visitsLabel: PL i EN', () => {
  assert.equal(visitsLabel(1, 'pl'), '1 wizyta');
  assert.equal(visitsLabel(3, 'pl'), '3 wizyty');
  assert.equal(visitsLabel(5, 'pl'), '5 wizyt');
  assert.equal(visitsLabel(0, 'pl'), '0 wizyt');
  assert.equal(visitsLabel(1, 'en'), '1 visit');
  assert.equal(visitsLabel(2, 'en'), '2 visits');
});
