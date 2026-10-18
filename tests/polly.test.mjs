import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  questionScore, rescale, bucksForQuestion, dayBonus, pollyShareText, scoreSquare, crestFor, moodFor, crowd,
  addMonths, staleReason, tooOld, MIN_CROWD, niceDate
} from '../public/js/polly-score.js';
import { pickForDay, fitsDay, reuseOrder, pollyStreaks, urlKey } from '../functions/_lib/polly.js';
import { checkCandidate, dateInText, sampleInText, isUsAdults, sourceForUrl, htmlToText } from '../functions/_lib/polly-ai.js';
import { approvalProblems } from '../functions/_lib/polly-admin.js';
import { resolvePollyLook, pollyItemKey, POLLY_DEFAULT_LOOK, POLLY_WARDROBE } from '../public/js/polly-wardrobe.js';
import { MIN_CROWD as SUMMIT_CROWD } from '../public/js/score.js';
import { MIN_CROWD as VENN_CROWD } from '../public/js/venn-score.js';

test('score: every value in the spec table', () => {
  const table = { 0: 100, 1: 100, 2: 100, 3: 93, 4: 86, 5: 80, 6: 73, 7: 67, 8: 61, 10: 50, 12: 40, 15: 26, 18: 15, 20: 8, 22: 4, 24: 1, 25: 0, 40: 0, 100: 0 };
  for (const [off, want] of Object.entries(table)) {
    assert.equal(questionScore(50 + Math.min(50, Number(off)), 50 + Math.min(50, Number(off)) - Number(off)), want, `off ${off}`);
    assert.equal(questionScore(0, Number(off)), Number(off) <= 100 ? want : 0, `off ${off} from 0`);
  }
});

test('score: every whole score from 0 to 100 is possible, and the curve never goes up as you miss by more', () => {
  const seen = new Set();
  let prev = 101;
  for (let d = 0; d <= 30; d++) { const s = questionScore(d, 0); assert.ok(s <= prev); prev = s; seen.add(s); }
  assert.ok(seen.has(0) && seen.has(100));
});

test('rescaling drops "don\'t know" and rounds to a whole %', () => {
  assert.equal(rescale(45, 30), 60);           // 45 yes / 30 no / 25 unsure → 60
  assert.equal(rescale(50, 50), 50);
  assert.equal(rescale(62.5, 37.5), 63);       // 62.5 rounds up
  assert.equal(rescale(1, 2), 33);
  assert.equal(rescale(0, 0), null);
});

test('WK Bucks: a perfect day is 50 (daily) and 25 (archive), unlimited pays nothing', () => {
  assert.equal(3 * bucksForQuestion(100, 'daily') + dayBonus('daily'), 50);
  assert.equal(3 * bucksForQuestion(100, 'archive') + dayBonus('archive'), 25);
  assert.equal(bucksForQuestion(73, 'daily'), 10);
  assert.equal(bucksForQuestion(100, 'unlimited') + dayBonus('unlimited'), 0);
});

test('share text with 🎯, the archive header, and ⬜ – for unanswered questions', () => {
  assert.equal(pollyShareText({ number: 12, questions: [{ slot: 1, score: 100 }, { slot: 2, score: 73 }, { slot: 3, score: 68 }] }, 'wk-game-suite.pages.dev/polly'),
    'Polly #12 🦜 241/300\n🎯 100  🟨 73  🟨 68\nwk-game-suite.pages.dev/polly');
  assert.equal(pollyShareText({ number: 12, archive: true, questions: [{ slot: 1, score: 100 }, { slot: 2, score: 73 }, { slot: 3, score: 68 }] }).split('\n')[0],
    'Polly #12 (archive) 🦜 241/300');
  assert.equal(pollyShareText({ number: 3, questions: [{ slot: 1, score: 90 }] }), 'Polly #3 🦜 90/300\n🟩 90  ⬜ –  ⬜ –');
  assert.deepEqual([100, 99, 85, 84, 55, 54, 25, 24, 0].map(scoreSquare), ['🎯', '🟩', '🟩', '🟨', '🟨', '🟧', '🟧', '🟥', '🟥']);
  assert.deepEqual([100, 90, 60, 30, 10].map(crestFor), ['fan', 'high', 'half', 'low', 'flat']);
  assert.deepEqual([300, 270, 269, 210, 150, 90, 89].map(moodFor), ['thrilled', 'thrilled', 'happy', 'happy', 'okay', 'puzzled', 'sad']);
});

