// Venn scoring, par and share text. Shared by the browser and the API, so the two can never disagree.

export const ROUND_MS = 90000;                 // 90 seconds per round
export const GRACE_MS = 2000;                  // answers arriving later than 90 s + this are refused
export const ROUND_MAX = 100;
export const DAY_MAX = 200;
export const MIN_PAR = { 1: 3, 2: 2 };
export const MIN_ANSWERS = { 1: 25, 2: 8 };    // a draft must list at least this many real answers
export const MAX_ANSWER = 60;                  // characters

/** n counted answers against par P: 0 below par, 25 at par, 100 at double par, linear between. */
export function roundScore(n, par) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const P = Math.max(1, Math.floor(Number(par) || 1));
  if (n < P) return 0;
  if (n >= 2 * P) return ROUND_MAX;
  return Math.round(25 + 75 * (n - P) / P);
}

/** Par = floor(0.6 × typical), never below 3 (round 1) or 2 (round 2). */
export function parFor(typical, round) {
  const min = MIN_PAR[round] || MIN_PAR[1];
  return Math.max(min, Math.floor(0.6 * (Number(typical) || 0)));
}

/** WK Bucks for one finished round: a quarter of the score on the daily, an eighth on the archive. */
export function bucksForRound(score, mode) {
  const s = Math.max(0, Number(score) || 0);
  if (mode === 'daily') return Math.floor(s / 4);
  if (mode === 'archive') return Math.floor(s / 8);
  return 0;
}

export const scoreSquare = s => (s >= 85 ? '🟩' : s >= 55 ? '🟨' : s >= 25 ? '🟧' : '🟥');
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
