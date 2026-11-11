import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  campaignRemaining, isCampaignActive, isStaleClaim, isValidIdempotencyKey, messagePreview,
  newIdempotencyKey, renderCampaignMessage, uniqueIds, CLAIM_STALE_MS,
} from '../../lib/sms/campaign-helpers';
import { odbiorcyPl, recipientsLabel } from '../../lib/plural';

test('renderCampaignMessage: {name} i {staff}, wiele wystąpień', () => {
  assert.equal(renderCampaignMessage('Cześć {name}! {name}, {staff}', 'Jan Nowak', 'Optyk'), 'Cześć Jan Nowak! Jan Nowak, Optyk');
});

test('renderCampaignMessage: znaki specjalne w nazwie nie są wzorcami zamiany', () => {
  assert.equal(renderCampaignMessage('Hej {name}', "Anna $& $1 $'", 'X'), "Hej Anna $& $1 $'");
});

test('messagePreview: skraca do 60 znaków i spłaszcza białe znaki', () => {
  assert.equal(messagePreview('a\n\nb   c'), 'a b c');
  const long = 'x'.repeat(100);
  const p = messagePreview(long, 60);
  assert.equal(p.length, 60);
  assert.ok(p.endsWith('…'));
  assert.equal(messagePreview('krótki'), 'krótki');
});

test('isValidIdempotencyKey: 8–64 znaków [A-Za-z0-9_-]', () => {
  assert.equal(isValidIdempotencyKey('12345678'), true);
  assert.equal(isValidIdempotencyKey('a3f1c1de-0000-4000-8000-123456789abc'), true);
  assert.equal(isValidIdempotencyKey('short'), false);
  assert.equal(isValidIdempotencyKey('x'.repeat(65)), false);
  assert.equal(isValidIdempotencyKey('spacja w kluczu'), false);
  assert.equal(isValidIdempotencyKey(123456789), false);
  assert.equal(isValidIdempotencyKey(undefined), false);
});

test('newIdempotencyKey: poprawny i unikalny', () => {
  const a = newIdempotencyKey();
  const b = newIdempotencyKey();
  assert.equal(isValidIdempotencyKey(a), true);
  assert.notEqual(a, b);
});

test('uniqueIds: bez powtórzeń, kolejność zachowana', () => {
  assert.deepEqual(uniqueIds(['b', 'a', 'b', 'c', 'a']), ['b', 'a', 'c']);
});

test('isCampaignActive / campaignRemaining', () => {
  assert.equal(isCampaignActive('queued'), true);
  assert.equal(isCampaignActive('sending'), true);
  assert.equal(isCampaignActive('done'), false);
  assert.equal(isCampaignActive('cancelled'), false);
  assert.equal(campaignRemaining({ total: 120, sent: 45, failed: 5 }), 70);
  assert.equal(campaignRemaining({ total: 10, sent: 10, failed: 3 }), 0);
});

test('isStaleClaim: rezerwacja starsza niż 5 minut jest porzucona', () => {
  const now = Date.now();
  assert.equal(isStaleClaim(null, now), true);
  assert.equal(isStaleClaim(new Date(now - CLAIM_STALE_MS + 1000), now), false);
  assert.equal(isStaleClaim(new Date(now - CLAIM_STALE_MS), now), true);
});

test('odmiana „do N odbiorców”', () => {
  assert.equal(odbiorcyPl(1), 'odbiorcy');
  assert.equal(odbiorcyPl(2), 'odbiorców');
  assert.equal(odbiorcyPl(5), 'odbiorców');
  assert.equal(recipientsLabel(1, 'pl'), '1 odbiorcy');
  assert.equal(recipientsLabel(22, 'pl'), '22 odbiorców');
  assert.equal(recipientsLabel(1, 'en'), '1 recipient');
  assert.equal(recipientsLabel(3, 'en'), '3 recipients');
});
