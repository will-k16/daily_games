import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayNumber, parseDate, span, showDate, lifeOf, eventSpan, scoreLife, bucksForRound, lifelineShareText, band, yearOf, yearLabel, PREC
} from '../public/js/lifeline-score.js';
import { resolveRaceLook, RACE_DEFAULT_LOOK, raceItemKey } from '../public/js/race-wardrobe.js';
import { readDate, parseLifeline } from '../functions/_lib/lifeline-admin.js';
import { nameKey, cleanDesc } from '../functions/_lib/lifeline-wiki.js';
import { BANK } from '../functions/_lib/lifeline-bank.js';
import { PEOPLE } from '../functions/_lib/lifeline-people.js';

const ev = (date, prec = PREC.DAY) => eventSpan({ date, prec });
const life = (birth, death, today = dayNumber(2026, 10, 22)) => lifeOf({ birth, birthPrec: PREC.DAY, death, deathPrec: PREC.DAY }, today);
const PEARL = ev('1941-12-07'), MOON = ev('1969-07-20');

test('day numbers: the epoch, leap years and BCE dates', () => {
  assert.equal(dayNumber(1970, 1, 1), 0);
  assert.equal(dayNumber(2000, 3, 1) - dayNumber(2000, 2, 28), 2);          // 2000 is a leap year
  assert.equal(dayNumber(1900, 3, 1) - dayNumber(1900, 2, 28), 1);          // 1900 isn't
  const caesar = span('-0044-03-15'), actium = span('-0031-09-02');
  assert.ok(actium.lo > caesar.lo);
  assert.equal(Math.round((actium.lo - caesar.lo) / 365.25), 13);
  assert.equal(yearLabel(yearOf(caesar.lo)), '44 BCE');
});

test('dates: precision turns into a span of days', () => {
  assert.deepEqual(parseDate('+1809-02-12T00:00:00Z'), { y: 1809, m: 2, d: 12 });
  assert.deepEqual(parseDate('1543'), { y: 1543, m: 0, d: 0 });
  assert.equal(parseDate('0000-01-01'), null);                                // there's no year 0
  const y = span('1543-01-01', PREC.YEAR);
  assert.equal(y.hi - y.lo, 364);
  const c = span('1100-00-00', PREC.CENTURY);                                 // the 11th century
  assert.equal(yearLabel(yearOf(c.lo)), '1001'); assert.equal(yearLabel(yearOf(c.hi)), '1100');
  assert.equal(span('1500-00-00', 6), null);                                   // millennium: too vague
  assert.equal(showDate('1941-12-07'), 'Dec 7, 1941');
  assert.equal(showDate('-0044-03-15'), 'Mar 15, 44 BCE');
  assert.equal(showDate('1543-01-01', PREC.YEAR), '1543');
});

test('lives: someone alive today runs to today; old people with no death date are refused', () => {
  const today = dayNumber(2026, 10, 22);
  assert.equal(life('1946-06-14', '').to, today);
  assert.equal(life('1946-06-14', '').living, true);
  assert.equal(life('1809-02-12', '').error, 'no-death');
  assert.equal(lifeOf({ birth: '', death: '1900-01-01' }).error, 'no-birth');
});

test('scoring: alive for both is 1,000', () => {
  const r = scoreLife(life('1911-02-06', '2004-06-05'), PEARL, MOON);            // Ronald Reagan
  assert.equal(r.score, 1000); assert.equal(r.kind, 'both');
});

test('scoring: alive for one is 500 plus up to 250 for reaching toward the other', () => {
  const churchill = scoreLife(life('1874-11-30', '1965-01-24'), PEARL, MOON);
  assert.equal(churchill.kind, 'one'); assert.ok(churchill.aliveA && !churchill.aliveB);
  assert.ok(churchill.score > 700 && churchill.score < 750);
  const justAfter = scoreLife(life('1900-01-01', '1941-12-08'), PEARL, MOON);
  assert.equal(justAfter.score, 500);
  const early = scoreLife(life('1942-06-01', '2020-01-01'), PEARL, MOON);        // alive for the second only, born soon after the first
  assert.equal(early.kind, 'one'); assert.ok(early.aliveB && early.score > 740);
  const late = scoreLife(life('1968-01-01', '2020-01-01'), PEARL, MOON);         // born long after the first
  assert.ok(late.score >= 500 && late.score < 520);
  // every "one" score sits between 500 and 750
  for (let y = 1920; y < 1969; y++) { const s = scoreLife(life('1900-01-01', `${y}-06-01`), PEARL, MOON).score; if (y >= 1942) assert.ok(s >= 500 && s <= 750, `${y}: ${s}`); }
});

