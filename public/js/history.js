// Your scores: every day you've played, with each game's total and one colored square per stage /
// round / question (the same colors as each game's share text and archive).
import { tierOf as summitTier } from './score.js';
import { tierOf as vennTier, DAY_MAX as VENN_MAX } from './venn-score.js';
import { band as pollyBand, DAY_MAX as POLLY_MAX } from './polly-score.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const meters = n => Math.round(n).toLocaleString('en-US') + ' m';

// Newest game first, the same order as the home page.
const GAMES = [
  { key: 'polly', name: 'Polly', href: '/polly', tier: pollyBand, part: n => `Question ${n}`, total: t => `${t}/${POLLY_MAX}`, max: POLLY_MAX },
  { key: 'venn', name: 'Venn', href: '/venn', tier: vennTier, part: n => `Round ${n}`, total: t => `${t}/${VENN_MAX}`, max: VENN_MAX,
    tip: p => `${p.count} found, par ${p.par}` },
  { key: 'summit', name: 'Summit', href: '/summit', tier: summitTier, part: n => ['Foothills', 'Ridge', 'Peak'][n - 1], total: meters, max: 3000 }
];

const longDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthOf = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function gameCell(g, day, today) {
  const r = day[g.key];
  if (!r) return `<div class="hgame none"><span class="hname">${g.name}</span><span class="hnone">–</span></div>`;
  // Today's puzzles aren't in the archive yet, so today opens the game itself.
  const href = day.date === today ? g.href : `${g.href}#/archive/${day.date}`;
  const squares = r.parts.map((p, i) => (p
    ? `<i class="hsq ${g.tier(p.score)}" title="${esc(g.part(i + 1))}: ${p.score}${g.tip ? ' · ' + esc(g.tip(p)) : ''}">${p.score}</i>`
    : `<i class="hsq" title="${esc(g.part(i + 1))}: not played">·</i>`)).join('');
  return `<a class="hgame" href="${href}" style="--g:var(--${g.key})">
    <span class="hname">${g.name} <small>#${r.number}${r.replay ? ' · replay' : ''}</small></span>
    <b class="htotal">${esc(g.total(r.total))}${r.done < r.of ? ` <small>${r.done} of ${r.of}</small>` : ''}</b>
    <span class="hsqs">${squares}</span></a>`;
}

function summary(days) {
  return GAMES.map(g => {
    // Only full days played on the day count toward the average and best, like each game's stats.
    const full = days.map(d => d[g.key]).filter(r => r && !r.replay && r.done === r.of).map(r => r.total);
    const played = days.filter(d => d[g.key]).length;
    const avg = full.length ? Math.round(full.reduce((a, b) => a + b, 0) / full.length) : null;
    const best = full.length ? Math.max(...full) : null;
    const fmt = n => (n == null ? '–' : g.key === 'summit' ? meters(n) : n);
    return `<div class="hcard" style="--g:var(--${g.key})"><span class="hname">${g.name}</span>
      <dl><div><dt>Days</dt><dd>${played}</dd></div><div><dt>Average</dt><dd>${fmt(avg)}</dd></div><div><dt>Best</dt><dd>${fmt(best)}</dd></div></dl></div>`;
  }).join('');
}

async function load() {
  let d;
  try {
    const res = await fetch('/api/suite/history', { credentials: 'same-origin' });
    d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || 'Something went wrong.');
  } catch (e) {
    $('#hdays').innerHTML = `<p class="note bad">${esc(e.message || 'Lost the connection there. Try again?')}</p>`;
    return;
  }
  if (!d.days.length) {
    $('#hsum').hidden = true;
    $('#hdays').innerHTML = '<p class="note">Nothing yet. Play a game and your day shows up here. <a href="/">Pick a game →</a></p>';
    return;
  }
  $('#hsum').innerHTML = summary(d.days);
  let month = '';
  $('#hdays').innerHTML = d.days.map(day => {
    const m = monthOf(day.date), head = m !== month ? `<h2 class="hmonth">${esc(m)}</h2>` : '';
    month = m;
    return `${head}<article class="hday"><h3>${esc(longDate(day.date))}${day.date === d.today ? ' <span class="htoday">today</span>' : ''}</h3>
      <div class="hrow">${GAMES.map(g => gameCell(g, day, d.today)).join('')}</div></article>`;
  }).join('');
}

load();
