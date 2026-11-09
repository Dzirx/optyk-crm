import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pick, isValid } = require('../../desktop/src/machine-id.js') as {
  pick: (c: [string, string][]) => { hash: string; source: string; name: string };
  isValid: (v: string) => boolean;
};

const JUNK = [
  '',
  'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
  '00000000-0000-0000-0000-000000000000',
  '03000200-0400-0500-0006-000700080009',
  'To be filled by O.E.M.',
];

for (const value of JUNK) {
  test(`śmieciowy numer „${value}” jest odrzucany`, () => {
    assert.equal(isValid(value), false);
    assert.throws(
      () => pick([['smbios-uuid', value]]),
      (err: NodeJS.ErrnoException) => err.code === 'NO_MACHINE_ID',
    );
  });
}

test('poprawny UUID daje stabilny hash SHA-256 (64 znaki hex)', () => {
  const uuid = '4C4C4544-0042-5710-8052-B7C04F4D3332';
  const a = pick([['smbios-uuid', uuid]]);
  const b = pick([['smbios-uuid', uuid]]);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.hash, b.hash);
  assert.equal(a.source, 'smbios-uuid');
});

test('różne UUID dają różne hashe', () => {
  const a = pick([['smbios-uuid', '4C4C4544-0042-5710-8052-B7C04F4D3332']]);
  const b = pick([['smbios-uuid', '4C4C4544-0042-5710-8052-B7C04F4D3333']]);
  assert.notEqual(a.hash, b.hash);
});

test('pomija śmieciowy numer i bierze następny poprawny', () => {
  const r = pick([['smbios-uuid', ''], ['machine-id', 'abcdef0123456789abcdef0123456789']]);
  assert.equal(r.source, 'machine-id');
});
