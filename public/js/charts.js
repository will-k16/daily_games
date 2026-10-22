// Score histograms, used the same way everywhere in the suite: every game's results, day summaries and
// stats, and every admin dashboard. A histogram is always 10 bars, each 10% of the top score wide
// (the top score shares the last bar). The data helpers run on the server too, so keep them plain.

export const BINS = 10;
export const MIN_CROWD = 5;          // players needed before any comparison with others shows

/** Which of the 10 bars a score falls in, for scores from 0 to `max`. */
export const binOf = (score, max) => Math.max(0, Math.min(BINS - 1, Math.floor((Number(score) || 0) / (max / BINS))));

/** Counts per bar. */
export function spread(scores, max) {
  const hist = new Array(BINS).fill(0);
  scores.forEach(s => { hist[binOf(s, max)]++; });
  return hist;
}

/**
 * How everyone did. rows: [{ player, score }] (you included, if you played). Hidden until MIN_CROWD
 * people have played, so nobody's single result is on show.
 * → { total, few: true } or { total, hist, beat, mine } (beat: % of the others you scored above).
 */
export function crowd(rows, me, myScore, max) {
  const total = rows.length;
  if (total < MIN_CROWD) return { total, few: true };
  const others = rows.filter(r => r.player !== me);
  const beat = myScore == null || !others.length ? null : Math.round(100 * others.filter(r => r.score < myScore).length / others.length);
  return { total, hist: spread(rows.map(r => r.score), max), beat, mine: myScore == null ? null : binOf(myScore, max) };
}

/* ───────────── HTML (browser only) ───────────── */

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Math.round(n).toLocaleString('en-US');

/** "0–99", …, "900–1,000" for bar i of a 0–max histogram. */
export function binLabel(i, max) {
  const w = max / BINS, lo = Math.ceil(i * w), hi = i === BINS - 1 ? max : Math.ceil((i + 1) * w) - 1;
  return `${num(lo)}–${num(hi)}`;
}

/**
 * The histogram itself. opts: { max, mine (bar index to highlight, or -1), counts (show the count on each bar),
 * one / many (what a count is: "player" / "players"), unit (after the axis numbers, e.g. " m") }.
 */
export function histoHTML(hist, { max, mine = -1, counts = false, one = 'player', many = 'players', unit = '' } = {}) {
  const all = hist.reduce((a, b) => a + b, 0);
  const items = hist.map((n, i) => ({ n, tip: `${binLabel(i, max)}${unit}: ${n} ${n === 1 ? one : many}${all ? ` (${Math.round(100 * n / all)}%)` : ''}` }));
  return barsHTML(items, { mine, counts, axis: ['0', num(max / 2) + unit, num(max) + unit] });
}

/** Any bar chart in the same style. items: [{ n, tip }]; axis: labels spread along the bottom. */
export function barsHTML(items, { mine = -1, counts = false, axis = [] } = {}) {
  const top = Math.max(1, ...items.map(x => x.n));
  return `<div class="chart">
    <div class="ch-bars ${counts ? 'counts' : ''}">${items.map(({ n, tip }, i) => `<div class="ch-col${i === mine ? ' me' : ''}" title="${esc(tip)}" style="--d:${i}">
        ${i === mine ? '<b class="ch-you">you</b>' : counts ? `<span class="ch-n">${n}</span>` : ''}
        <i style="height:${n ? Math.max(6, n / top * 100) : 0}%"></i></div>`).join('')}</div>
    <div class="ch-axis">${axis.map(a => `<span>${esc(a)}</span>`).join('')}</div></div>`;
}

/**
 * "How everyone did": one line comparing you with everyone, then the histogram.
 * opts: { max, daily (it's today's game, so "better than" makes sense), finished ("played" / "finished"), unit, title }
 */
export function crowdHTML(cr, { max, daily = true, finished = 'played', unit = '', title = 'How everyone did' } = {}) {
  if (!cr) return '';
  const head = `<div class="ch-title">${esc(title)}</div>`;
  if (cr.few) return `<div class="crowdchart">${head}<p class="ch-line">Comparisons show once ${MIN_CROWD} people have ${finished}.</p></div>`;
  const others = cr.total - (cr.mine == null ? 0 : 1);
  const line = !daily ? `${num(cr.total)} ${cr.total === 1 ? 'person' : 'people'} ${finished} this on the day.`
    : cr.beat == null ? 'You\'re one of the first today.'
    : `Better than <b>${cr.beat}%</b> of the ${num(others)} other ${others === 1 ? 'player' : 'players'} today.`;
  return `<div class="crowdchart">${head}<p class="ch-line">${line}</p>${histoHTML(cr.hist, { max, mine: daily && cr.mine != null ? cr.mine : -1, unit })}</div>`;
}

/**
 * The stats modal body, the same in every game. s: { played, avg, best, streak, maxStreak, dist (10 bars) }.
 * opts: { max, unit, avgLabel, bestLabel, note (HTML under the chart), extra (HTML above it) }.
 */
export function statsHTML(s, { max, unit = '', avgLabel = 'Average', bestLabel = 'Best', note = '', extra = '' } = {}) {
  return `<div class="statgrid"><div><b>${num(s.played)}</b><span>Days</span></div><div><b>${num(s.avg)}</b><span>${esc(avgLabel)}</span></div>
      <div><b>${num(s.best)}</b><span>${esc(bestLabel)}</span></div><div><b>${s.streak}</b><span>Streak</span></div><div><b>${s.maxStreak}</b><span>Max streak</span></div></div>
    ${extra}
    <div class="ch-title">Your days</div>
    ${s.played ? `<div class="ch-mine">${histoHTML(s.dist, { max, counts: true, one: 'day', many: 'days', unit })}</div>` : '<p class="ch-line">Finish a day to start your chart.</p>'}
    ${note}
    <p class="ch-line"><a href="/history">Every day, every game →</a></p>`;
}
