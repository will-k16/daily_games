// Summit: the daily game. A pixel-art cable car rides to whatever you name.
import { createScene, createClimb } from './summit-scene.js';
import { skipperPortrait } from './pixel.js';
import { fmt, nice } from './units.js';
import { PROPS, propLabel } from './props.js';
import { scoreGuess, logPos, SECOND_GUESS_MULT, MAX_REJECTS, MAX_SCORE, MIN_CROWD, summitShareText } from './score.js';
import * as pad from './pad.js';
import { WARDROBE, SLOTS, DEFAULT_LOOK, itemKey, bucksFor, DAY_BONUS } from './wardrobe.js';
import { bucksIcon, bucksAmount } from './bucks.js';
import { showAccount as accountModal, signInReturn } from './account.js';

/* ═══════════ Basics ═══════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const STAGES = {
  1: { name: 'Foothills', emoji: '🌲', tier: 'Easy' },
  2: { name: 'Ridge', emoji: '🪨', tier: 'Medium' },
  3: { name: 'Peak', emoji: '🏔️', tier: 'Hard' }
};
const stageOf = slot => STAGES[slot] || STAGES[1];
const SUMMIT_M = 3000;   // three stages × 1000; every point is a meter climbed

const S = {
  units: store.get('jr.units', 'imperial'),
  me: { signedIn: false, isAdmin: false, email: '', skipper: { ...DEFAULT_LOOK } }, bucks: null,
  today: null, ctx: null, roomIdx: 0, showSummary: false,
  scene: null, scenePid: null, shownTotal: 0, unl: null
};

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch('/api/' + path, { credentials: 'same-origin', ...opt });
  const data = await res.json().catch(() => ({ error: 'Lost the connection there. Try again?' }));
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3000);
}
const val = (p, v) => fmt(p.property, v, p.unitLabel, S.units);
const look = () => S.me.skipper || DEFAULT_LOOK;
const sk = () => esc(look().name || 'Skipper');                 // the goat's name, ready for HTML
const meters = n => Math.round(n).toLocaleString('en-US') + ' m';

function countUp(el, to, { dur = 1100, fmt: f = n => Math.round(n) } = {}) {
  if (!el) return;
  if (reduced()) { el.textContent = f(to); return; }
  const from = Number(el.dataset.v || 0), start = performance.now();
  const go = now => {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = f(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(go); else el.dataset.v = String(to);
  };
  requestAnimationFrame(go);
}

// Button ripples.
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn'); if (!b || reduced()) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
  const i = document.createElement('span'); i.className = 'ripple';
  i.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  b.appendChild(i); setTimeout(() => i.remove(), 650);
});

/* ═══════════ Verdicts ═══════════ */
function verdict(s) {
  if (s >= 1000) return { t: 'Summit!', mood: 'happy', d: `${sk()} pulled right up to the lodge.` };
  if (s >= 900) return { t: 'So close!', mood: 'wow', d: 'Just a few meters from the lodge.' };
  if (s >= 750) return { t: 'Smooth ride', mood: 'smile', d: 'A comfy spot on the cable.' };
  if (s >= 500) return { t: 'A bit wobbly', mood: 'neutral', d: 'Not bad, not the lodge.' };
  if (s >= 250) return { t: 'Rough ride', mood: 'sad', d: `${sk()} is hanging on for dear life.` };
  if (s > 0) return { t: 'Off the rails', mood: 'dizzy', d: 'Way out on the cable.' };
  return { t: 'Lost in the clouds', mood: 'dizzy', d: 'Nowhere near the lodge.' };
}
const tier = s => s >= 900 ? 'green' : s >= 600 ? 'yellow' : s >= 300 ? 'orange' : 'red';

/* ═══════════ Time of day ═══════════ */
function tod() { const h = new Date().getHours(); return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night'; }
setInterval(() => { const t = tod(); if (document.documentElement.dataset.tod !== t) { document.documentElement.dataset.tod = t; S.scenePid = null; render(); } }, 60000);

/* ═══════════ Routing ═══════════ */
window.addEventListener('hashchange', route);
async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  closeModal();
  try {
    if (h === 'archive') return renderArchiveList();
    if (h.startsWith('archive/')) return loadArchiveDay(h.slice(8));
    if (h === 'unlimited') {
      if (!S.today) { const d = await api('today'); S.today = d; S.me = d.me; paintTools(); }
      if (S.me.isAdmin) return loadUnlimited(false);
    }
    return loadToday();
  } catch (e) { showError(e); }
}
function showError(e) {
  dropScene();
  $('#main').innerHTML = `<div class="card"><div class="note bad">${esc(e.message || e)}</div><div class="row"><button class="btn alt sm" id="retry">Try again</button></div></div>`;
  $('#retry').onclick = route;
}
const loadingHTML = msg => `<div class="loading"><div class="spinner-cab"></div>${esc(msg)}</div>`;
const firstOpen = rooms => { const i = rooms.findIndex(r => r.play.state !== 'done'); return i < 0 ? rooms.length - 1 : i; };

async function loadToday() {
  if (!S.ctx || S.ctx.kind !== 'daily') { dropScene(); $('#main').innerHTML = loadingHTML('Warming up the cable car…'); }
  const d = await api('today');
  S.today = d; S.me = d.me; S.bucks = d.bucks; paintTools();
  setCtx({ kind: 'daily', date: d.date, number: d.number, rooms: d.rooms.map(r => ({ ...r, mode: 'daily' })), day: d.day });
  if (d.notifications && d.notifications.length) showNotifications(d.notifications);
  else if (!store.get('jr.summitHelp', false)) { store.set('jr.summitHelp', true); showHelp(); }
  signInReturn(accountUI());
}
async function loadArchiveDay(date) {
  dropScene(); $('#main').innerHTML = loadingHTML('Dusting off an old trail map…');
  const d = await api('archive/day?date=' + encodeURIComponent(date));
  setCtx({ kind: 'archive', date: d.date, number: d.number, rooms: d.rooms, day: d.day });
}
async function loadUnlimited(fresh) {
  dropScene(); $('#main').innerHTML = loadingHTML('Building a fresh mountain…');
  if (fresh || !S.unl) S.unl = await api('unlimited/new', {});
  setCtx({ kind: 'unlimited', rooms: [S.unl], day: null });
}
function setCtx(ctx) {
  S.ctx = ctx;
  S.roomIdx = firstOpen(ctx.rooms);
  S.showSummary = ctx.kind !== 'unlimited' && ctx.rooms.every(r => r.play.state === 'done');
  S.shownTotal = 0;
  $('#main').innerHTML = `
    <div class="dayhead" id="dayhead"></div>
    <section id="stageWrap">
      <div class="stage"><div class="stage-label" id="stageLabel"></div><div class="scene-host" id="sceneHost"></div><div class="stage-hint">Tap the cable car to say hi to ${sk()}</div></div>
      <div class="signs" id="signs"></div>
    </section>
    <section class="card" id="card"></section>`;
  render('enter');
}