test('the 5-player rule: no comparisons below 5, the same constant in all three games', () => {
  assert.equal(MIN_CROWD, 5); assert.equal(SUMMIT_CROWD, 5); assert.equal(VENN_CROWD, 5);
  const rows = n => Array.from({ length: n }, (_, i) => ({ player: 'p' + i, score: i * 20 }));
  assert.deepEqual(crowd(rows(4), 'p0', 0), { total: 4, few: true });
  const c = crowd(rows(5), 'p2', 40);           // others: 0, 20, 60, 80 → 2 of 4 strictly lower
  assert.equal(c.few, undefined);
  assert.equal(c.beat, 50);
  assert.equal(c.hist.reduce((a, b) => a + b, 0), 5);
  assert.equal(c.hist[8], 1);                   // 80 → the 80–89 bar
  assert.equal(crowd([{ player: 'a', score: 100 }, ...rows(4)], 'a', 100).hist[9], 1);   // 100 shares the 90–100 bar
  assert.equal(crowd([{ player: 'a', score: 300 }, ...rows(4)], 'a', 300, 30).hist[9], 1);
});

test('day rules: at most 1 politics, never the same URL, three topics where possible', () => {
  const q = (id, topic, url = 'https://pewresearch.org/q' + id) => ({ id, topic, url });
  assert.ok(!fitsDay(q(2, 'politics'), [q(1, 'politics')]));
  assert.ok(!fitsDay(q(2, 'life', 'http://www.pewresearch.org/a/'), [q(1, 'money', 'https://pewresearch.org/a')]));
  assert.equal(urlKey('https://www.Gallup.com/poll/1/#x'), 'gallup.com/poll/1');
  // Oldest first, but a different topic wins over a repeat.
  const pool = [q(1, 'life'), q(2, 'life'), q(3, 'politics'), q(4, 'politics'), q(5, 'money')];
  assert.deepEqual(pickForDay(pool, [], 3).map(x => x.id), [1, 3, 5]);
  // Topics relax when the bank can't do three; politics and URLs never do.
  assert.deepEqual(pickForDay([q(1, 'life'), q(2, 'life'), q(3, 'life')], [], 3).map(x => x.id), [1, 2, 3]);
  assert.deepEqual(pickForDay([q(1, 'politics'), q(2, 'politics'), q(3, 'politics')], [], 3).map(x => x.id), [1]);
  assert.deepEqual(pickForDay([q(1, 'life', 'https://a.org/x'), q(2, 'money', 'https://a.org/x'), q(3, 'beliefs')], [], 3).map(x => x.id), [1, 3]);
  // A day that already has a question.
  assert.deepEqual(pickForDay([q(2, 'politics'), q(3, 'money')], [q(1, 'politics')], 2).map(x => x.id), [3]);
});

test('reuse picks the longest-ago run and never a time-sensitive question', () => {
  const qs = [
    { id: 1, status: 'approved', time_sensitive: 0, last_run_date: '2026-09-01', topic: 'life', url: 'u1' },
    { id: 2, status: 'approved', time_sensitive: 1, last_run_date: '2026-01-01', topic: 'money', url: 'u2' },
    { id: 3, status: 'approved', time_sensitive: 0, last_run_date: '2026-03-01', topic: 'beliefs', url: 'u3' },
    { id: 4, status: 'retired', time_sensitive: 0, last_run_date: '2025-01-01', topic: 'life', url: 'u4' },
    { id: 5, status: 'approved', time_sensitive: 0, last_run_date: null, topic: 'life', url: 'u5' }
  ];
  assert.deepEqual(reuseOrder(qs).map(x => x.id), [3, 1]);
  assert.equal(pickForDay(reuseOrder(qs), [], 1)[0].id, 3);
});

