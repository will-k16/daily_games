// Venn scoring, par and share text. Shared by the browser and the API, so the two can never disagree.

export const ROUND_MS = 90000;                 // 90 seconds per round
export const GRACE_MS = 2000;                  // answers arriving later than 90 s + this are refused
export const ROUND_MAX = 100;
export const DAY_MAX = 200;
export const PAR_SHARE = { 1: 0.75, 2: 0.5 };  // par = this share of the AI's typical count (its counts run high)
export const MIN_PAR = { 1: 4, 2: 4 };
export const MAX_PAR = { 1: 10, 2: 6 };     // so one inflated estimate can't make a day impossible
export const MIN_ANSWERS = { 1: 25, 2: 8 };    // a draft must list at least this many real answers
export const MAX_ANSWER = 60;                  // characters
export { MIN_CROWD } from './charts.js';     // players needed before "how everyone did" shows

export const PER_ANSWER = 5;                   // points per answer up to par
export const AT_PAR_MIN = 25;                  // reaching par is worth at least this

/** What reaching par is worth: 25, or 5 per answer when par is above 5 (par 8 = 40), so no answer up to par counts less. */
export const atParScore = par => Math.max(AT_PAR_MIN, PER_ANSWER * Math.max(1, Math.floor(Number(par) || 1)));

/** n counted answers against par P: 5 each below par, atParScore(P) at par, 100 at double par, linear between. */
export function roundScore(n, par) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const P = Math.max(1, Math.floor(Number(par) || 1));
  if (n < P) return n * PER_ANSWER;
  if (n >= 2 * P) return ROUND_MAX;
  const base = atParScore(P);
  return Math.round(base + (ROUND_MAX - base) * (n - P) / P);
}

/**
 * Par = 75% of the AI's typical count for round 1 (kept to 4–10) and 50% for round 2 (kept to 4–6).
 * History: 60% of typical was far too easy (most players doubled par); 100% (2026-10-20) was too hard (nobody did).
 * Against real plays, this puts most players past par and lets a good game reach double par.
 */
export function parFor(typical, round) {
  const r = PAR_SHARE[round] ? round : 1;
  return Math.min(MAX_PAR[r], Math.max(MIN_PAR[r], Math.round((Number(typical) || 0) * PAR_SHARE[r])));
}

/** WK Bucks for one finished round: a quarter of the score on the daily, an eighth on the archive. */
export function bucksForRound(score, mode) {
  const s = Math.max(0, Number(score) || 0);
  if (mode === 'daily') return Math.floor(s / 4);
  if (mode === 'archive') return Math.floor(s / 8);
  return 0;
}

/** Score bands for one round: the share squares, the archive and the history page all use them. */
export const tierOf = s => (s >= 85 ? 'green' : s >= 55 ? 'yellow' : s >= 25 ? 'orange' : 'red');
export const scoreSquare = s => ({ green: '🟩', yellow: '🟨', orange: '🟧', red: '🟥' })[tierOf(s)];
export const scoreBar = s => { const on = Math.max(0, Math.min(10, Math.floor((Number(s) || 0) / 10))); return '█'.repeat(on) + '░'.repeat(10 - on); };
export const CIRCLE_EMOJI = { 1: '🟡🔵', 2: '🟡🔵🔴' };

/**
 * Share text for a day. rounds: [{ round, count, par, score }] for finished rounds only.
 * `link` is added as the last line when given (the combined suite share leaves it off).
 */
export function vennShareText({ number, rounds, archive = false }, link) {
  const done = rounds.filter(r => r && r.score != null).sort((a, b) => a.round - b.round);
  const total = done.reduce((s, r) => s + r.score, 0);
  const lines = [`Venn #${number}${archive ? ' (archive)' : ''} 🦎 ${total}/${DAY_MAX}`];
  done.forEach(r => lines.push(`${CIRCLE_EMOJI[r.round] || CIRCLE_EMOJI[1]} ${r.count} found (par ${r.par}) ${scoreBar(r.score)} ${scoreSquare(r.score)} ${r.score}`));
  if (link) lines.push(link);
  return lines.join('\n');
}