/* ═══════════ Render ═══════════ */
function render(how = 'enter') {
  const c = S.ctx; if (!c || !$('#card')) return;
  renderHead(c);
  const r = c.rooms[S.roomIdx];
  if (S.showSummary) {
    $('#stageWrap').hidden = true; dropScene();
    $('#card').innerHTML = summaryHTML(c); wireSummary(c);
    return;
  }
  $('#stageWrap').hidden = false;
  ensureScene(r, how);
  $('#signs').innerHTML = signsHTML(r);
  const st = stageOf(r.puzzle.slot);
  $('#stageLabel').innerHTML = c.kind === 'unlimited' ? `∞ Practice <i>· ${st.tier}</i>` : `${st.emoji} ${st.name} <i>· ${st.tier} · stage ${r.puzzle.slot} of 3</i>`;
  $('#card').innerHTML = cardHTML(r, c);
  wireCard(r, c);
  pad.setPuzzle(r.puzzle, S.units);
}

function renderHead(c) {
  const el = $('#dayhead');
  if (c.kind === 'unlimited') {
    el.innerHTML = `<div><div class="daylabel"><span class="badge">Admin</span> <b>Unlimited</b> · testing only</div></div>
      <button class="btn sm alt" id="newUnl">New mountain →</button>`;
    $('#newUnl').onclick = () => loadUnlimited(true);
    return;
  }
  const total = c.rooms.reduce((s, r) => s + (r.play.state === 'done' ? r.play.score || 0 : 0), 0);
  const allDone = c.rooms.every(r => r.play.state === 'done');
  const dateStr = new Date(c.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const tabs = c.rooms.map((r, i) => {
    const st = stageOf(r.puzzle.slot), done = r.play.state === 'done';
    const locked = i > 0 && c.rooms[i - 1].play.state !== 'done' && !done && r.play.state === 'g1' && !r.play.guesses.length;
    return `<button class="tab ${i === S.roomIdx && !S.showSummary ? 'on' : ''}" data-room="${i}" ${locked ? 'disabled' : ''}>
      <span class="em">${st.emoji}</span>${st.name}<span class="sc">${done ? r.play.score : locked ? '🔒' : '·'}</span></button>`;
  }).join('') + (allDone ? `<button class="tab ${S.showSummary ? 'on' : ''}" data-summary="1"><span class="em">🚩</span>Summit</button>` : '');
  const hadClimb = !!(S.climb && el.querySelector('.climb-canvas'));
  if (!hadClimb) {
    el.innerHTML = `<div><div class="daylabel">${c.kind === 'archive' ? '<span class="badge">Archive</span> ' : ''}Day <b>#${c.number}</b> · ${esc(dateStr)}</div><div class="tabs" id="tabs"></div></div>
      <div class="climbbox" title="Every point is a meter. Three perfect stages reach the 3,000 m summit."><div id="climbHost"></div><div class="alt"><b id="altNum">0 m</b><span>of 3,000 m</span></div></div>`;
    S.climb = createClimb($('#climbHost'), { w: 72, h: 34 });
  }
  $('#tabs').innerHTML = tabs;
  document.querySelectorAll('[data-room]').forEach(b => b.onclick = () => { S.roomIdx = Number(b.dataset.room); S.showSummary = false; render('enter'); });
  const sb = document.querySelector('[data-summary]'); if (sb) sb.onclick = () => { S.showSummary = true; render(); };
  if (total !== S.shownTotal || !hadClimb) {
    S.climb.set(total / SUMMIT_M, { dur: 1500 });
    countUp($('#altNum'), total, { dur: 1500, fmt: meters });
    S.shownTotal = total;
  }
}

/* ═══════════ Scene ═══════════ */
function dropScene() { if (S.scene) { S.scene.destroy(); S.scene = null; S.scenePid = null; } }

function finalT(r) {
  const p = r.reveal && r.reveal.puzzle, g = r.play.guesses[r.play.guesses.length - 1];
  if (!p || !g || r.play.gaveUp) return null;
  return logPos(p.smallValue, p.bigValue, g.value);
}

function ensureScene(r, how) {
  const fresh = S.scenePid !== r.puzzle.id || !S.scene;
  if (fresh) {
    dropScene();
    S.scene = createScene($('#sceneHost'), { stage: r.puzzle.slot, seed: r.puzzle.id, look: look(), onGondolaClick: () => showSkipper(r) });
    S.scenePid = r.puzzle.id;
  }
  if (fresh || how === 'enter') syncScene(r, 'enter');
}

/** Moves Skipper to match the room's state. `event` says what just happened. */
function syncScene(r, event) {
  const sc = S.scene; if (!sc) return;
  const play = r.play;
  const pinsFor = () => {
    if (!r.reveal) return [];
    const p = r.reveal.puzzle;
    const ghosts = play.gaveUp ? play.guesses : play.guesses.slice(0, -1);
    return ghosts.map(g => ({ t: logPos(p.smallValue, p.bigValue, g.value), label: g.attempt }));
  };
  if (play.state === 'done') {
    sc.pins([]);
    const t = finalT(r), v = verdict(play.score);
    if (event === 'enter') { sc.setFog(false); sc.jumpTo(0.075); }
    else sc.setFog(false);
    const go = () => {
      if (t == null) { sc.toStation(); sc.setMood('sad'); sc.pins(pinsFor()); return; }
      sc.travelTo(t, {
        dur: event === 'enter' ? 1800 : 2600,
        done: () => { sc.settle(play.score); sc.setMood(v.mood); sc.pins(pinsFor()); if (event !== 'enter' && play.score >= 900) sc.celebrate(play.score); }
      });
    };
    setTimeout(go, event === 'enter' ? 450 : 900);
  } else if (play.state === 'decide' || play.state === 'g2') {
    const g = play.guesses[0];
    sc.setFog(true);
    sc.setMood(g ? verdict(g.raw).mood : 'neutral');
    if (event === 'enter') { sc.jumpTo(0.5); }
    else if (event === 'first') { sc.travelTo(0.5, { dur: 2400, done: () => sc.settle(g ? g.raw : 500) }); }
  } else {
    sc.setFog(false); sc.pins([]);
    if (event === 'enter') { sc.jumpTo(0.075); sc.setMood('smile'); }
  }
}

/* ═══════════ Signs + card ═══════════ */
function signsHTML(r) {
  const rv = r.reveal && r.reveal.puzzle;
  return `<div class="sign small"><small>⬅ <span class="long">Bottom station · </span>too small</small><b>${esc(r.puzzle.small)}</b>${rv ? `<div class="val">≈ ${esc(val(rv, rv.smallValue))}</div>` : ''}</div>
    <div class="sign big"><small><span class="long">Top station · </span>too big ➡</small><b>${esc(r.puzzle.big)}</b>${rv ? `<div class="val">≈ ${esc(val(rv, rv.bigValue))}</div>` : ''}</div>`;
}

function cardHTML(r, c) {
  const p = r.puzzle, play = r.play;
  const head = `<h2 class="prompt rise">Name something whose <span class="prop">${esc(propLabel(p.property))}</span> is juuust right.</h2>`;
  if (play.state === 'g1' || play.state === 'g2') return head + guessFormHTML(r);
  if (play.state === 'decide') return head + decideHTML(r);
  return revealHTML(r, c);
}

function pipsHTML(used) {
  let s = '';
  for (let i = 0; i < MAX_REJECTS; i++) s += `<span class="pip ${i < used ? 'used' : ''}"></span>`;
  const left = MAX_REJECTS - used;
  return `<div class="pips rise" style="--d:3">${s}<span>${left > 0 ? `${left} free ${left === 1 ? 'miss' : 'misses'} left` : 'Careful: one more miss and this stage is a 0'}</span></div>`;
}

function blocks(score) {
  const on = Math.round(score / 100);
  return `<div class="meter"><b data-count="${score}">0</b><div class="cells">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on ' + tier(score) : ''}" style="--d:${i}"></i>`).join('')}</div></div>`;
}

const REPORT = { open: 'we\'re taking a look', accepted: 'fixed', rejected: 'checked, no change' };
function guessCard(r, g, compact) {
  const complained = r.complaints && r.complaints[g.id];
  return `<div class="gcard ${compact ? 'compact' : ''} rise" style="--d:1">
    ${blocks(g.score)}
    <div><div class="said">You said “${esc(g.input)}”${g.outOfRange ? ' · off the cable' : ''}</div>
      <div class="judged">Counted as ${esc(g.name)} · <span class="val">≈ ${esc(val(r.puzzle, g.value))}</span></div>
      ${complained ? `<span class="empty">Reported: ${esc(REPORT[complained] || complained)}</span>` : `<button class="link report" data-guess="${g.id}">Wrong number?</button>`}</div></div>`;
}

function guessFormHTML(r) {
  const play = r.play, second = play.state === 'g2';
  return `${second && play.guesses[0] ? guessCard(r, play.guesses[0], true) : ''}
    <form class="guess rise" style="--d:2" id="guessForm" autocomplete="off">
      <input name="a" maxlength="80" placeholder="${second ? 'Your final answer…' : 'Name something real…'}" aria-label="Your answer" enterkeyhint="go">
      <button class="btn" type="submit">${second ? 'Final ride' : 'Send it up'} <span aria-hidden="true">🚡</span></button>
    </form>
    ${pipsHTML(play.rejects || 0)}
    <div class="msg" id="msg"></div>
    <p class="sub rise" style="--d:4">${second
      ? `Last ride, worth <b>×${SECOND_GUESS_MULT}</b>. It has to be something new.`
      : 'Think in ratios, not averages: halfway from 1 to 100 is <b>10</b>, not 50.'}
      <br><button type="button" class="link" id="giveUpBtn">🏳️ I give up (scores 0)</button></p>`;
}

function decideHTML(r) {
  const g = r.play.guesses[0];
  return `${guessCard(r, g, false)}
    <div class="deduce rise" style="--d:2"><span class="fogicon"></span><span>${g.outOfRange
      ? 'That one ran off the cable, so it counts as 0.'
      : `${sk()} is somewhere in the fog. The lodge could be <b>above or below</b> ${esc(val(r.puzzle, g.value))}. Your call.`}</span></div>
    <div class="choices rise" style="--d:3">
      <button class="btn green" id="keepBtn">Keep ${g.score}<small>Lock it in</small></button>
      <button class="btn alt" id="retryBtn">One more ride<small>Last try, worth up to ${Math.round(MAX_SCORE * SECOND_GUESS_MULT)}</small></button>
    </div>`;
}

function offText(p, v) {
  const mid = p.middle, words = (PROPS[p.property] && PROPS[p.property].more) || ['bigger', 'smaller'];
  const f = v / mid;
  if (Math.abs(Math.log(f)) < 0.01) return 'dead center';
  if (f > 1) return f < 2 ? `${Math.round((f - 1) * 100)}% ${words[0]} than just right` : `${f < 10 ? f.toFixed(1) : nice(f)}× ${words[0]} than just right`;
  const g = 1 / f; return g < 2 ? `${Math.round((1 - f) * 100)}% ${words[1]} than just right` : `${g < 10 ? g.toFixed(1) : nice(g)}× ${words[1]} than just right`;
}

function gaugeHTML(r) {
  const p = r.reveal.puzzle, play = r.play, N = 31;
  const cells = Array.from({ length: N }, (_, i) => {
    const v = Math.exp(Math.log(p.smallValue) + (i + .5) / N * (Math.log(p.bigValue) - Math.log(p.smallValue)));
    const sc = scoreGuess(p.smallValue, p.bigValue, v) / 10;
    return `<i class="g${sc >= 90 ? 4 : sc >= 70 ? 3 : sc >= 45 ? 2 : sc >= 20 ? 1 : 0}" style="--d:${i}"></i>`;
  }).join('');
  const pos = g => (clamp(logPos(p.smallValue, p.bigValue, g.value), 0, 1) * 100).toFixed(2) + '%';
  const marks = play.guesses.map((g, i) => {
    const isFinal = !play.gaveUp && i === play.guesses.length - 1;
    return `<span class="mk ${isFinal ? '' : 'ghost'}" data-left="${pos(g)}" title="Guess ${g.attempt}">${isFinal ? '' : g.attempt}</span>`;
  }).join('');
  return `<div class="gauge rise" style="--d:2"><div class="bar"><div class="cells">${cells}</div><span class="mid"></span>${marks}</div>
    <div class="legend"><div>Too small<b>${esc(val(p, p.smallValue))}</b></div><div class="c">Just right · lodge<b>≈ ${esc(val(p, p.middle))}</b></div><div class="r">Too big<b>${esc(val(p, p.bigValue))}</b></div></div></div>`;
}

function revealHTML(r, c) {
  const play = r.play, rv = r.reveal, p = rv.puzzle;
  const v = play.gaveUp ? { t: 'Gave up', d: `${sk()} rode back down. No shame in it.` } : verdict(play.score);
  const facts = play.guesses.map((g, i) => {
    const isFinal = !play.gaveUp && g.attempt === play.guesses.length;
    const complained = r.complaints && r.complaints[g.id];
    return `<div class="fact ${isFinal ? 'final' : ''}" style="--d:${i}">
      <span class="n">#${g.attempt}</span>
      <div class="w"><b>${esc(g.name)}</b> ≈ ${esc(val(p, g.value))}
        <small>You said “${esc(g.input)}” · ${g.outOfRange ? 'off the cable' : esc(offText(p, g.value))}${g.attempt === 2 ? ` · ${g.raw} × ${SECOND_GUESS_MULT}` : ''}${!isFinal ? ' · not counted' : ''}</small>
        ${complained ? `<small>Reported: ${esc(REPORT[complained] || complained)}</small>` : `<button class="link report" data-guess="${g.id}">Wrong number?</button>`}</div>
      <span class="s">${g.score}</span></div>`;
  }).join('') + (play.gaveUp ? `<div class="fact final" style="--d:${play.guesses.length}"><span class="n">🏳️</span><div class="w"><b>You gave up</b><small>0 points for this stage.</small></div><span class="s">0</span></div>` : '');

  let crowd = '';
  if (rv.crowd) {
    const max = rv.crowd.few ? 1 : Math.max(1, ...rv.crowd.hist), myB = Math.min(10, Math.floor(play.score / 100));
    const beat = rv.crowd.few ? `Comparisons show once ${MIN_CROWD} people have played.`
      : c.kind === 'daily'
      ? (rv.crowd.beat == null ? 'You\'re one of the first up today.' : `Better than <b>${rv.crowd.beat}%</b> of today's ${rv.crowd.total - 1} other ${rv.crowd.total === 2 ? 'player' : 'players'}.`)
      : `${rv.crowd.total} ${rv.crowd.total === 1 ? 'person' : 'people'} played this one on the day.`;
    crowd = `<div class="crowd">
      <div><div class="h4">📊 How everyone did</div><p class="beat">${beat}</p>
        ${rv.crowd.few ? '' : `<div class="histo">${rv.crowd.hist.map((n, i) => `<i class="${i === myB && c.kind === 'daily' ? 'me' : ''}" style="height:${Math.max(4, n / max * 100)}%;--d:${i}" title="${i * 100}${i < 10 ? '–' + (i * 100 + 99) : ''}: ${n}"></i>`).join('')}</div>
        <div class="histo-l"><span>0</span><span>500</span><span>1000</span></div>`}</div>
      <div><div class="h4">🏆 Top answers today</div>
        ${rv.top.length ? `<ol class="toplist">${rv.top.map((t, i) => `<li style="--d:${i}"><span class="rk">${i === 0 ? '👑' : i + 1}</span><span class="nm">${esc(t.name)}<small>≈ ${esc(val(p, t.value))} · ${t.count} ${t.count === 1 ? 'player' : 'players'}</small></span><span class="sc">${t.score}</span></li>`).join('')}</ol>`
          : '<p class="empty">Nothing popular yet. Answers show up here once a couple of people land on the same one.</p>'}</div></div>`;
  }

  const nextIdx = c.rooms.findIndex(x => x !== r && x.play.state !== 'done');
  const next = c.kind === 'unlimited' ? '<button class="btn" id="nextUnl">Next mountain →</button>'
    : nextIdx >= 0 ? `<button class="btn" id="nextRoom" data-next="${nextIdx}">Next: ${stageOf(c.rooms[nextIdx].puzzle.slot).emoji} ${stageOf(c.rooms[nextIdx].puzzle.slot).name} →</button>`
      : '<button class="btn" id="toSummary">See your climb 🚩</button>';

  return `<div class="verdict rise"><div class="score pop"><span id="bigScore" data-count="${play.score}">0</span><small>/ 1,000</small></div>
      <div><h3>${v.t}</h3><p>${v.d}${play.usedSecond ? ' Second ride (×0.8).' : ''}</p></div></div>
    ${gaugeHTML(r)}
    <div class="facts">${facts}</div>
    <div class="h4">🐐 The best answer</div>
    <div id="bestBox"><div class="shimmer">${sk()} is digging out the best answer…</div></div>
    ${crowd}
    <div class="row">${next}</div>`;
}