test('stale: time-sensitive past 3 months, anything past 10 years; approval blocked over 10 years', () => {
  assert.equal(addMonths('2025-08-11', 3), '2025-11-11');
  assert.equal(addMonths('2025-11-30', 3), '2026-02-28');
  assert.equal(addMonths('2027-11-30', 3), '2028-02-29');
  const ts = { time_sensitive: 1, poll_end_date: '2025-08-11' };
  assert.equal(staleReason(ts, '2025-11-11'), '');
  assert.ok(staleReason(ts, '2025-11-12'));
  assert.equal(staleReason({ ...ts, time_sensitive: 0 }, '2026-06-01'), '');
  assert.ok(staleReason({ time_sensitive: 0, poll_end_date: '2016-01-01' }, '2026-01-02'));
  assert.equal(staleReason({ time_sensitive: 0, poll_end_date: '2016-01-01' }, '2026-01-01'), '');
  assert.ok(tooOld('2016-10-17', '2026-10-18'));
  assert.ok(!tooOld('2016-10-18', '2026-10-18'));
  assert.equal(niceDate('2025-08-11'), 'Aug 11, 2025');
});

const PAGE = `National survey of 1,024 U.S. adults conducted Aug. 4-11, 2025.
Would you rather be 10 minutes early or 10 minutes late?
Overall, 45% of Americans say early, 30% say late and 25% are not sure.
Republicans: 50% early.`;
const GOOD = {
  original_wording: 'Would you rather be 10 minutes early or 10 minutes late?', short: 'Early or late by 10 minutes?', left_label: 'Early', right_label: 'Late',
  left_raw: 45, right_raw: 30, unsure_raw: 25, population: 'US adults', poll_end_date: '2025-08-11', sample_size: 1024,
  topic: 'life', time_sensitive: false, ts_reason: '', evidence: 'Overall, 45% of Americans say early, 30% say late and 25% are not sure.'
};

test('server check: a good candidate passes, with the date and sample size checked against the page', () => {
  const r = checkCandidate(GOOD, PAGE);
  assert.ok(r.ok, r.reasons.join(' '));
  assert.equal(r.q.real, 60);
  assert.ok(r.dateChecked && r.sampleChecked);
  assert.equal(r.q.poll_end_date, '2025-08-11');
  // Whitespace and case don't matter.
  assert.ok(checkCandidate({ ...GOOD, evidence: 'OVERALL,   45% of americans say early,\n30% say late and 25% are not sure.' }, PAGE).ok);
});

test('server check: each rule fails on its own', () => {
  const fails = (patch, re) => { const r = checkCandidate({ ...GOOD, ...patch }, PAGE); assert.ok(!r.ok, JSON.stringify(patch)); assert.match(r.reasons.join(' '), re); };
  fails({ evidence: '45% say early, 30% say late (made up)' }, /evidence snippet/);                    // 1
  fails({ left_raw: 46 }, /left number \(46\)/);                                                        // 2
  fails({ unsure_raw: 24 }, /unsure number/);                                                           // 2
  fails({ original_wording: 'Would you rather be early?' }, /original wording/);                        // 3
  fails({ evidence: 'Overall, 45% of Americans say early, 30% say late', unsure_raw: null }, /add up to 75/);  // 4
  fails({ population: 'Republicans' }, /not US adults/);                                                // 5
  fails({ left_label: 'Ten minutes early' }, /left label/);                                             // 6
  fails({ short: 'x'.repeat(91) }, /short wording/);                                                    // 6
  // A date or sample size the page doesn't state comes back blank (required later), not a failure.
  const r = checkCandidate({ ...GOOD, poll_end_date: '2025-08-12', sample_size: 1500 }, PAGE);
  assert.ok(r.ok);
  assert.equal(r.q.poll_end_date, null);
  assert.equal(r.q.sample_size, null);
});

