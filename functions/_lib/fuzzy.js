// Spelling help for Venn, run on the server so the puzzle's answer list never reaches the browser.
// "Did you mean ___?" comes from a plain edit-distance match against the known answers.
import { normalize } from './util.js';

/** The form two answers are compared in: lowercase, no articles, punctuation or spaces. */
export function squash(s) {
  return normalize(String(s || '').replace(/[’']/g, '').replace(/[-–]/g, ' ')).replace(/[^a-z0-9]/g, '');
}

/** The squashed form plus its possible singulars ("horses" → horses, horse, hors). */
function forms(s) {
  const x = squash(s);
  return x.length > 3 ? [x, x.replace(/s$/, ''), x.replace(/es$/, '')] : [x];
}

/** True when two answers name the same thing apart from case, spacing, punctuation or a plural. */
export function sameAnswer(a, b) {
  const fa = forms(a), fb = forms(b);
  return !!fa[0] && !!fb[0] && fa.some(x => fb.includes(x));
}

/** Optimal string alignment distance (Levenshtein plus swapping two neighbors). */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** The known answer that is the same as the input apart from case, spacing, punctuation or a plural (or null). */
export function exactMatch(input, candidates) {
  return candidates.find(c => sameAnswer(input, c)) || null;
}

/** How many typos a word of this length may have and still get a suggestion. */
const allowed = len => (len < 5 ? 0 : len <= 6 ? 1 : len <= 9 ? 2 : 3);

/**
 * The closest known answer when the input looks like a misspelling of it, else null.
 * Exact matches return null too (that isn't a typo).
 */
export function suggest(input, candidates) {
  const a = squash(input), max = allowed(a.length);
  if (!max) return null;
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const b = squash(c);
    if (!b) continue;
    if (sameAnswer(input, c)) return null;
    if (Math.abs(b.length - a.length) > max) continue;
    const d = editDistance(a, b);
    if (d <= max && d < bestD) { best = c; bestD = d; }
  }
  return best;
}
