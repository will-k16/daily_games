// Shared by the browser and the API, so the two can never disagree.

export const PERFECT = Math.log(1.05);           // within 1.05x of the middle = 100
const K = Math.log(3) - PERFECT;                 // 3x off = half credit (on a wide range)
export const SECOND_GUESS_MULT = 0.8;
export const MAX_REJECTS = 3;                    // out-of-range tries per guess before it counts as 0

export function middle(a, b) { return Math.sqrt(a * b); }

export function inRange(a, b, g) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return g > lo && g < hi;
}

/** 0..100. Continuous, tiny perfect zone, 0 at (and beyond) either end. */
export function scoreGuess(a, b, g) {
  const lo = Math.min(Number(a), Number(b)), hi = Math.max(Number(a), Number(b));
  g = Number(g);
  if (!(lo > 0 && hi > lo && g > 0)) return 0;
  if (g <= lo || g >= hi) return 0;
  const mid = Math.sqrt(lo * hi);
  const err = Math.abs(Math.log(g / mid));
  const half = Math.log(hi / mid);
  const e = Math.max(0, err - PERFECT);
  if (e === 0) return 100;
  const span = Math.max(1e-9, half - PERFECT);
  const pos = Math.max(0, 1 - e / span);
  const prec = 1 / (1 + (e / K) ** 2);
  return Math.max(0, Math.min(99, Math.floor(100 * pos * prec)));
}

export function finalScore(raw, attempt) {
  return attempt === 2 ? Math.round(raw * SECOND_GUESS_MULT) : raw;
}

/** 0..1 position of g on a log scale from a to b (can go outside). */
export function logPos(a, b, g) {
  const la = Math.log(a), lb = Math.log(b);
  return (Math.log(g) - la) / (lb - la);
}