function wireCard(r, c) {
  const form = $('#guessForm');
  if (form) {
    form.onsubmit = e => { e.preventDefault(); const a = form.a.value.trim(); if (a) submitGuess(r, a, false); };
    if (window.innerWidth > 760) form.a.focus({ preventScroll: true });
  }
  const keep = $('#keepBtn'); if (keep) keep.onclick = () => decide(r, 'keep');
  const retry = $('#retryBtn'); if (retry) retry.onclick = () => decide(r, 'retry');
  const gu = $('#giveUpBtn'); if (gu) gu.onclick = () => confirmGiveUp(r);
  document.querySelectorAll('.report').forEach(b => b.onclick = () => showReport(r, Number(b.dataset.guess)));
  const nr = $('#nextRoom'); if (nr) nr.onclick = () => { S.roomIdx = Number(nr.dataset.next); render('enter'); scrollTop(); };
  const ts = $('#toSummary'); if (ts) ts.onclick = () => { S.showSummary = true; render(); scrollTop(); };
  const nu = $('#nextUnl'); if (nu) nu.onclick = () => loadUnlimited(true);
  // Animate numbers, rings and markers in.
  requestAnimationFrame(() => setTimeout(() => {
    document.querySelectorAll('.meter b[data-count]').forEach(b => countUp(b, Number(b.dataset.count), { dur: 1000 }));
    const bs = $('#bigScore'); if (bs) countUp(bs, Number(bs.dataset.count), { dur: 1300 });
    document.querySelectorAll('.gauge .mk').forEach((m, i) => setTimeout(() => { m.style.left = m.dataset.left; }, 300 + i * 250));
  }, 60));
  if (r.play.state === 'done') loadBest($('#bestBox'), r);
}
const scrollTop = () => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });

