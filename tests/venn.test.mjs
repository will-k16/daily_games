import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundScore, parFor, bucksForRound, vennShareText, scoreBar, scoreSquare } from '../public/js/venn-score.js';
import { suggest, exactMatch, sameAnswer, editDistance } from '../functions/_lib/fuzzy.js';
import { verdictFor } from '../functions/_lib/venn.js';
import { cleanVennPuzzle, cleanJudgment, fallbackVennPuzzle, setKey } from '../functions/_lib/venn-ai.js';
import { VENN_FALLBACK } from '../functions/_lib/venn-fallback.js';
import { resolveMelLook, melItemKey, MEL_DEFAULT_LOOK, MEL_WARDROBE } from '../public/js/mel-wardrobe.js';
import { itemKey } from '../public/js/wardrobe.js';

test('round score: the P = 5 table', () => {
  const want = { 0: 0, 4: 0, 5: 25, 6: 40, 7: 55, 8: 70, 9: 85, 10: 100, 11: 100, 30: 100 };
  for (const [n, s] of Object.entries(want)) assert.equal(roundScore(Number(n), 5), s, `n=${n}`);
});

test('round score: other pars', () => {
  assert.equal(roundScore(2, 3), 0);
  assert.equal(roundScore(3, 3), 25);
  assert.equal(roundScore(4, 3), 50);
  assert.equal(roundScore(6, 3), 100);
  assert.equal(roundScore(9, 6), 63);   // 62.5 rounds up
  assert.equal(roundScore(2, 2), 25);
  assert.equal(roundScore(3, 2), 63);
  assert.equal(roundScore(4, 2), 100);
});

test('par = floor(0.6 × typical), at least 3 (round 1) or 2 (round 2)', () => {
  assert.equal(parFor(10, 1), 6);
  assert.equal(parFor(9, 1), 5);
  assert.equal(parFor(4, 1), 3);
  assert.equal(parFor(0, 1), 3);
  assert.equal(parFor(6, 2), 3);
  assert.equal(parFor(3, 2), 2);
  assert.equal(parFor(1, 2), 2);
});

test('WK Bucks per round: a perfect Venn day pays 50, archive half, unlimited none', () => {
  assert.equal(bucksForRound(100, 'daily') + bucksForRound(100, 'daily'), 50);
  assert.equal(bucksForRound(70, 'daily'), 17);
  assert.equal(bucksForRound(100, 'archive'), 12);
  assert.equal(bucksForRound(100, 'unlimited'), 0);
});

test('share text matches the spec example', () => {
  const text = vennShareText({ number: 1, rounds: [{ round: 1, count: 8, par: 5, score: 70 }, { round: 2, count: 3, par: 2, score: 75 }] }, 'wk-game-suite.pages.dev/venn');
  assert.equal(text, [
    'Venn #1 🦎 145/200',
    '🟡🔵 8 found (par 5) ███████░░░ 🟨 70',
    '🟡🔵🔴 3 found (par 2) ███████░░░ 🟨 75',
    'wk-game-suite.pages.dev/venn'
  ].join('\n'));
  assert.equal(scoreBar(100), '██████████');
  assert.equal(scoreBar(0), '░░░░░░░░░░');
  assert.deepEqual([85, 84, 55, 54, 25, 24, 0].map(scoreSquare), ['🟩', '🟨', '🟨', '🟧', '🟧', '🟥', '🟥']);
});

test('did you mean: fuzzy match against known answers', () => {
  const known = ['carrot', 'Michael Jordan', 'pumpkin', 'cantaloupe', 'bear', 'ice cream'];
  assert.equal(suggest('carot', known), 'carrot');
  assert.equal(suggest('micheal jordan', known), 'Michael Jordan');
  assert.equal(suggest('cantalope', known), 'cantaloupe');
  assert.equal(suggest('pumkin', known), 'pumpkin');
  assert.equal(suggest('carrot', known), null);        // exact: not a typo
  assert.equal(suggest('carrots', known), null);       // plural: same thing
  assert.equal(suggest('beer', known), null);          // short words are left to the judge
  assert.equal(suggest('zebra', known), null);
  assert.equal(exactMatch('Carrots', known), 'carrot');
  assert.equal(exactMatch('icecream', known), 'ice cream');
  assert.ok(sameAnswer('a pumpkin', 'Pumpkins'));
  assert.ok(!sameAnswer('pear', 'bear'));
  assert.equal(editDistance('ab', 'ba'), 1);
});

