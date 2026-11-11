import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedulerEnabled } from '../../lib/sms/scheduler';

test('harmonogram SMS: włączony w produkcji (chmura)', () => {
  assert.equal(schedulerEnabled({ NODE_ENV: 'production' }), true);
});

test('harmonogram SMS: wyłączony w wersji Windows (ma własny licznik)', () => {
  assert.equal(schedulerEnabled({ NODE_ENV: 'production', OPTYK_EDITION: 'desktop' }), false);
  assert.equal(schedulerEnabled({ NODE_ENV: 'production', OPTYK_EDITION: 'desktop', SMS_SCHEDULER: 'on' }), false);
});

test('harmonogram SMS: przełącznik SMS_SCHEDULER', () => {
  assert.equal(schedulerEnabled({ NODE_ENV: 'production', SMS_SCHEDULER: 'off' }), false);
  assert.equal(schedulerEnabled({ NODE_ENV: 'development', SMS_SCHEDULER: 'on' }), true);
});

test('harmonogram SMS: lokalnie (dev, testy) domyślnie wyłączony', () => {
  assert.equal(schedulerEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(schedulerEnabled({}), false);
});