/* ═══════════ Actions ═══════════ */
async function submitGuess(r, answer, avg) {
  const form = $('#guessForm'), msg = $('#msg');
  const btn = form.querySelector('button'), input = form.a;
  btn.disabled = true; btn.classList.add('busy'); input.disabled = true; msg.innerHTML = '';
  let rerendered = false;
  // New answers are judged by the AI; unfamiliar ones get looked up online, which can take a few seconds.
  const slow = setTimeout(() => { if (msg.isConnected && !msg.innerHTML) msg.innerHTML = `<div class="note">🔎 ${sk()} is looking that up…</div>`; }, 900);
  try {
    const res = await api('guess', { puzzleId: r.puzzle.id, mode: r.mode || 'daily', answer, avg: !!avg });
    clearTimeout(slow); if (msg.isConnected) msg.innerHTML = '';
    if (res.play) Object.assign(r, { play: res.play, reveal: res.reveal, complaints: res.complaints || {} });
    if (res.status === 'accepted' || res.status === 'stale') { rerendered = true; afterChange(r, res.play.state === 'done' ? 'final' : 'first'); return; }
    if (res.status === 'out_of_range') {
      rerendered = true;
      S.scene && S.scene.bump(); S.scene && S.scene.setMood('wow');
      setTimeout(() => S.scene && S.scene.setMood('smile'), 1400);
      $('#card').innerHTML = cardHTML(r, S.ctx); wireCard(r, S.ctx);
      $('#msg').innerHTML = `<div class="note bad">Off the cable! That's outside the range, so it doesn't count. ${res.triesLeft > 0 ? `${res.triesLeft} free ${res.triesLeft === 1 ? 'miss' : 'misses'} left.` : 'One more miss and this stage is a 0.'}</div>`;
      return;
    }
    if (res.status === 'vague') {
      msg.innerHTML = `<div class="note warn">Which kind? They can be really different.
        <div class="chips">${(res.suggestions || []).map(s => `<button type="button" class="chip">${esc(s)}</button>`).join('')}</div>
        <button type="button" class="link avg">Just use the average for “${esc(answer)}”</button></div>`;
      msg.querySelectorAll('.chip').forEach(ch => ch.onclick = () => { input.value = ch.textContent; submitGuess(r, ch.textContent, false); });
      msg.querySelector('.avg').onclick = () => submitGuess(r, answer, true);
      return;
    }
    msg.innerHTML = `<div class="note bad">${esc(res.reason || 'Hmm, that didn\'t work. Try naming something more specific.')}</div>`;
  } catch (e) {
    clearTimeout(slow);
    msg.innerHTML = `<div class="note bad">${esc(e.message)}</div>`;
  } finally {
    clearTimeout(slow);
    if (!rerendered) { btn.disabled = false; btn.classList.remove('busy'); input.disabled = false; input.focus(); input.select(); }
  }
}