test('verdicts: ok, already have it, close, wrong, fictional, offensive', () => {
  const j = (canonical, fits, extra = {}) => ({ canonical, fits, reason: '', ...extra });
  assert.equal(verdictFor(j('orange', [true, true]), 2, []).verdict, 'ok');
  assert.equal(verdictFor(j('orange', [true, true]), 2, [{ verdict: 'ok', canonical: 'Oranges' }]).verdict, 'dup');
  assert.equal(verdictFor(j('tiger', [true, false]), 2, []).verdict, 'no');
  assert.equal(verdictFor(j('tiger', [true, true, false]), 3, []).verdict, 'close');
  assert.equal(verdictFor(j('tiger', [true, false, false]), 3, []).verdict, 'no');
  assert.equal(verdictFor(j('Garfield', [true, true], { fictional: true }), 2, []).verdict, 'no');
  assert.equal(verdictFor(j('x', [true, true], { offensive: true }), 2, []).verdict, 'no');
  assert.equal(verdictFor(j('', [false, false]), 2, []).verdict, 'no');
});

test('judge output is cleaned', () => {
  const c = cleanJudgment({ recognized: true, canonical: 'orange', fits: [true, 'yes', true], reason: 'Oranges are orange and people eat them, which is a fact everyone knows well', didYouMean: 'orange', offensive: false, fictional: false }, 2, 'orange');
  assert.deepEqual(c.fits, [true, false]);
  assert.equal(c.didYouMean, '');
  assert.ok(c.reason.split(' ').length <= 14);
  assert.deepEqual(cleanJudgment({ recognized: true, canonical: 'Shrek', fits: [true, true], fictional: true }, 2, 'shrek').fits, [false, false]);
});

test('size check: drafts need 25 (round 1) or 8 (round 2) answers and fresh categories', () => {
  const many = n => Array.from({ length: n }, (_, i) => 'thing ' + i);
  assert.equal(cleanVennPuzzle({ circles: ['Things colored orange', 'Foods people eat'], answers: many(24), typical: 9 }, 1), null);
  const ok = cleanVennPuzzle({ circles: ['Things colored orange', 'Foods people eat'], answers: many(25), typical: 9 }, 1);
  assert.equal(ok.par, 5);
  assert.equal(cleanVennPuzzle({ circles: ['A things', 'Animals', 'Things that fly'], answers: many(7), typical: 4 }, 2), null);
  assert.ok(cleanVennPuzzle({ circles: ['Starts with S', 'Animals', 'Lives in the ocean'], answers: many(8), typical: 4 }, 2));
  assert.equal(cleanVennPuzzle({ circles: ['Things colored orange', 'Foods people eat'], answers: many(30), typical: 9 }, 1,
    { categories: ['Foods people eat'], sets: new Set() }), null);
  assert.equal(cleanVennPuzzle({ circles: ['Foods people eat', 'Things colored orange'], answers: many(30), typical: 9 }, 1,
    { categories: [], sets: new Set([setKey(['Things colored orange', 'Foods people eat'])]) }), null);
});

test('fallback bank: every puzzle passes its own size check', () => {
  VENN_FALLBACK.forEach(f => assert.ok(cleanVennPuzzle(f, f.round), f.circles.join(' + ')));
  const p = fallbackVennPuzzle(2, 3, { categories: ['Sports', 'Animals'], sets: new Set() });
  assert.ok(!p.circles.includes('Sports') && !p.circles.includes('Animals'));
});

test('Mel catalog: defaults, prices and namespaced keys', () => {
  assert.deepEqual(resolveMelLook(null), MEL_DEFAULT_LOOK);
  assert.equal(resolveMelLook({ skin: 'ruby', hat: 'nope' }).hat, 'none');
  assert.equal(melItemKey('hat', 'crown'), 'mel:hat:crown');
  assert.notEqual(melItemKey('hat', 'crown'), itemKey('hat', 'crown'));
  assert.equal(MEL_WARDROBE.hat.find(h => h.id === 'crown').price, 120);
  assert.equal(MEL_WARDROBE.skin[0].c[0], '#3d7a5a');
});