test('dates, sample sizes and populations in page text', () => {
  assert.ok(dateInText('2025-08-11', 'Fielded August 11, 2025.'));
  assert.ok(dateInText('2025-08-11', 'conducted July 28-Aug. 11, 2025'));
  assert.ok(dateInText('2025-08-11', 'Survey dates: 8/11/2025'));
  assert.ok(!dateInText('2025-08-11', 'conducted Sept. 11, 2025'));
  assert.ok(sampleInText(1024, 'n=1,024'));
  assert.ok(!sampleInText(1024, 'n=10,240'));
  ['US adults', 'U.S. adults', 'American adults', 'adults in the United States', 'Americans'].forEach(p => assert.ok(isUsAdults(p), p));
  ['registered voters', 'US parents', 'Democrats', 'US adults under 30'].forEach(p => assert.ok(!isUsAdults(p), p));
});

test('allowlist: a domain or any subdomain of it; everything else is refused', () => {
  const sources = [{ id: 1, name: 'Pew', domains: ['pewresearch.org'], active: 1 }, { id: 2, name: 'Off', domains: ['ipsos.com'], active: 0 }];
  assert.equal(sourceForUrl(sources, 'https://www.pewresearch.org/short-reads/x').id, 1);
  assert.equal(sourceForUrl(sources, 'https://pewresearch.org').id, 1);
  assert.equal(sourceForUrl(sources, 'https://pewresearch.org.evil.com/x'), null);
  assert.equal(sourceForUrl(sources, 'https://notpewresearch.org/x'), null);
  assert.equal(sourceForUrl(sources, 'https://www.ipsos.com/x'), null);       // turned off
  assert.equal(sourceForUrl(sources, 'ftp://pewresearch.org/x'), null);
});

test('HTML is stripped to text', () => {
  const t = htmlToText('<html><head><title>x</title></head><body><script>var a="45%"</script><p>Yes&nbsp;<b>45%</b></p><p>No 30&#37;</p></body></html>');
  assert.equal(t, 'Yes 45%\nNo 30%');
});

test('approval needs every field, an exact poll date and a poll under 10 years old', () => {
  const sources = [{ id: 1, name: 'Pew', domains: ['pewresearch.org'], active: 1 }];
  const f = { short: 'Early or late?', left_label: 'Early', right_label: 'Late', left_raw: 45, right_raw: 30, real: 60, original_wording: 'x',
    source_id: 1, url: 'https://www.pewresearch.org/a', poll_end_date: '2025-08-11', sample_size: 1024, topic: 'life', time_sensitive: 0 };
  assert.deepEqual(approvalProblems(f, sources, '2026-10-18'), []);
  assert.match(approvalProblems({ ...f, poll_end_date: null }, sources, '2026-10-18').join(), /poll end date/);
  assert.match(approvalProblems({ ...f, sample_size: null }, sources, '2026-10-18').join(), /sample size/);
  assert.match(approvalProblems({ ...f, url: 'https://gallup.com/a' }, sources, '2026-10-18').join(), /source's site/);
  assert.deepEqual(approvalProblems({ ...f, poll_end_date: '2016-10-17' }, sources, '2026-10-18'), ['Poll is over 10 years old.']);
});

test('Polly streak: all 3 answered counts; a day with no poll doesn\'t break it', () => {
  const polls = ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'];   // no poll on 10-03
  assert.deepEqual(pollyStreaks(['2026-10-01', '2026-10-02', '2026-10-04'], polls, '2026-10-05', '2026-10-01'), { streak: 3, max: 3 });
  assert.deepEqual(pollyStreaks(['2026-10-01', '2026-10-04', '2026-10-05'], polls, '2026-10-05', '2026-10-01'), { streak: 2, max: 2 });
  assert.equal(pollyStreaks([], polls, '2026-10-05', '2026-10-01').streak, 0);
});

test('Polly shop: defaults, prices and namespaced keys', () => {
  assert.deepEqual(resolvePollyLook(null), POLLY_DEFAULT_LOOK);
  assert.equal(resolvePollyLook({ hat: 'crown', crest: 'nope', visitors: 'ducks' }).crest, 'sunny');
  assert.equal(resolvePollyLook({ visitors: 'ducks' }).visitors, 'ducks');
  assert.equal(pollyItemKey('hat', 'crown'), 'polly:hat:crown');
  assert.equal(POLLY_WARDROBE.crest[0].c, '#f2c230');
  assert.equal(POLLY_WARDROBE.fountain.find(f => f.id === 'golden').price, 100);
});