async function decide(r, choice) {
  document.querySelectorAll('.choices .btn').forEach(b => { b.disabled = true; });
  try {
    const res = await api('decide', { puzzleId: r.puzzle.id, mode: r.mode || 'daily', choice });
    Object.assign(r, { play: res.play, reveal: res.reveal, complaints: res.complaints || {} });
    afterChange(r, r.play.state === 'done' ? 'final' : 'retry');
  } catch (e) { toast(e.message); document.querySelectorAll('.choices .btn').forEach(b => { b.disabled = false; }); }
}

function confirmGiveUp(r) {
  openModal(`<h2>Give up on this stage?</h2>
    <p>You'll get <b>0</b> for the ${esc(stageOf(r.puzzle.slot).name)}, and ${sk()} will show you the answer.</p>
    <div class="row"><button class="btn alt" id="guNo">Keep trying</button><button class="btn" id="guYes">Give up</button></div>`);
  $('#guNo').onclick = closeModal;
  $('#guYes').onclick = async () => {
    $('#guYes').disabled = true;
    try {
      const res = await api('giveup', { puzzleId: r.puzzle.id, mode: r.mode || 'daily' });
      Object.assign(r, { play: res.play, reveal: res.reveal, complaints: res.complaints || {} });
      closeModal(); afterChange(r, 'final');
    } catch (e) { toast(e.message); $('#guYes').disabled = false; }
  };
}

/** Re-renders the card/header and plays the matching scene animation. */
function afterChange(r, event) {
  renderHead(S.ctx);
  $('#signs').innerHTML = signsHTML(r);
  $('#card').innerHTML = cardHTML(r, S.ctx);
  wireCard(r, S.ctx);
  syncScene(r, event === 'retry' ? 'none' : event);
  if (r.play.state === 'done' && S.ctx.kind === 'daily') refreshDay();
}

async function refreshDay() {
  try {
    const d = await api('today'); S.today = d; S.bucks = d.bucks; paintTools();
    if (S.ctx.kind === 'daily' && S.ctx.date === d.date) S.ctx.day = d.day;
  } catch { /* fine */ }
}

const bestCache = new Map();
/** The best answer is worked out in the background, so it's usually instant; if not, check back every few seconds. */
async function loadBest(box, r, tries = 0) {
  if (!box) return;
  const key = r.puzzle.id + '|' + (r.mode || 'daily');
  const draw = b => {
    if (!box.isConnected) return;
    const p = r.reveal.puzzle;
    const sig = [b.name, b.score, !!b.pending].join('|');
    if (box.dataset.sig === sig) return;                 // unchanged: don't replay the animation
    box.dataset.sig = sig;
    box.innerHTML = `<div class="fact best"><span class="n">${b.score >= MAX_SCORE ? '👑' : '🐐'}</span>
      <div class="w"><b>${esc(b.name)}</b> ≈ ${esc(val(p, b.value))}<small>Type “${esc(b.input)}” · ${esc(offText(p, b.value))} · ${b.by === 'player' ? 'found by another player' : `${sk()}'s pick`}</small></div>
      <span class="s">${b.score}</span></div>
      ${!r.play.gaveUp && r.play.guesses.length && r.play.guesses[r.play.guesses.length - 1].raw >= b.score ? '<p class="beatskipper">🎉 Nobody has found a better answer than yours!</p>' : ''}
      ${b.pending ? `<p class="empty">${sk()} is still checking a few more ideas…</p>` : ''}`;
  };
  if (bestCache.has(key)) return draw(bestCache.get(key));
  try {
    const b = await api(`best?id=${r.puzzle.id}&mode=${encodeURIComponent(r.mode || 'daily')}`);
    if (!b.pending) { bestCache.set(key, b); draw(b); return; }
    if (b.name) draw(b);
    if (tries >= 15) {
      if (!b.name && box.isConnected) box.innerHTML = `<p class="empty">${sk()} is still out looking. Check back in a bit.</p>`;
      return;
    }
    setTimeout(() => { if (box.isConnected) loadBest(box, r, tries + 1); }, 2500);
  } catch (e) {
    if (!box.isConnected) return;
    box.innerHTML = `<p class="empty">${esc(e.message)} <button class="link" type="button">Try again</button></p>`;
    box.querySelector('button').onclick = () => { box.innerHTML = `<div class="shimmer">${sk()} is digging out the best answer…</div>`; loadBest(box, r); };
  }
}

function bucksLineHTML(c) {
  if (c.kind === 'unlimited') return '';
  const mode = c.kind === 'daily' ? 'daily' : 'archive';
  let n = c.rooms.reduce((s, r) => s + (r.play.state === 'done' ? bucksFor(r.play.score, r.mode === 'daily' ? 'daily' : mode) : 0), 0);
  if (c.kind === 'daily' && c.rooms.every(r => r.play.state === 'done')) n += DAY_BONUS;
  return `<div class="bucksline rise" style="--d:5">${bucksIcon()} <b>+${n}</b> WK ${n === 1 ? 'Buck' : 'Bucks'} ${c.kind === 'daily' ? 'today' : 'from this day'}${S.bucks ? ` · ${S.bucks.balance} to spend` : ''}
    <button class="btn sm alt" id="wardrobeBtn2" type="button">Dress up ${sk()}</button></div>`;
}

/* ═══════════ Summary ═══════════ */
function panoHTML() {
  return `<div class="pano"><div id="panoHost"></div>
    <span class="camp" style="left:3%;top:90%">Base · 0 m</span><span class="camp" style="left:30%;top:58%">Treeline · 1,000 m</span>
    <span class="camp" style="left:52%;top:30%">Glacier · 2,000 m</span><span class="camp" style="left:60%;top:9%">Summit · 3,000 m</span></div>`;
}
function summaryHTML(c) {
  const total = c.rooms.reduce((s, r) => s + (r.play.score || 0), 0);
  const day = c.day || {};
  const v = verdict(Math.round(total / 3));
  const beat = c.kind === 'daily' && day.beat != null ? `<p class="beat">You out-climbed <b>${day.beat}%</b> of today's ${day.players - 1} other ${day.players === 2 ? 'player' : 'players'}.</p>`
    : c.kind === 'daily' && day.players < MIN_CROWD ? `<p class="beat">Comparisons show once ${MIN_CROWD} people have finished.</p>`
    : c.kind === 'daily' ? '<p class="beat">You\'re one of the first to finish today!</p>' : '';
  return `<div class="summary">
      <div class="daylabel rise">${c.kind === 'archive' ? 'Archive · ' : ''}Day #${c.number}</div>
      ${panoHTML()}
      <div class="total rise" style="--d:2"><span id="sumTotal">0 m</span><small> / 3,000 m</small></div>
      <div class="altline rise" style="--d:3">⛰️ climbed today</div>
      <h3 class="prompt rise" style="--d:4;margin-top:8px">${total >= SUMMIT_M ? 'You reached the summit!' : v.t}</h3>
      ${beat}
      <div class="mini">${c.rooms.map((r, i) => `<span style="--d:${i}">${stageOf(r.puzzle.slot).emoji} ${r.play.gaveUp ? '🏳️' : ''}${r.play.score}</span>`).join('')}</div>
      <div class="row" style="justify-content:center">
        <button class="btn" id="shareBtn">Share</button><button class="btn alt" id="statsBtn2">Stats</button>
        ${c.kind === 'archive' ? '<a class="btn alt" href="#/archive">More days</a>' : ''}
      </div>
      ${c.kind === 'daily' ? '<div class="countdown">New mountain in <b class="cd">--:--:--</b></div>' : ''}
      ${bucksLineHTML(c)}
      ${S.today && S.today.tipUrl ? `<a class="tip" href="${esc(S.today.tipUrl)}" target="_blank" rel="noopener">☕ Enjoying it? Buy ${sk()} a snack</a>` : ''}
    </div>`;
}
function wireSummary(c) {
  const total = c.rooms.reduce((s, r) => s + (r.play.score || 0), 0);
  setTimeout(() => {
    createClimb($('#panoHost'), { w: 160, h: 72, big: true }).set(total / SUMMIT_M, { dur: 2200 });
    countUp($('#sumTotal'), total, { dur: 2200, fmt: meters });
  }, 250);
  $('#shareBtn').onclick = () => doShare(c);
  $('#statsBtn2').onclick = showStats;
  const wb = $('#wardrobeBtn2'); if (wb) wb.onclick = showWardrobe;
  tick();
}

/* ═══════════ Share ═══════════ */
function shareText(c) {
  return summitShareText({ number: c.number, rooms: c.rooms, archive: c.kind === 'archive' }, location.host + '/summit');
}
async function doShare(c) {
  const text = shareText(c);
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch { /* copy instead */ } }
  try { await navigator.clipboard.writeText(text); toast('Copied to your clipboard.'); }
  catch { openModal(`<h2>Share</h2><textarea class="box" readonly style="min-height:150px">${esc(text)}</textarea>`); const ta = $('#modalBody textarea'); ta.focus(); ta.select(); }
}

