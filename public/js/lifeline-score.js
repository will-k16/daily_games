// Lifeline: dates, lifespans, scoring, WK Bucks and share text. Shared by the browser and the API, so
// the two can never disagree.
//
// Dates are written like Wikidata's: "1809-02-12" or "-0044-03-15" (a negative year is BCE, with no
// year 0), each with a precision: 11 = day, 10 = month, 9 = year, 8 = decade, 7 = century. Every date
// becomes a span of days [lo, hi], so "1809" (year precision) is Jan 1 to Dec 31, 1809.

export const ROUNDS = 3;
export const ROUND_MAX = 1000;
export const DAY_MAX = 3000;
export const ONE_BASE = 500, ONE_TOP = 750;     // alive for exactly one event: 500, plus up to 250 for reaching toward the other
export const BETWEEN_MAX = 250;                 // alive for neither, but lived between them
export const OUTSIDE_MAX = 100;                 // alive for neither, lived wholly before or after
export const DAY_BONUS = 5;                     // finishing all three daily rounds
export const PREC = { DAY: 11, MONTH: 10, YEAR: 9, DECADE: 8, CENTURY: 7 };
const YEAR_DAYS = 365.2425;

/* ───────────── Days ───────────── */

/** Days since 1970-01-01 for a proleptic Gregorian date; `y` is astronomical (1 BCE = 0). */
export function dayNumber(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
const astro = y => (y < 0 ? y + 1 : y);
const monthDays = (y, m) => dayNumber(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - dayNumber(y, m, 1);

/** "+1809-02-12T00:00:00Z", "1809-02-12", "-0044-03-15", "1543" → { y (historical, BCE negative), m, d } or null. */
export function parseDate(s) {
  const m = /^([+-]?)(\d{1,6})(?:-(\d{2})-(\d{2}))?(?:T|$)/.exec(String(s || '').trim());
  if (!m) return null;
  const y = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  if (!y) return null;
  return { y, m: Number(m[3] || 0), d: Number(m[4] || 0) };
}

/** The span of days a date could mean, given its precision. → { lo, hi } or null when too vague (or unreadable). */
export function span(s, prec = PREC.DAY) {
  const p = parseDate(s);
  prec = Number(prec);
  if (!p || !(prec >= PREC.CENTURY)) return null;
  const Y = astro(p.y), mo = Math.min(12, Math.max(1, p.m || 1));
  if (prec >= PREC.DAY && p.m && p.d) { const n = dayNumber(Y, mo, Math.min(p.d, monthDays(Y, mo))); return { lo: n, hi: n }; }
  if (prec >= PREC.MONTH && p.m) return { lo: dayNumber(Y, mo, 1), hi: dayNumber(Y, mo, 1) + monthDays(Y, mo) - 1 };
  if (prec >= PREC.YEAR) return { lo: dayNumber(Y, 1, 1), hi: dayNumber(Y + 1, 1, 1) - 1 };
  if (prec >= PREC.DECADE) { const y0 = Y - (((Y % 10) + 10) % 10); return { lo: dayNumber(y0, 1, 1), hi: dayNumber(y0 + 10, 1, 1) - 1 }; }
  // Century: Wikidata writes the 11th century as 1100 (1001–1100) and the 9th century BCE as -900 (900–801 BCE).
  const c0 = p.y > 0 ? Y - 99 : Y;
  return { lo: dayNumber(c0, 1, 1), hi: dayNumber(c0 + 100, 1, 1) - 1 };
}

export const todayNumber = (now = new Date()) => dayNumber(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());

/* ───────────── Showing dates ───────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const yearText = y => (y < 0 ? `${-y} BCE` : String(y));

/** "Feb 12, 1809", "Mar 1809", "1809", "the 1450s", "c. 1400", "44 BCE". */
export function showDate(s, prec = PREC.DAY) {
  const p = parseDate(s);
  if (!p) return '?';
  prec = Number(prec);
  if (prec >= PREC.DAY && p.m && p.d) return `${MONTHS[p.m - 1]} ${p.d}, ${yearText(p.y)}`;
  if (prec >= PREC.MONTH && p.m) return `${MONTHS[p.m - 1]} ${yearText(p.y)}`;
  if (prec >= PREC.YEAR) return yearText(p.y);
  if (prec >= PREC.DECADE) return p.y < 0 ? `the ${-p.y - (-p.y % 10)}s BCE` : `the ${p.y - (p.y % 10)}s`;
  return `c. ${yearText(p.y)}`;
}

/** A day number as an astronomical year with a fraction (for drawing the timeline): Jan 1, 1001 is exactly 1001. */
export function yearOf(n) {
  n = Math.floor(n) + 719468;
  const era = Math.floor(n / 146097), doe = n - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const y = yoe + era * 400 + (mp >= 10 ? 1 : 0);
  const start = dayNumber(y, 1, 1), len = dayNumber(y + 1, 1, 1) - start;
  return y + (Math.floor(n - 719468) - start) / len;
}
/** An astronomical year (with a fraction) as a day number: the inverse of yearOf. */
export function dayOfYear(y) {
  const w = Math.floor(y), start = dayNumber(w, 1, 1);
  return start + (y - w) * (dayNumber(w + 1, 1, 1) - start);
}
/** A year with a fraction as a label: "1809", "44 BCE". */
export function yearLabel(y) {
  const whole = Math.floor(y);
  return whole <= 0 ? `${1 - whole} BCE` : String(whole);
}

/* ───────────── Lives ───────────── */

/**
 * A person's lifespan for scoring, giving the benefit of the doubt: the earliest day they could have
 * been born to the latest day they could have died (or today, if they're alive).
 * person: { birth, birthPrec, death, deathPrec }. → { from, to, living } or { error }.
 */
export function lifeOf(person, today = todayNumber()) {
  const b = span(person.birth, person.birthPrec);
  if (!b) return { error: 'no-birth' };
  if (!person.death) {
    // Nobody alive was born before 1900: no death date that early means Wikipedia doesn't know it.
    if (b.hi < dayNumber(1900, 1, 1)) return { error: 'no-death' };
    return { from: b.lo, to: today, living: true };
  }
  const d = span(person.death, person.deathPrec);
  if (!d) return { error: 'no-death' };
  return { from: b.lo, to: Math.max(d.hi, b.lo), living: false };
}

/** An event's span: { date, prec } → { lo, hi }. */
export const eventSpan = e => span(e.date, e.prec || PREC.DAY);

/**
 * The score for one round (0–1000) and why. life: { from, to } (day numbers); a, b: the two events' spans
 * in time order.
 *   Alive for both: 1000.
 *   Alive for one: 500, plus up to 250 for how much of the gap toward the other event they lived through.
 *   Alive for neither, but lived between them: up to 250, for how much of the gap their life fills.
 *   Lived wholly before or after both: up to 100 for coming close, nothing if far away.
 */
export function scoreLife(life, a, b) {
  if (a.lo > b.lo) [a, b] = [b, a];
  const aliveA = life.from <= a.hi && life.to >= a.lo;
  const aliveB = life.from <= b.hi && life.to >= b.lo;
  const g0 = a.hi, g1 = Math.max(b.lo, a.hi + 1), gap = g1 - g0;
  const frac = v => Math.max(0, Math.min(1, v / gap));
  if (aliveA && aliveB) return { score: ROUND_MAX, kind: 'both', aliveA, aliveB, cover: 1 };
  if (aliveA || aliveB) {
    const cover = aliveA ? frac(Math.min(life.to, g1) - g0) : frac(g1 - Math.max(life.from, g0));
    return { score: Math.min(ONE_TOP, ONE_BASE + Math.round((ONE_TOP - ONE_BASE) * cover)), kind: 'one', aliveA, aliveB, cover };
  }
  if (life.from > a.hi && life.to < b.lo) {
    const cover = frac(life.to - life.from);
    return { score: Math.round(BETWEEN_MAX * cover), kind: 'between', aliveA, aliveB, cover };
  }
  // Wholly before the first event or after the second: closeness counts, out to half the gap (at least 10 years).
  const dist = life.to < a.lo ? a.lo - life.to : life.from - b.hi;
  const reach = Math.max(gap / 2, 10 * YEAR_DAYS);
  const near = Math.max(0, 1 - dist / reach);
  return { score: Math.round(OUTSIDE_MAX * near), kind: 'outside', aliveA, aliveB, cover: 0, years: Math.round(dist / YEAR_DAYS) };
}

/* ───────────── Bands, WK Bucks, share text ───────────── */

/** perfect (alive for both), one (alive for one), near (some points), miss (none). */
export const band = s => (s >= ROUND_MAX ? 'perfect' : s >= ONE_BASE ? 'one' : s > 0 ? 'near' : 'miss');
export const scoreSquare = s => ({ perfect: '🟩', one: '🟨', near: '🟧', miss: '🟥' })[band(s)];

/** WK Bucks for one round: daily 1 per 100 points (+5 for a perfect 1,000), archive half of the points' share, none otherwise. */
export function bucksForRound(score, mode) {
  const s = Math.max(0, Number(score) || 0);
  if (mode === 'daily') return Math.floor(s / 100) + (s >= ROUND_MAX ? 5 : 0);
  if (mode === 'archive') return Math.floor(s / 200);
  return 0;
}

/** End-of-day mood from the day total (out of 3,000). */
export const moodFor = total => (total >= 3000 ? 'thrilled' : total >= 2250 ? 'happy' : total >= 1500 ? 'okay' : total >= 750 ? 'puzzled' : 'sad');

/** rounds: [{ round, score }] (score null when not played). `link` goes on the last line when given. */
export function lifelineShareText({ number, rounds, archive = false }, link) {
  const rs = [1, 2, 3].map(n => (rounds || []).find(r => r && r.round === n) || { round: n, score: null });
  const total = rs.reduce((t, r) => t + (r.score || 0), 0);
  const squares = rs.map(r => (r.score == null ? '⬜' : scoreSquare(r.score))).join('');
  const lines = [`Lifeline #${number}${archive ? ' (archive)' : ''} ${squares}`, `${total.toLocaleString('en-US')} / ${DAY_MAX.toLocaleString('en-US')}`];
  if (link) lines.push(link);
  return lines.join('\n');
}
