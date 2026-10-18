import test from 'node:test';
import assert from 'node:assert/strict';
import { toNumber } from '../functions/_lib/ai.js';
import { resolveLook, cleanName, bucksFor, DEFAULT_LOOK } from '../public/js/wardrobe.js';

test('reads numbers the way models write them', () => {
  assert.equal(toNumber(1500), 1500);
  assert.equal(toNumber('1,500'), 1500);
  assert.equal(toNumber('about 1.5 million'), 1.5e6);
  assert.equal(toNumber('2.5e9'), 2.5e9);
  assert.equal(toNumber('300-400'), 350);
  assert.equal(toNumber('3 × 10^8'), 3e8);
  assert.equal(toNumber('~45 kg'), 45);
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber(-4), 0);
  assert.equal(toNumber(null), 0);
});

test('wardrobe looks and WK Bucks per stage', () => {
  assert.deepEqual(resolveLook(null), DEFAULT_LOOK);
  assert.deepEqual(resolveLook({ fur: 'ginger', hat: 'nope', name: '  Billy <b> ' }), { ...DEFAULT_LOOK, fur: 'ginger', name: 'Billy b' });
  assert.equal(cleanName('<script>'), 'script');
  assert.equal(cleanName('!!!'), '');
  assert.equal(bucksFor(999, 'daily'), 9);
  assert.equal(bucksFor(1000, 'daily'), 15);
  assert.equal(bucksFor(999, 'archive'), 4);
  assert.equal(bucksFor(1000, 'unlimited'), 0);
});