/* ═══════════ Countdown ═══════════ */
function tick() {
  const cd = document.querySelector('.cd');
  if (!cd || !S.today) return;
  const ms = new Date(S.today.nextReset).getTime() - Date.now();
  if (ms <= 0) { cd.textContent = 'now! refresh'; return; }
  const s = Math.floor(ms / 1000);
  cd.textContent = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
}
setInterval(tick, 1000);

/* ═══════════ Modals ═══════════ */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modalX').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

const ICON = {
  stations: '<svg viewBox="0 0 70 56"><path d="M0 56 L14 30 L24 40 L36 22 L52 36 L70 14 L70 56Z" fill="#7fae95"/><path d="M8 26 Q35 44 64 12" stroke="#2b3440" stroke-width="1.6" fill="none"/><rect x="4" y="20" width="10" height="8" rx="2" fill="#a5683f"/><rect x="58" y="6" width="10" height="8" rx="2" fill="#a5683f"/></svg>',
  lodge: '<svg viewBox="0 0 70 56"><path d="M0 56 C20 38 50 38 70 56Z" fill="#7fae95"/><rect x="24" y="30" width="22" height="14" rx="2" fill="#a5683f"/><path d="M20 31 L35 20 L50 31Z" fill="#6e3b2a"/><rect x="28" y="34" width="5" height="4" fill="#ffd77a"/><rect x="37" y="34" width="5" height="4" fill="#ffd77a"/><path d="M6 14 Q35 28 64 6" stroke="#2b3440" stroke-width="1.6" fill="none"/><rect x="30" y="12" width="10" height="8" rx="2" fill="#e4572e"/></svg>',
  fog: '<svg viewBox="0 0 70 56"><path d="M6 20 Q35 34 64 8" stroke="#2b3440" stroke-width="1.6" fill="none"/><ellipse cx="35" cy="24" rx="26" ry="11" fill="#dfe6ee"/><ellipse cx="24" cy="28" rx="14" ry="8" fill="#eef2f6"/><text x="35" y="50" text-anchor="middle" font-size="12" font-weight="700" fill="#e4572e">×0.8</text></svg>'
};
let skipperTimer = 0;
/** Skipper's card: click the cable car to meet the operator. */
function showSkipper(r) {
  const play = r ? r.play : null;
  const last = play && play.guesses.length ? play.guesses[play.guesses.length - 1] : null;
  const mood = !play || play.state === 'g1' ? 'smile' : play.state === 'done' ? (play.gaveUp ? 'sad' : verdict(play.score).mood) : verdict(last ? last.raw : 500).mood;
  const lines = {
    smile: "Ready when you are. Name something and I'll take you there.",
    happy: 'Right at the lodge! Best ride all week.',
    wow: 'Whoa, so close I could smell the cocoa.',
    neutral: 'Not bad. The lodge was a little farther along.',
    sad: "Bumpy ride. We'll get the lodge next time.",
    dizzy: "I'm seeing double. That was way out on the cable."
  };
  openModal(`<div class="skipper">
      <div class="portrait"><canvas id="skipCv" width="44" height="44"></canvas></div>
      <div class="sk-text"><h2>${sk()}</h2>
        <p class="sk-role">Cable car operator · Professional middle-finder</p>
        <p class="sk-quote">“${lines[mood] || lines.smile}”</p>
        <ul class="sk-facts"><li><b>Rides:</b> a few thousand, give or take a goat-load</li><li><b>Favorite spot:</b> the lodge, right in the middle</li>
          <li><b>Hates:</b> people who say “a 5 km race”</li><li><b>Snack:</b> alpine wildflowers, fresh off the slope</li></ul>
        <div class="row"><button class="btn" id="skOk">Back to the ride</button><button class="btn alt" id="skWear">👕 Wardrobe</button></div></div></div>`);
  animatePortrait($('#skipCv'), mood, () => look());
  $('#skOk').onclick = closeModal;
  $('#skWear').onclick = showWardrobe;
}

/** Draws Skipper's portrait into a canvas and keeps him blinking. `getLook` is read every frame so previews update live. */
function animatePortrait(cv, mood, getLook) {
  const ctx = cv.getContext('2d');
  let blink = false, ear = 0, n = 0;
  const draw = () => { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(skipperPortrait(mood, blink, ear, getLook()), 0, 0); };
  cv.width = 46; cv.height = 46; draw();
  clearInterval(skipperTimer);
  skipperTimer = setInterval(() => {
    if (!cv.isConnected) { clearInterval(skipperTimer); return; }
    n++; blink = n % 14 === 0; ear = n % 9 === 0 ? 1 : 0; draw();
  }, 220);
  return draw;
}