test('scoring: alive for neither but in between scores up to 250 by how much of the gap they lived', () => {
  const r = scoreLife(life('1942-01-01', '1969-07-01'), PEARL, MOON);
  assert.equal(r.kind, 'between'); assert.ok(r.score > 240 && r.score <= 250);
  const short = scoreLife(life('1950-01-01', '1951-01-01'), PEARL, MOON);
  assert.ok(short.score < 15);
});

test('scoring: wholly before or after scores a little when close, nothing when far', () => {
  const close = scoreLife(life('1850-01-01', '1941-11-01'), PEARL, MOON);
  assert.equal(close.kind, 'outside'); assert.ok(close.score > 90 && close.score <= 100);
  const far = scoreLife(life('1735-10-19', '1826-07-04'), PEARL, MOON);         // John Adams
  assert.equal(far.score, 0);
  const after = scoreLife(life('1975-01-01', ''), PEARL, MOON);
  assert.equal(after.kind, 'outside'); assert.ok(after.score > 0 && after.score < 100);
});

test('scoring: a year-only date gets the benefit of the doubt', () => {
  const a = ev('1543-01-01', PREC.YEAR);
  const p = lifeOf({ birth: '1500-01-01', birthPrec: PREC.YEAR, death: '1543-01-01', deathPrec: PREC.YEAR });
  assert.equal(scoreLife(p, ev('1519-09-20'), a).score, 1000);                  // died "in 1543": counts for an event that year
});

test('WK Bucks, bands and share text', () => {
  assert.equal(bucksForRound(1000, 'daily'), 15);
  assert.equal(bucksForRound(709, 'daily'), 7);
  assert.equal(bucksForRound(709, 'archive'), 3);
  assert.equal(bucksForRound(709, 'unlimited'), 0);
  assert.deepEqual([1000, 600, 100, 0].map(band), ['perfect', 'one', 'near', 'miss']);
  assert.equal(lifelineShareText({ number: 3, rounds: [{ round: 1, score: 1000 }, { round: 2, score: 709 }, { round: 3, score: null }] }, 'x.dev/lifeline'),
    'Lifeline #3 🟩🟨⬜\n1,709 / 3,000\nx.dev/lifeline');
});

test('admin dates and the paste-in format', () => {
  assert.deepEqual(readDate('1941-12-07'), { date: '1941-12-07', prec: PREC.DAY });
  assert.deepEqual(readDate('1543'), { date: '1543-01-01', prec: PREC.YEAR });
  assert.deepEqual(readDate('44 BCE'), { date: '-0044-01-01', prec: PREC.YEAR });
  assert.deepEqual(readDate('1543-01-01', PREC.YEAR), { date: '1543-01-01', prec: PREC.YEAR });
  const days = parseLifeline('DAY 2026-11-02\n1 | Pearl Harbor | 1941-12-07 | Moon landing | 1969-07-20 | Ronald Reagan; Elizabeth II\n2 | Late | 1969-07-20 | Early | 1941-12-07\nDAY\n3 | A | 1543 | B | 1519-09-20');
  assert.equal(days.length, 2);
  assert.equal(days[0].date, '2026-11-02');
  assert.equal(days[0].rounds.length, 1);
  assert.deepEqual(days[0].rounds[0].examples, ['Ronald Reagan', 'Elizabeth II']);
  assert.match(days[0].errors[0], /after the first/);
  assert.match(days[1].errors[0], /after the first/);
});

test('names and descriptions', () => {
  assert.equal(nameKey('Frédéric  Chopin'), 'frederic chopin');
  assert.equal(nameKey('Dr. Seuss'), 'dr seuss');
  assert.equal(cleanDesc('president of the United States from 1861 to 1865 (1809-1865)'), 'president of the United States from 1861 to 1865');
});

test('the built-in bank: three rounds a day, every pair has examples alive for both', () => {
  assert.ok(BANK.length >= 12);
  const people = Object.fromEntries(PEOPLE.map(p => [p.n, p]));
  for (const day of BANK) {
    assert.deepEqual(day.map(r => r.round), [1, 2, 3]);
    for (const r of day) {
      assert.ok(r.examples.length >= 2, r.a.label);
      for (const n of r.examples) {
        const p = people[n];
        const l = lifeOf({ birth: p.b, birthPrec: p.bp, death: p.d, deathPrec: p.dp });
        assert.equal(scoreLife(l, eventSpan(r.a), eventSpan(r.b)).score, 1000, `${n} for ${r.a.label}`);
      }
    }
  }
});

test('Race\'s look: defaults and unknown items are dropped', () => {
  assert.deepEqual(resolveRaceLook({}), RACE_DEFAULT_LOOK);
  assert.deepEqual(resolveRaceLook({ fur: 'cocoa', hat: 'nope', name: '  Zoom ' }), { ...RACE_DEFAULT_LOOK, fur: 'cocoa', name: 'Zoom' });
  assert.equal(raceItemKey('hat', 'fez'), 'race:hat:fez');
});
