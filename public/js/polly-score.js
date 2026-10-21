// Polly scoring, WK Bucks, share text, the crowd rule and the date rules for stale questions.
// Shared by the browser and the API, so the two can never disagree.
import { crowd as sharedCrowd } from './charts.js';

export const SLOTS = 3;                        // questions per day
export const QUESTION_MAX = 100;
export const DAY_MAX = 300;
export { MIN_CROWD } from './charts.js';     // players needed before "how everyone did" shows
export const TOWNSFOLK = 30;                   // people in the square
export const SHORT_MAX = 90;                   // the short question
export const LABEL_MAX = 14;                   // each side label
export const STALE_MONTHS = 3;                 // a time-sensitive question should run within 3 months of its poll
export const MAX_AGE_YEARS = 10;               // polls older than this can't be approved (and warn when scheduled)

const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/** The left side's share of people who picked a side, as a whole %. "Don't know" is dropped first. */
export function rescale(leftRaw, rightRaw) {
  const l = Number(leftRaw), r = Number(rightRaw);
  if (!(l >= 0 && r >= 0) || l + r <= 0) return null;
  return Math.round(100 * l / (l + r));
}

/** 0–100 for one question: 100 within 2, 0 at 25 or more off, a steep curve between. */
export function questionScore(guess, real) {
  const d = Math.abs(clampInt(guess, 0, 100) - clampInt(real, 0, 100));
  if (d >= 25) return 0;
  const e = Math.max(0, d - 2);
  return Math.round(100 * Math.pow(1 - e / 23, 1.62));
}

/** WK Bucks for one answered question (daily: score / 7, archive: score / 14, unlimited: 0). */
export function bucksForQuestion(score, mode) {
  const s = Math.max(0, Number(score) || 0);
  if (mode === 'daily') return Math.floor(s / 7);
  if (mode === 'archive') return Math.floor(s / 14);
  return 0;
}
/** The bonus for answering all three (daily 8, archive 4). */
export const dayBonus = mode => (mode === 'daily' ? 8 : mode === 'archive' ? 4 : 0);

/** Score bands: shared by the share squares, the header pips, Polly's crest and her squawks. */
export const band = s => (s >= 100 ? 'perfect' : s >= 85 ? 'green' : s >= 55 ? 'yellow' : s >= 25 ? 'orange' : 'red');
export const scoreSquare = s => ({ perfect: '🎯', green: '🟩', yellow: '🟨', orange: '🟧', red: '🟥' })[band(s)];
export const CREST = { red: 'flat', orange: 'low', yellow: 'half', green: 'high', perfect: 'fan' };
export const crestFor = s => CREST[band(s)];

/** End-of-day mood from the day total (out of 300). */
export function moodFor(total) {
  const t = Number(total) || 0;
  return t >= 270 ? 'thrilled' : t >= 210 ? 'happy' : t >= 150 ? 'okay' : t >= 90 ? 'puzzled' : 'sad';
}

/**
 * Share text. questions: [{ slot, score }] with score null for unanswered ones (shown as "⬜ –").
 * `link` is added as the last line when given (the suite's combined share leaves it off).
 */
export function pollyShareText({ number, questions, archive = false }, link) {
  const qs = [1, 2, 3].map(s => (questions || []).find(q => q && q.slot === s) || { slot: s, score: null });
  const total = qs.reduce((t, q) => t + (q.score == null ? 0 : q.score), 0);
  const lines = [`Polly #${number}${archive ? ' (archive)' : ''} 🦜 ${total}/${DAY_MAX}`,
    qs.map(q => (q.score == null ? '⬜ –' : `${scoreSquare(q.score)} ${q.score}`)).join('  ')];
  if (link) lines.push(link);
  return lines.join('\n');
}

/**
 * How everyone did. rows: [{ player, score }] (daily results only, one per player); `me` = my player id.
 * Below MIN_CROWD players nothing comparative is returned. `buckets` scores per bar (10 for a question, 30 for a day).
 */
export function crowd(rows, me, myScore, bucket = 10) { return sharedCrowd(rows, me, myScore, bucket * 10); }

/* ───────────── Dates (YYYY-MM-DD, UTC) ───────────── */

const parse = d => { const [y, m, dd] = String(d).split('-').map(Number); return { y, m, d: dd }; };
const fmt = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Calendar months later; the day is clamped to the month's end (Nov 30 + 3 months = Feb 28/29). */
export function addMonths(date, n) {
  const p = parse(date);
  const idx = p.y * 12 + (p.m - 1) + n, y = Math.floor(idx / 12), m = idx % 12 + 1;
  return fmt(y, m, Math.min(p.d, daysIn(y, m)));
}
export const addYears = (date, n) => addMonths(date, 12 * n);

/** True when a poll that ended on `pollEnd` is more than 10 years old on `date`. */
export const tooOld = (pollEnd, date) => !!pollEnd && date > addYears(pollEnd, MAX_AGE_YEARS);

/**
 * Why a question running on `runDate` gets the STALE badge (warn only), or '' if it doesn't.
 * Time-sensitive: past poll end + 3 months. Any question: more than 10 years after the poll ended.
 */
export function staleReason(q, runDate) {
  if (!q || !q.poll_end_date || !runDate) return '';
  if (q.time_sensitive && runDate > addMonths(q.poll_end_date, STALE_MONTHS)) return 'Time-sensitive and over 3 months past its poll';
  if (tooOld(q.poll_end_date, runDate)) return 'Over 10 years after its poll';
  return '';
}

/** "Aug 11, 2025" */
export function niceDate(date) {
  if (!date) return '';
  const p = parse(date);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m - 1] + ' ' + p.d + ', ' + p.y;
}