/* ═══════════ Wardrobe ═══════════ */
async function showWardrobe() {
  openModal(`<h2>${sk()}'s wardrobe</h2><div class="shimmer">Opening the closet…</div>`);
  let w;
  try { w = await api('skipper'); } catch (e) { openModal(`<h2>Wardrobe</h2><div class="note bad">${esc(e.message)}</div>`); return; }
  let tab = 'fur', preview = null, confirming = null;
  const apply = data => {
    w = data; S.bucks = data.bucks; S.me.skipper = data.look; paintTools();
    // Redraw the cable car with the new look.
    if (S.ctx && !S.showSummary && $('#sceneHost')) { S.scenePid = null; ensureScene(S.ctx.rooms[S.roomIdx], 'enter'); }
  };
  const owns = (slot, it) => !it.price || w.owned.includes(itemKey(slot, it.id));
  const shown = () => (preview ? { ...w.look, ...preview } : w.look);

  const draw = () => {
    const items = WARDROBE[tab];
    const list = tab === 'name'
      ? (owns('name', items[0])
        ? `<form class="namebox" id="nameForm"><input class="pin" name="n" maxlength="16" value="${esc(w.look.name)}" aria-label="Name"><button class="btn sm" type="submit">Save name</button></form>
           <p class="sub">Only you see this name.</p>`
        : `<p class="sub">Get the name tag to call your goat whatever you like. Only you see the name.</p>
           <div class="witems">${itemHTML('name', items[0])}</div>`)
      : `<div class="witems">${items.map(it => itemHTML(tab, it)).join('')}</div>`;
    $('#modalBody').innerHTML = `<h2>${sk()}'s wardrobe</h2>
      <div class="wtop"><div class="portrait sm"><canvas id="wardCv" width="44" height="44"></canvas></div>
        <div><div class="wbal">${bucksIcon()} <b>${w.bucks.balance}</b> WK ${w.bucks.balance === 1 ? 'Buck' : 'Bucks'}</div>
          <p class="sub">Summit pays 1 WK Buck for every 100 m you climb on the daily (bonus 5 for a perfect stage, and 5 more for finishing all three). Past days pay half. WK Bucks work in every game's shop.</p></div></div>
      <div class="wtabs">${SLOTS.map(s => `<button type="button" data-wtab="${s.key}" class="${s.key === tab ? 'on' : ''}">${s.name}</button>`).join('')}</div>
      <div class="msg" id="wmsg"></div>
      ${list}`;
    animatePortrait($('#wardCv'), 'smile', shown);
    document.querySelectorAll('[data-wtab]').forEach(b => b.onclick = () => { tab = b.dataset.wtab; preview = null; confirming = null; draw(); });
    document.querySelectorAll('[data-wid]').forEach(b => {
      const slot = b.dataset.wslot, it = WARDROBE[slot].find(x => x.id === b.dataset.wid);
      if (slot !== 'name') {
        b.onmouseenter = () => { preview = { [slot]: it.id }; };
        b.onmouseleave = () => { preview = confirming ? preview : null; };
        b.onfocus = b.onmouseenter; b.onblur = b.onmouseleave;
      }
      b.onclick = () => act(slot, it, b);
    });
    const nf = $('#nameForm');
    if (nf) nf.onsubmit = async e => {
      e.preventDefault();
      try { apply(await api('skipper/wear', { slot: 'name', name: nf.n.value })); toast(`Say hi to ${look().name}!`); draw(); }
      catch (err) { $('#wmsg').innerHTML = `<div class="note bad">${esc(err.message)}</div>`; }
    };
  };

  function itemHTML(slot, it) {
    const own = owns(slot, it), on = slot !== 'name' && w.look[slot] === it.id;
    const asking = confirming === itemKey(slot, it.id);
    const label = on ? 'Wearing' : own ? (slot === 'name' ? 'Yours' : 'Wear') : asking ? `Buy for ${bucksAmount(it.price)}?` : bucksAmount(it.price);
    const short = !own && it.price > w.bucks.balance;
    return `<button type="button" class="witem ${on ? 'on' : ''} ${short ? 'short' : ''} ${asking ? 'ask' : ''}" data-wslot="${slot}" data-wid="${it.id}">
      ${swatch(slot, it)}<span class="wn">${esc(it.name)}</span><span class="wp">${label}</span></button>`;
  }

  async function act(slot, it, b) {
    const own = owns(slot, it);
    if (slot !== 'name' && w.look[slot] === it.id) return;
    if (!own && it.price > w.bucks.balance) {
      const need = it.price - w.bucks.balance;
      $('#wmsg').innerHTML = `<div class="note warn">You need ${need} more WK ${need === 1 ? 'Buck' : 'Bucks'} for that. Keep climbing!</div>`;
      return;
    }
    // Buying takes two taps: the first shows it on and asks.
    if (!own && confirming !== itemKey(slot, it.id)) {
      confirming = itemKey(slot, it.id);
      preview = slot === 'name' ? null : { [slot]: it.id };
      draw();
      return;
    }
    confirming = null;
    b.disabled = true;
    try {
      apply(await api(own ? 'skipper/wear' : 'skipper/buy', { slot, id: it.id }));
      preview = null;
      if (!own) toast(slot === 'name' ? 'Name tag unlocked. Pick a name!' : `${it.name}: yours!`);
      draw();
    } catch (e) { b.disabled = false; $('#wmsg').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
  }
  draw();
}

function swatch(slot, it) {
  const box = bg => `<span class="sw" style="background:${bg}"></span>`;
  if (slot === 'fur') return box(it.c[0]);
  if (slot === 'cabin') return box(it.c);
  if (slot === 'scarf') return box(it.rainbow ? 'linear-gradient(90deg,#d9482b,#f2b33d,#5fae6a,#3f78c9,#7d55c7)' : `repeating-linear-gradient(90deg,${it.c[0]} 0 6px,${it.c[1]} 6px 9px)`);
  if (slot === 'hat') return `<span class="sw em">${{ none: '🙅', beanie: '🧶', party: '🥳', cowboy: '🤠', tophat: '🎩', crown: '👑' }[it.kind]}</span>`;
  if (slot === 'glasses') return `<span class="sw em">${{ none: '👀', specs: '👓', shades: '🕶️', stars: '⭐' }[it.kind]}</span>`;
  return '<span class="sw em">🏷️</span>';
}

function showHelp() {
  openModal(`<h2>How to ride</h2>
    <div class="steps">
      <div class="stepc" style="--d:0">${ICON.stations}<p><b class="n">Three stages a day</b>Foothills, Ridge, then Peak, from easy to hard. Each has a <b>too small</b> thing at the bottom station and a <b>too big</b> thing at the top.</p></div>
      <div class="stepc" style="--d:1">${ICON.lodge}<p><b class="n">Ride to the lodge</b>Name something real that's juuust right in between. The lodge is the middle by <b>ratio</b>: between 1 and 100 it's <b>10</b>, not 50. Shortcut: √(small × big).</p></div>
      <div class="stepc" style="--d:2">${ICON.fog}<p><b class="n">Into the fog</b>You'll see your score, but fog hides which way you're off. Keep it, or take one final ride worth ×0.8. Answers off the cable get ❌: three are free, then the next scores 0.</p></div>
    </div>
    <p class="sub">Each stage is worth up to 1,000 m, so a perfect day tops out at the 3,000 m summit. Every 100 m you climb earns a WK Buck ${bucksIcon()} to spend on ${sk()}'s wardrobe. New mountain every midnight UTC.</p>
    <div class="row"><button class="btn" id="helpGo">All aboard 🚡</button></div>`);
  $('#helpGo').onclick = closeModal;
}
async function showStats() {
  openModal('<h2>Your stats</h2><div class="shimmer">Counting meters…</div>');
  try {
    const s = await api('stats');
    const max = Math.max(1, ...s.dist), names = ['0–999', '1,000+', '1,500+', '2,000+', '2,500+', '3,000'];
    openModal(`<h2>Your stats</h2>
      <div class="statgrid"><div><b>${s.played}</b><span>Days</span></div><div><b>${s.avg}</b><span>Avg m</span></div><div><b>${s.best}</b><span>Best m</span></div>
        <div><b>${s.streak}</b><span>Streak</span></div><div><b>${s.maxStreak}</b><span>Max streak</span></div></div>
      <div class="bars">${s.dist.map((n, i) => `<div class="bar"><span>${names[i]}</span><i style="width:${Math.max(8, n / max * 100)}%;--d:${i}">${n}</i></div>`).join('')}</div>
      <p class="sub">Highest climb: ${meters(s.best)}. Archive: ${s.archive.played} stages · average ${s.archive.avg}.</p>
      ${S.me.signedIn ? '' : '<p class="sub">These are only saved on this device. <button class="link" id="statsSignin">Sign in</button> to take them with you.</p>'}`);
    const si = $('#statsSignin'); if (si) si.onclick = () => showAccount();
  } catch (e) { openModal(`<h2>Your stats</h2><div class="note bad">${esc(e.message)}</div>`); }
}
function accountUI() {
  return { me: S.me, api, openModal, closeModal, toast };
}
function showAccount(note) { accountModal(accountUI(), note); }
function showReport(r, guessId) {
  const g = r.play.guesses.find(x => x.id === guessId); if (!g) return;
  openModal(`<h2>Wrong number?</h2>
    <p>You said “${esc(g.input)}”, and we counted it as <b>${esc(g.name)}</b> at about <b>${esc(val(r.puzzle, g.value))}</b>.</p>
    <p class="sub">Tell us what it should be. If we fix it, everyone's scores update and you'll see a note next time you stop by.</p>
    <textarea class="box" id="rnote" maxlength="500" placeholder="What should it be? A link helps. (optional)"></textarea>
    <div class="row"><button class="btn" id="rsend">Send report</button><button class="btn alt" id="rcancel">Cancel</button></div>`);
  $('#rcancel').onclick = closeModal;
  $('#rsend').onclick = async () => {
    $('#rsend').disabled = true;
    try { await api('complaint', { guessId, note: $('#rnote').value }); r.complaints = { ...(r.complaints || {}), [guessId]: 'open' }; closeModal(); toast('Thanks! We\'ll take a look.'); afterChange(r, 'none'); }
    catch (e) { toast(e.message); $('#rsend').disabled = false; }
  };
}
function showNotifications(list) {
  openModal(`<h2>Mail from the lodge 📬</h2>
    ${list.map(n => `<div class="note ${n.status === 'accepted' ? '' : 'warn'}" style="margin-bottom:10px">${n.status === 'accepted' ? '✅ You were right!' : '📝 We checked your report.'}
      <div class="sub">“${esc(n.input)}” now counts as ${esc(n.name)} ≈ ${esc(fmt(n.property, n.value, n.unitLabel, S.units))}.${n.status === 'accepted' ? ' Your score has been updated.' : ' We\'re keeping it as is.'}</div>
      ${n.note ? `<div class="sub">Note: ${esc(n.note)}</div>` : ''}</div>`).join('')}
    <div class="row"><button class="btn" id="nOk">Got it</button></div>`);
  $('#nOk').onclick = closeModal;
  api('notifications/seen', { ids: list.map(n => n.id) }).catch(() => {});
}

/* ═══════════ Archive ═══════════ */
async function renderArchiveList() {
  dropScene(); S.ctx = null;
  $('#main').innerHTML = loadingHTML('Unrolling the trail maps…');
  const d = await api('archive');
  const rows = d.days.map((day, i) => {
    const cells = [1, 2, 3].map(sl => {
      const s = day.slots.find(x => x.slot === sl);
      const v = s ? (s.daily != null ? s.daily : s.archive) : null;
      return `<span class="${v == null ? '' : 'sq ' + tier(v)}" title="${stageOf(sl).name}">${v == null ? '·' : v}</span>`;
    }).join('');
    const dateStr = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `<a class="aday" style="--d:${Math.min(i, 15)}" href="#/archive/${day.date}"><span class="num">#${day.number}</span><span class="d">${esc(dateStr)}</span><span class="s">${cells}</span></a>`;
  }).join('');
  $('#main').innerHTML = `<section class="card"><h2 class="prompt">🗺️ Trail maps</h2>
    <p class="sub">Catch up on days you missed. These don't count toward your streak.</p>
    <div class="archive">${rows || '<p class="empty">No past days yet. Come back tomorrow!</p>'}</div>
    <div class="row"><a class="btn alt sm" href="#/">← Today</a></div></section>`;
}

/* ═══════════ Header tools ═══════════ */
function paintTools() {
  $('#unitBtn').textContent = S.units === 'imperial' ? 'US' : 'Metric';
  $('#unlBtn').hidden = !S.me.isAdmin;
  $('#admBtn').hidden = !S.me.isAdmin;
  $('#acctBtn').classList.toggle('on', !!S.me.signedIn);
  $('#bucksIco').innerHTML = bucksIcon();
  $('#bucksNum').textContent = S.bucks ? S.bucks.balance : '';
}
$('#helpBtn').onclick = showHelp;
$('#statsBtn').onclick = showStats;
$('#acctBtn').onclick = () => showAccount();
$('#wardBtn').onclick = showWardrobe;
$('#unlBtn').onclick = () => { location.hash = '#/unlimited'; };
$('#unitBtn').onclick = () => {
  S.units = S.units === 'imperial' ? 'metric' : 'imperial'; store.set('jr.units', S.units);
  paintTools(); pad.setUnits(S.units);
  if (S.ctx && $('#card')) { const r = S.ctx.rooms[S.roomIdx]; if (S.showSummary) render(); else { $('#signs').innerHTML = signsHTML(r); $('#card').innerHTML = cardHTML(r, S.ctx); wireCard(r, S.ctx); } }
};
$('#padBtn').onclick = () => togglePad();
function togglePad(force) {
  const open = force === undefined ? !document.body.classList.contains('pad-open') : force;
  document.body.classList.toggle('pad-open', open);
  $('#padBtn').classList.toggle('on', open);
  store.set('jr.padOpen', open);
}

pad.mount($('#pad'), { units: S.units, onClose: () => togglePad(false) });
paintTools();
if (store.get('jr.padOpen', false) && window.innerWidth >= 1040) togglePad(true);
route();
