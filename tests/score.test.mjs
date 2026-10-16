import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGuess, finalScore, inRange } from '../public/js/score.js';
import { parseNum, convert } from '../public/js/units.js';

const lo = 1, hi = 1e12, mid = 1e6;

test('1000 only within 1.05x of the middle', () => {
  assert.equal(scoreGuess(lo, hi, mid), 1000);
  assert.equal(scoreGuess(lo, hi, mid * 1.04), 1000);
  assert.ok(scoreGuess(lo, hi, mid * 1.06) < 1000);
});

test('symmetric by ratio', () => {
  for (const f of [1.5, 2, 3, 10]) assert.equal(scoreGuess(lo, hi, mid * f), scoreGuess(lo, hi, mid / f));
});

test('smoothly decreasing with distance', () => {
  let prev = 1001;
  for (const f of [1, 1.1, 1.5, 2, 3, 5, 10, 30, 100]) { const s = scoreGuess(lo, hi, mid * f); assert.ok(s < prev, `${f}x`); prev = s; }
});

test('0 at or beyond the ends', () => {
  assert.equal(scoreGuess(4.5, 150000, 4.5), 0);
  assert.equal(scoreGuess(4.5, 150000, 200000), 0);
  assert.equal(inRange(4.5, 150000, 4.5), false);
  assert.equal(inRange(4.5, 150000, 821), true);
});

test('narrow ranges are harsher', () => {
  const m = Math.sqrt(30);
  assert.ok(scoreGuess(1, 30, m * 2) < scoreGuess(lo, hi, mid * 2));
});

test('second guess is worth 0.8x', () => {
  assert.equal(finalScore(1000, 2), 800);
  assert.equal(finalScore(734, 1), 734);
});

test('number parsing and conversion', () => {
  assert.equal(parseNum('1,200'), 1200);
  assert.equal(parseNum('1.5 million'), 1.5e6);
  assert.equal(parseNum('12k'), 12000);
  assert.equal(parseNum('3e6'), 3e6);
  assert.ok(Number.isNaN(parseNum('abc')));
  assert.ok(Math.abs(convert(1, 'mass', 'lb', 'g') - 453.592) < 1e-6);
});
