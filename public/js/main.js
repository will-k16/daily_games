import { bear, item, honeyJar, icon } from './sprites.js';
import { fmt, nice } from './units.js';
import { PROPS, ROOMS, propLabel } from './props.js';
import { scoreGuess, logPos, SECOND_GUESS_MULT, MAX_REJECTS } from './score.js';
import * as pad from './pad.js';

/* ═══════════ Basics ═══════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const S = {
  units: store.get('jr.units', 'imperial'),
  me: { signedIn: false, isAdmin: false, email: '' },
  today: null,     // /api/today payload
  ctx: null,       // what's on screen: { kind: 'daily'|'archive'|'unlimited', date, number, rooms[], day }
  roomIdx: 0,
  showSummary: false
};

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch('/api/' + path, { credentials: 'same-origin', ...opt });
  const data = await res.json().catch(() => ({ error: 'The cottage is having trouble. Try again.' }));
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
}

const val = (p, v) => fmt(p.property, v, p.unitLabel, S.units);
const roomOf = slot => ROOMS.find(r => r.slot === slot) || ROOMS[0];

/* ═══════════ Time of day ═══════════ */
function tod() {
  const h = new Date().getHours();
  return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
}
setInterval(() => { const t = tod(); if (document.documentElement.dataset.tod !== t) { document.documentElement.dataset.tod = t; render(); } }, 60000);

/* ═══════════ Verdicts ═══════════ */
function verdict(s) {
  if (s >= 100) return { t: 'Juuust right!', face: 'happy', d: 'The bear is overjoyed.' };
  if (s >= 90) return { t: 'So close!', face: 'wow', d: 'A whisker away from perfect.' };
  if (s >= 75) return { t: 'Nice and cozy', face: 'smile', d: 'Very comfortable.' };
  if (s >= 50) return { t: 'Lukewarm', face: 'neutral', d: 'Not bad, not perfect.' };
  if (s >= 25) return { t: 'Too lumpy', face: 'sad', d: 'The bear has questions.' };
  if (s > 0) return { t: 'Way off!', face: 'dizzy', d: 'The bear fell off the chair.' };
  return { t: 'Yikes!', face: 'dizzy', d: 'Nowhere near just right.' };
}
// Same bands as the share squares: 🟩 90+, 🟨 60+, 🟧 30+, 🟥 below.
const tier = s => s >= 90 ? 'green' : s >= 60 ? 'yellow' : s >= 30 ? 'orange' : 'red';
const square = s => ({ green: '🟩', yellow: '🟨', orange: '🟧', red: '🟥' })[tier(s)];
const VERB = { 1: 'Serve it', 2: 'Sit on it', 3: 'Sleep on it' };
const ITEM = { 1: 'bowl', 2: 'chair', 3: 'bed' };

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
  $('#main').innerHTML = `<div class="card"><div class="note bad">${esc(e.message || e)}</div><div class="row"><button class="btn alt sm" id="retry">Try again</button></div></div>`;
  $('#retry').onclick = route;
}

async function loadToday() {
  if (!S.today) $('#main').innerHTML = loadingHTML('Warming up the porridge…');
  const d = await api('today');
  S.today = d; S.me = d.me;
  paintTools();
  S.ctx = { kind: 'daily', date: d.date, number: d.number, rooms: d.rooms.map(r => ({ ...r, mode: 'daily' })), day: d.day };
  S.roomIdx = firstOpen(S.ctx.rooms);
  S.showSummary = S.ctx.rooms.every(r => r.play.state === 'done');
  render();
  if (d.notifications && d.notifications.length) showNotifications(d.notifications);
  else if (!store.get('jr.seenHelp', false)) { store.set('jr.seenHelp', true); showHelp(); }
  const sp = new URLSearchParams(location.search);
  if (sp.get('signin') === 'failed') { toast('Sign-in didn\'t work. Try again.'); history.replaceState(null, '', '/'); }
  if (sp.get('signedin') === '1') {
    history.replaceState(null, '', '/');
    toast(S.me.signedIn ? `Signed in as ${S.me.email}. Your stats now follow you.` : 'Sign-in didn\'t stick. Try once more.');
  }
}

async function loadArchiveDay(date) {
  $('#main').innerHTML = loadingHTML('Dusting off an old recipe…');
  const d = await api('archive/day?date=' + encodeURIComponent(date));
  S.ctx = { kind: 'archive', date: d.date, number: d.number, rooms: d.rooms, day: d.day };
  S.roomIdx = firstOpen(S.ctx.rooms);
  S.showSummary = S.ctx.rooms.every(r => r.play.state === 'done');
  render();
}

async function loadUnlimited(fresh) {
  $('#main').innerHTML = loadingHTML('Cooking up a fresh puzzle…');
  if (fresh || !S.unl) S.unl = await api('unlimited/new', {});
  S.ctx = { kind: 'unlimited', rooms: [S.unl], day: null };
  S.roomIdx = 0; S.showSummary = false;
  render();
}

const firstOpen = rooms => { const i = rooms.findIndex(r => r.play.state !== 'done'); return i < 0 ? rooms.length - 1 : i; };
const loadingHTML = msg => `<div class="loading">${bear('think', { px: 0 })}${esc(msg)}</div>`;

/* ═══════════ Render ═══════════ */
function render() {
  const c = S.ctx;
  if (!c) return;
  const m = $('#main');
  m.innerHTML = dayHeadHTML(c) + (S.showSummary && c.kind !== 'unlimited' ? summaryHTML(c) : roomHTML(c.rooms[S.roomIdx], c));
  wire(c);
  const r = c.rooms[S.roomIdx];
  if (r) pad.setPuzzle(r.puzzle, S.units);
}

function dayHeadHTML(c) {
  if (c.kind === 'unlimited') {
    return `<div class="dayhead"><div class="daylabel"><span class="badge">Admin</span> <b>Unlimited</b> · testing only</div>
      <button class="btn alt sm" id="newUnl">New puzzle →</button></div>`;
  }
  const total = c.rooms.reduce((s, r) => s + (r.play.state === 'done' ? r.play.score || 0 : 0), 0);
  const allDone = c.rooms.every(r => r.play.state === 'done');
  const tabs = c.rooms.map((r, i) => {
    const room = roomOf(r.puzzle.slot), done = r.play.state === 'done';
    const locked = i > 0 && c.rooms[i - 1].play.state !== 'done' && !done && r.play.state === 'g1' && !r.play.guesses.length;
    return `<button class="rtab ${i === S.roomIdx && !S.showSummary ? 'on' : ''} ${done ? 'done' : ''}" data-room="${i}" ${locked ? 'disabled title="Finish the room before"' : ''}>
      <span class="em">${room.emoji}</span>${room.name}<span class="sc">${done ? r.play.score : locked ? '🔒' : '·'}</span></button>`;
  }).join('') + (allDone ? `<button class="rtab ${S.showSummary ? 'on' : ''}" data-summary="1"><span class="em">🍯</span>Results</button>` : '');
  const dateStr = new Date(c.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `<div class="dayhead">
      <div class="daylabel">${c.kind === 'archive' ? '<span class="badge">Archive</span> ' : ''}Day <b>#${c.number}</b> · ${esc(dateStr)}</div>
      <div class="jarbox" title="Today's honey">${honeyJar(total / 300, 0)}<b>${total}</b><span>/ 300</span></div>
    </div>
    <div class="rooms" role="tablist">${tabs}</div>`;
}

function sceneHTML(r, revealed) {
  const slot = r.puzzle.slot, key = roomOf(slot).key, it = ITEM[slot] || 'bowl';
  const t = document.documentElement.dataset.tod;
  const sky = t === 'night'
    ? `<span class="moonpos">${item('moon', { px: 0 })}</span>` + [[12, 18], [30, 60], [70, 30], [20, 75]].map(([x, y]) => `<span class="px starpos" style="position:absolute;left:${x}%;top:${y}%">${item('star', { px: 0 })}</span>`).join('')
    : `<span class="sunpos">${item('sun', { px: 0 })}</span>`;
  const steam = slot === 1 ? '<span class="steam"><i></i><i></i><i></i></span>' : '';
  const play = r.play, done = play.state === 'done';
  let host;
  if (done) {
    const v = verdict(play.score);
    host = `<div class="host react ${play.score < 25 ? 'toppled' : ''}"><div class="middle-obj">${item(it, { px: 0 })}</div>${bear(v.face, { px: 0, cls: 'bear' })}</div>`;
  } else if (play.state === 'decide' || play.state === 'g2') {
    const g = play.guesses[play.guesses.length - 1];
    host = `<div class="host react"><div class="bubble">${item('qmark', { px: 0 })}</div>${bear(g ? verdict(g.raw).face : 'think', { px: 0, cls: 'bear' })}</div>`;
  } else {
    host = `<div class="host"><div class="bubble">${item('qmark', { px: 0 })}</div>${bear(play.rejects ? 'think' : 'neutral', { px: 0, cls: 'bear' })}</div>`;
  }
  return `<div class="scene ${key}">
      <div class="window">${sky}</div>
      <div class="shelf">${slot === 2 ? `<span style="left:30%">${item('plant', { px: 0 })}</span>` : `<span style="left:30%">${honeyJar(.7, 0)}</span>`}</div>
      <div class="floor"></div>
      ${slot === 1 ? '<div class="table"></div>' : ''}${slot === 2 ? '<div class="rug"></div>' : ''}
      <div class="obj small">${steam}${item(it, { px: 0 })}<span class="tag">too small</span></div>
      <div class="obj big">${steam}${item(it, { px: 0 })}<span class="tag">too big</span></div>
      ${host}
    </div>`;
}

function signsHTML(r) {
  const rv = r.reveal && r.reveal.puzzle;
  return `<div class="signs">
      <div class="sign small"><small>TOO SMALL</small><b>${esc(r.puzzle.small)}</b>${rv ? `<div class="val">≈ ${esc(val(rv, rv.smallValue))}</div>` : ''}</div>
      <div class="sign big"><small>TOO BIG</small><b>${esc(r.puzzle.big)}</b>${rv ? `<div class="val">≈ ${esc(val(rv, rv.bigValue))}</div>` : ''}</div>
    </div>`;
}

function roomHTML(r, c) {
  if (!r) return `<div class="card"><p class="empty">No puzzle here.</p></div>`;
  const room = roomOf(r.puzzle.slot), p = r.puzzle, play = r.play;
  const label = propLabel(p.property);
  let flow = '';
  if (play.state === 'g1' || play.state === 'g2') flow = guessFormHTML(r);
  else if (play.state === 'decide') flow = decideHTML(r);
  else flow = revealHTML(r, c);
  return `<section class="card room-card" id="roomCard">
      <div class="kicker"><span>${room.emoji} <b>${room.name}</b> · ${room.tier}</span><span>${c.kind === 'unlimited' ? 'practice' : `room ${p.slot} of 3`}</span></div>
      ${sceneHTML(r, play.state === 'done')}
      ${signsHTML(r)}
      <h2 class="prompt">Find something whose <span class="prop">${esc(label)}</span> is juuust right.</h2>
      ${flow}
    </section>`;
}

function pipsHTML(used) {
  let s = '';
  for (let i = 0; i < MAX_REJECTS; i++) s += `<span class="pip ${i < used ? 'used' : ''}">${i < used ? '✕' : ''}</span>`;
  const left = MAX_REJECTS - used;
  return `<div class="pips">${s}<span>${left > 0 ? `${left} out-of-range ${left === 1 ? 'try' : 'tries'} left before it counts as 0` : 'Next out-of-range answer counts as 0!'}</span></div>`;
}

function guessFormHTML(r) {
  const play = r.play, second = play.state === 'g2';
  const g1 = play.guesses[0];
  return `${second && g1 ? firstGuessCard(r, g1, true) : ''}
    <form class="guess" id="guessForm" autocomplete="off">
      <input name="a" maxlength="80" placeholder="${second ? 'Your final guess…' : 'Name something real…'}" aria-label="Your answer" enterkeyhint="go">
      <button class="btn full-sm" type="submit">${second ? 'Final answer' : VERB[r.puzzle.slot] || 'Serve it'}</button>
    </form>
    ${pipsHTML(play.rejects || 0)}
    <button type="button" class="link giveup" id="giveUpBtn">🏳️ Give up and take a 0</button>
    <div class="msg" id="msg"></div>
    <p class="sub">${second
      ? `This guess is final and is worth <b>×${SECOND_GUESS_MULT}</b>. It has to be something different.`
      : 'The middle is by <b>ratio</b>: between 1 and 100, just right is 10 (not 50). Stuck? Open the notebook.'}</p>`;
}

function firstGuessCard(r, g, compact) {
  const p = r.puzzle;
  const complained = r.complaints && r.complaints[g.id];
  return `<div class="gcard ${compact ? 'compact' : ''}">
      <div class="bigscore">${g.score}<small>${g.outOfRange ? 'out of range' : 'points'}</small></div>
      <div>
        <div class="said">You said “${esc(g.input)}”</div>
        <div class="judged">Judged as ${esc(g.name)} · <span class="val">≈ ${esc(val(p, g.value))}</span></div>
        ${complained ? `<span class="empty">Report sent (${esc(complained)})</span>` : `<button class="link report" data-guess="${g.id}">Judge got it wrong?</button>`}
      </div>
    </div>`;
}

function decideHTML(r) {
  const g = r.play.guesses[0];
  const retry = Math.round(100 * SECOND_GUESS_MULT);
  return `${firstGuessCard(r, g, false)}
    <p class="deduce">${g.outOfRange
      ? 'That one landed outside the range, so it counts as 0.'
      : `Your score tells you how far off you are, but not which way. Just right is somewhere <b>bigger or smaller</b> than ${esc(val(r.puzzle, g.value))}.`}</p>
    <div class="choices">
      <button class="btn green two" id="keepBtn">Keep ${g.score}<span class="hint">Lock it in</span></button>
      <button class="btn alt two" id="retryBtn">One more try<span class="hint">Final guess, worth up to ${retry}</span></button>
    </div>`;
}

function thermoHTML(r) {
  const p = r.reveal.puzzle, play = r.play;
  const stops = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, v = Math.exp(Math.log(p.smallValue) + t * (Math.log(p.bigValue) - Math.log(p.smallValue)));
    const s = scoreGuess(p.smallValue, p.bigValue, v);
    stops.push(`rgba(90,168,100,${(s / 100 * .95).toFixed(3)}) ${(t * 100).toFixed(1)}%`);
  }
  const final = play.gaveUp ? null : play.guesses[play.guesses.length - 1];
  const first = play.gaveUp ? play.guesses[0] || null : play.guesses.length > 1 ? play.guesses[0] : null;
  const pos = g => (clamp(logPos(p.smallValue, p.bigValue, g.value), 0, 1) * 100).toFixed(2) + '%';
  return `<div class="thermo" aria-label="Porridge thermometer">
      <div class="bar"><div class="band" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="ticks"></div>
        <span class="bulb"></span><span class="cap"></span><span class="center"></span>
        ${first ? `<span class="marker ghost" style="left:50%" data-left="${pos(first)}">${bear(verdict(first.raw).face, { px: 0 })}</span>` : ''}
        ${final ? `<span class="marker" style="left:50%" data-left="${pos(final)}">${bear(verdict(play.score).face, { px: 0 })}</span>` : ''}
      </div>
      <div class="legend">
        <div>❄️ Too small<b>${esc(val(p, p.smallValue))}</b></div>
        <div class="mid">Just right<b>≈ ${esc(val(p, p.middle))}</b></div>
        <div class="r">Too big 🔥<b>${esc(val(p, p.bigValue))}</b></div>
      </div>
    </div>`;
}

function offText(p, v) {
  const mid = p.middle, words = (PROPS[p.property] && PROPS[p.property].more) || ['bigger', 'smaller'];
  const f = v / mid;
  if (Math.abs(Math.log(f)) < 0.01) return 'dead center';
  if (f > 1) return f < 2 ? `${Math.round((f - 1) * 100)}% ${words[0]} than just right` : `${f < 10 ? f.toFixed(1) : nice(f)}× ${words[0]} than just right`;
  const g = 1 / f; return g < 2 ? `${Math.round((1 - f) * 100)}% ${words[1]} than just right` : `${g < 10 ? g.toFixed(1) : nice(g)}× ${words[1]} than just right`;
}

function revealHTML(r, c) {
  const play = r.play, rv = r.reveal, p = rv.puzzle;
  const v = play.gaveUp ? { t: 'Gave up', face: 'sad', d: 'No shame. The bear gets stumped too.' } : verdict(play.score);
  const guesses = play.guesses.map(g => {
    const isFinal = g.attempt === play.guesses.length;
    const complained = r.complaints && r.complaints[g.id];
    return `<div class="fact ${isFinal ? 'final' : ''}">
        <span class="n">#${g.attempt}</span>
        <div class="w"><b>${esc(g.name)}</b> ≈ ${esc(val(p, g.value))}
          <small>You said “${esc(g.input)}” · ${g.outOfRange ? 'out of range' : esc(offText(p, g.value))}${g.attempt === 2 ? ` · ${g.raw} × ${SECOND_GUESS_MULT}` : ''}${!isFinal ? ' · not counted' : ''}</small>
          ${complained ? `<small>Report: ${esc(complained)}</small>` : `<button class="link report" data-guess="${g.id}">Judge got it wrong?</button>`}</div>
        <span class="s">${g.score}</span>
      </div>`;
  }).join('');

  let crowd = '';
  if (rv.crowd) {
    const max = Math.max(1, ...rv.crowd.hist);
    const myB = Math.min(10, Math.floor(play.score / 10));
    const beat = c.kind === 'daily'
      ? (rv.crowd.beat == null ? `You're one of the first to play this room today.` : `You beat <b>${rv.crowd.beat}%</b> of ${rv.crowd.total - 1} other players.`)
      : `${rv.crowd.total} people played this room on the day.`;
    crowd = `<div class="crowd">
        <div><div class="section-title">How everyone did</div><p class="beat">${beat}</p>
          <div class="histo">${rv.crowd.hist.map((n, i) => `<i class="${i === myB && c.kind === 'daily' ? 'me' : ''}" style="height:${Math.max(4, n / max * 100)}%" title="${i * 10}${i < 10 ? '–' + (i * 10 + 9) : ''}: ${n}"></i>`).join('')}</div>
          <div class="histo-l"><span>0</span><span>50</span><span>100</span></div></div>
        <div><div class="section-title">Top answers today</div>
          ${rv.top.length ? `<ol class="toplist">${rv.top.map((t, i) => `<li class="${i === 0 ? 'best' : ''}"><span class="rk">${i === 0 ? '👑' : i + 1}</span>
            <span class="nm">${esc(t.name)}<small>≈ ${esc(val(p, t.value))} · ${t.count} ${t.count === 1 ? 'player' : 'players'}</small></span><span class="sc">${t.score}</span></li>`).join('')}</ol>`
            : `<p class="empty">Top answers show up once a few players find the same thing.</p>`}
        </div></div>`;
  }

  const nextIdx = c.rooms.findIndex(x => x !== r && x.play.state !== 'done');
  const nextRoom = nextIdx >= 0 ? roomOf(c.rooms[nextIdx].puzzle.slot) : null;
  const next = c.kind === 'unlimited'
    ? `<button class="btn" id="nextUnl">Next puzzle →</button>`
    : nextRoom ? `<button class="btn" id="nextRoom" data-next="${nextIdx}">Next room: ${nextRoom.emoji} ${nextRoom.name} →</button>`
      : `<button class="btn" id="toSummary">See today's honey 🍯</button>`;

  return `<div class="verdict">
      <div class="score">${play.score}<small>/ 100</small></div>
      <div><h3>${v.t}</h3><p>${v.d}${play.usedSecond ? ' Second guess (×0.8).' : ''}</p></div>
    </div>
    ${thermoHTML(r)}
    <div class="facts">${guesses}${play.gaveUp ? '<div class="fact final"><span class="n">🏳️</span><div class="w"><b>You gave up</b><small>Scored 0 for this room.</small></div><span class="s">0</span></div>' : ''}</div>
    <div class="section-title">🐻 The bear's pick</div>
    <div class="bestbox" id="bestBox" data-id="${p.id}" data-mode="${esc(r.mode || 'daily')}"><span class="empty">The bear is thinking of the juuust right answer…</span></div>
    ${crowd}
    <div class="row">${next}</div>`;
}

function summaryHTML(c) {
  const total = c.rooms.reduce((s, r) => s + (r.play.score || 0), 0);
  const day = c.day || {};
  const v = verdict(Math.round(total / 3));
  const beat = c.kind === 'daily' && day.beat != null ? `<p class="beat">You beat <b>${day.beat}%</b> of today's ${day.players - 1} other finishers.</p>`
    : c.kind === 'daily' ? '<p class="beat">You\'re one of the first to finish today!</p>' : '';
  return `<section class="card summary">
      <div class="kicker"><span>${c.kind === 'archive' ? 'Archive' : 'Today'}</span><span>Day #${c.number}</span></div>
      <div class="jarbig">${honeyJar(total / 300, 0)}</div>
      <div class="total">${total}<small> / 300</small></div>
      <h3 class="prompt" style="margin-top:6px">${v.t}</h3>
      ${beat}
      <div class="mini">${c.rooms.map(r => `<span>${roomOf(r.puzzle.slot).emoji} <b>${r.play.score}</b></span>`).join('')}</div>
      <div class="row" style="justify-content:center">
        <button class="btn" id="shareBtn">Share</button>
        <button class="btn alt" id="statsBtn2">Stats</button>
        ${c.kind === 'archive' ? '<a class="btn alt" href="#/archive" style="display:inline-flex;align-items:center;text-decoration:none">More days</a>' : ''}
      </div>
      ${c.kind === 'daily' ? `<div class="countdown">Fresh rooms in <b class="cd">--:--:--</b></div>` : ''}
      ${S.today && S.today.tipUrl ? `<a class="tip" href="${esc(S.today.tipUrl)}" target="_blank" rel="noopener">🍯 Enjoying it? Leave the bear a tip</a>` : ''}
    </section>`;
}

/* ═══════════ Wiring ═══════════ */
function wire(c) {
  document.querySelectorAll('[data-room]').forEach(b => b.onclick = () => { S.roomIdx = Number(b.dataset.room); S.showSummary = false; render(); });
  const sb = document.querySelector('[data-summary]'); if (sb) sb.onclick = () => { S.showSummary = true; render(); };
  const r = c.rooms[S.roomIdx];
  const form = $('#guessForm');
  if (form) {
    form.onsubmit = e => { e.preventDefault(); const a = form.a.value.trim(); if (a) submitGuess(r, a, false); };
    if (window.innerWidth > 760) form.a.focus();
  }
  const keep = $('#keepBtn'); if (keep) keep.onclick = () => decide(r, 'keep');
  const retry = $('#retryBtn'); if (retry) retry.onclick = () => decide(r, 'retry');
  document.querySelectorAll('.report').forEach(b => b.onclick = () => showReport(r, Number(b.dataset.guess)));
  const nr = $('#nextRoom'); if (nr) nr.onclick = () => { S.roomIdx = Number(nr.dataset.next); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const ts = $('#toSummary'); if (ts) ts.onclick = () => { S.showSummary = true; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const nu = $('#nextUnl'); if (nu) nu.onclick = () => loadUnlimited(true);
  const nu2 = $('#newUnl'); if (nu2) nu2.onclick = () => loadUnlimited(true);
  const gu = $('#giveUpBtn'); if (gu) gu.onclick = () => confirmGiveUp(r);
  const bb = $('#bestBox'); if (bb) loadBest(bb, r);
  const share = $('#shareBtn'); if (share) share.onclick = () => doShare(c);
  const st2 = $('#statsBtn2'); if (st2) st2.onclick = showStats;
  // Slide thermometer markers in.
  document.querySelectorAll('.marker[data-left]').forEach(m => requestAnimationFrame(() => setTimeout(() => { m.style.left = m.dataset.left; }, 120)));
  tick();
}

async function submitGuess(r, answer, avg) {
  const form = $('#guessForm'), msg = $('#msg');
  const btn = form.querySelector('button'), input = form.a;
  btn.disabled = true; input.disabled = true; const label = btn.textContent; btn.textContent = 'Tasting…';
  msg.innerHTML = '';
  let rerendered = false;
  try {
    const res = await api('guess', { puzzleId: r.puzzle.id, mode: r.mode || 'daily', answer, avg: !!avg });
    if (res.play) Object.assign(r, { play: res.play, reveal: res.reveal, complaints: res.complaints || {} });
    if (res.status === 'accepted' || res.status === 'stale') {
      rerendered = true;
      afterChange(r);
      return;
    }
    if (res.status === 'out_of_range') {
      rerendered = true;
      render();
      $('#msg').innerHTML = `<div class="note bad">Out of range! ${res.triesLeft > 0 ? `That doesn't count. ${res.triesLeft} more ${res.triesLeft === 1 ? 'try' : 'tries'} before it does.` : 'That doesn\'t count, but the next out-of-range answer will be a 0.'}</div>`;
      $('#roomCard').classList.add('shake');
      return;
    }
    if (res.status === 'vague') {
      msg.innerHTML = `<div class="note warn">That one varies a lot. Want to be more specific?
        <div class="chips">${(res.suggestions || []).map(s => `<button type="button" class="chip">${esc(s)}</button>`).join('')}</div>
        <button type="button" class="link avg">Use the average for “${esc(answer)}”</button></div>`;
      msg.querySelectorAll('.chip').forEach(ch => ch.onclick = () => { input.value = ch.textContent; submitGuess(r, ch.textContent, false); });
      msg.querySelector('.avg').onclick = () => submitGuess(r, answer, true);
      return;
    }
    msg.innerHTML = `<div class="note bad">${esc(res.reason || 'Couldn\'t use that. Try something real and specific.')}</div>`;
  } catch (e) {
    msg.innerHTML = `<div class="note bad">${esc(e.message)}</div>`;
  } finally {
    if (!rerendered) { btn.disabled = false; input.disabled = false; btn.textContent = label; input.focus(); input.select(); }
  }
}

async function decide(r, choice) {
  document.querySelectorAll('.choices .btn').forEach(b => b.disabled = true);
  try {
    const res = await api('decide', { puzzleId: r.puzzle.id, mode: r.mode || 'daily', choice });
    Object.assign(r, { play: res.play, reveal: res.reveal, complaints: res.complaints || {} });
    afterChange(r);
  } catch (e) { toast(e.message); document.querySelectorAll('.choices .btn').forEach(b => b.disabled = false); }
}

function afterChange(r) {
  render();
  if (r.play.state === 'done') {
    const s = r.play.score;
    if (s >= 100) confetti(90); else if (s >= 90) confetti(40);
    if (S.ctx.kind === 'daily') refreshDay();
  } else if (r.play.state === 'decide') {
    const g = r.play.guesses[0];
    if (g && g.raw >= 90) confetti(20);
  }
}

async function refreshDay() {
  // Pull fresh day totals/percentiles without re-rendering the current reveal.
  try {
    const d = await api('today');
    S.today = d;
    if (S.ctx.kind === 'daily' && S.ctx.date === d.date) { S.ctx.day = d.day; if (S.showSummary) render(); }
  } catch { /* fine */ }
}

function confirmGiveUp(r) {
  openModal(`<h2>Give up on this room?</h2>
    <p>You'll get <b>0</b> for ${esc(roomOf(r.puzzle.slot).name)}, and the bear will show you the answer.</p>
    <div class="row"><button class="btn alt" id="guNo">Keep trying</button><button class="btn" id="guYes" style="background:var(--hot);color:#fff">Give up</button></div>`);
  $('#guNo').onclick = closeModal;
  $('#guYes').onclick = async () => {
    $('#guYes').disabled = true;
    try {
      const res = await api('giveup', { puzzleId: r.puzzle.id, mode: r.mode || 'daily' });
      Object.assign(r, { play: res.play, reveal: res.reveal, complaints: res.complaints || {} });
      closeModal(); afterChange(r);
    } catch (e) { toast(e.message); $('#guYes').disabled = false; }
  };
}

const bestCache = new Map();
async function loadBest(box, r) {
  const key = r.puzzle.id + '|' + (r.mode || 'daily');
  const draw = b => {
    if (!box.isConnected) return;
    const p = r.reveal.puzzle;
    box.innerHTML = `<div class="fact best"><span class="n">${b.score >= 100 ? '👑' : '✨'}</span>
      <div class="w"><b>${esc(b.name)}</b> ≈ ${esc(val(p, b.value))}<small>Type “${esc(b.input)}” · ${esc(offText(p, b.value))}</small></div>
      <span class="s">${b.score}</span></div>`;
  };
  if (bestCache.has(key)) return draw(bestCache.get(key));
  try {
    const b = await api(`best?id=${r.puzzle.id}&mode=${encodeURIComponent(r.mode || 'daily')}`);
    bestCache.set(key, b); draw(b);
  } catch (e) {
    if (box.isConnected) box.innerHTML = `<span class="empty">${esc(e.message)} <button class="link" type="button">Try again</button></span>`;
    const again = box.querySelector('button'); if (again) again.onclick = () => { box.innerHTML = '<span class="empty">Thinking…</span>'; loadBest(box, r); };
  }
}

/* ═══════════ Share ═══════════ */
function shareText(c) {
  const total = c.rooms.reduce((s, r) => s + (r.play.score || 0), 0);
  const head = c.kind === 'archive' ? `Just Right #${c.number} (archive) 🐻 ${total}/300` : `Just Right #${c.number} 🐻 ${total}/300`;
  const rows = c.rooms.map(r => {
    const p = r.play;
    let s = roomOf(r.puzzle.slot).emoji + ' ' + '❌'.repeat(p.rejects1 || 0);
    const g1 = p.guesses[0], g2 = p.guesses[1];
    if (p.gaveUp) return s + (g1 ? square(g1.score) + '→' + '❌'.repeat(p.rejects2 || 0) : '') + '🏳️ 0';
    if (g1) s += square(g1.score);
    if (g2) s += '→' + '❌'.repeat(p.rejects2 || 0) + square(g2.score);
    return s + ' ' + p.score;
  });
  return [head, ...rows, location.origin].join('\n');
}
async function doShare(c) {
  const text = shareText(c);
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ text }); return; } catch { /* fall through to copy */ }
  }
  try { await navigator.clipboard.writeText(text); toast('Copied! Paste it anywhere.'); }
  catch { openModal(`<h2>Share</h2><textarea class="box" readonly style="min-height:140px;font-family:var(--font-px)">${esc(text)}</textarea>`); const ta = $('#modalBody textarea'); ta.focus(); ta.select(); }
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

/* ═══════════ Confetti ═══════════ */
function confetti(n) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f2a93b', '#5aa864', '#e0603f', '#5b9bd5', '#f39a8d', '#fff4dc'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colors[i % colors.length];
    d.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    d.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    d.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
    d.style.animationDelay = (Math.random() * .4) + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }
}

/* ═══════════ Modals ═══════════ */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modalX').innerHTML = icon('close');
$('#modalX').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function showHelp() {
  openModal(`<h2>How to play</h2>
    <div class="comic">
      <div class="panel"><div class="art">${item('bowl', { px: 2 })}${item('bowl', { px: 5 })}</div>
        <p><b class="n">1 · Three rooms a day</b>Porridge, Chairs, then Beds, from easy to hard. Each room has something <b>too small</b>, something <b>too big</b>, and a property like weight or price.</p></div>
      <div class="panel"><div class="art">${bear('think', { px: 3 })}</div>
        <p><b class="n">2 · Find the juuust right thing</b>Name something real in between. The middle is by <b>ratio</b>: between 1 and 100, just right is <b>10</b> (not 50). Shortcut: √(small × big).</p></div>
      <div class="panel"><div class="art">${bear('happy', { px: 3 })}</div>
        <p><b class="n">3 · Keep it or try once more</b>You'll see your score but not whether you were too big or too small. Keep it, or take one final guess worth ×0.8. Out-of-range answers get a ❌: three are free, then the next one scores 0.</p></div>
    </div>
    <p class="sub">New rooms every day at midnight UTC. No timer, so take your time and use the notebook.</p>
    <div class="row"><button class="btn" id="helpGo">Let's eat!</button></div>`);
  $('#helpGo').onclick = closeModal;
}

async function showStats() {
  openModal(`<h2>Your stats</h2><div class="loading" style="padding:20px">Counting honey…</div>`);
  try {
    const s = await api('stats');
    const max = Math.max(1, ...s.dist);
    const names = ['0–99', '100–149', '150–199', '200–249', '250–299', '300'];
    openModal(`<h2>Your stats</h2>
      <div class="statgrid">
        <div><b>${s.played}</b><span>Days</span></div><div><b>${s.avg}</b><span>Avg / 300</span></div>
        <div><b>${s.best}</b><span>Best</span></div><div><b>${s.streak}</b><span>Streak</span></div><div><b>${s.maxStreak}</b><span>Max streak</span></div>
      </div>
      <div class="bars">${s.dist.map((n, i) => `<div class="bar"><span>${names[i]}</span><i style="width:${Math.max(8, n / max * 100)}%">${n}</i></div>`).join('')}</div>
      <p class="sub">Archive: ${s.archive.played} rooms played · average ${s.archive.avg}. Archive plays don't count toward streaks.</p>
      ${S.me.signedIn ? '' : '<p class="sub">Stats live on this device. <button class="link" id="statsSignin">Sign in</button> to keep them everywhere.</p>'}`);
    const si = $('#statsSignin'); if (si) si.onclick = showAccount;
  } catch (e) { openModal(`<h2>Your stats</h2><div class="note bad">${esc(e.message)}</div>`); }
}

function showAccount() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const ret = encodeURIComponent(location.pathname + location.hash);
  if (S.me.signedIn) {
    openModal(`<h2>Account</h2><p>Signed in as <b>${esc(S.me.email)}</b>. Your stats follow you to any device.</p>
      <div class="row"><button class="btn alt" id="signout">Sign out</button></div>`);
    $('#signout').onclick = async () => { await api('auth/logout', {}).catch(() => {}); location.href = '/'; };
  } else {
    openModal(`<h2>Account</h2>
      <p>You're playing as a guest, so your scores live on this device. Sign in to keep your streak and stats on every device. Nobody ever sees your name or email.</p>
      <div class="row"><a class="btn" href="/api/auth/login?return=${ret}" style="display:inline-flex;align-items:center;text-decoration:none">Sign in with Google</a>
      ${local ? `<a class="btn alt sm" href="/api/auth/dev?return=${ret}" style="display:inline-flex;align-items:center;text-decoration:none">Dev sign-in</a>` : ''}</div>`);
  }
}

function showReport(r, guessId) {
  const g = r.play.guesses.find(x => x.id === guessId);
  if (!g) return;
  openModal(`<h2>Judge got it wrong?</h2>
    <p>You said “${esc(g.input)}”. The judge read it as <b>${esc(g.name)}</b> at about <b>${esc(val(r.puzzle, g.value))}</b>.</p>
    <p class="sub">The bear will look into it. If you're right, the value gets fixed, everyone's scores update, and you'll see a note next time you visit.</p>
    <label class="sub" for="rnote">What's wrong? (optional)</label>
    <textarea class="box" id="rnote" maxlength="500" placeholder="e.g. A grand piano is about 1,000 lb, not 100 lb."></textarea>
    <div class="row"><button class="btn" id="rsend">Send report</button><button class="btn alt" id="rcancel">Cancel</button></div>`);
  $('#rcancel').onclick = closeModal;
  $('#rsend').onclick = async () => {
    $('#rsend').disabled = true;
    try {
      await api('complaint', { guessId, note: $('#rnote').value });
      r.complaints = { ...(r.complaints || {}), [guessId]: 'open' };
      closeModal(); toast('Report sent. Thanks!'); render();
    } catch (e) { toast(e.message); $('#rsend').disabled = false; }
  };
}

function showNotifications(list) {
  openModal(`<h2>Mail from the bear 📬</h2>
    ${list.map(n => `<div class="note ${n.status === 'accepted' ? '' : 'warn'}" style="margin-bottom:10px">
      ${n.status === 'accepted' ? '✅ Your appeal was accepted!' : '📝 Your report was reviewed.'}
      <div class="sub">“${esc(n.input)}” is now judged as ${esc(n.name)} ≈ ${esc(fmt(n.property, n.value, n.unitLabel, S.units))}.${n.status === 'accepted' ? ' Scores were updated.' : ''}</div>
      ${n.note ? `<div class="sub">Note: ${esc(n.note)}</div>` : ''}</div>`).join('')}
    <div class="row"><button class="btn" id="nOk">Got it</button></div>`);
  $('#nOk').onclick = closeModal;
  api('notifications/seen', { ids: list.map(n => n.id) }).catch(() => {});
}

/* ═══════════ Archive ═══════════ */
async function renderArchiveList() {
  $('#main').innerHTML = loadingHTML('Flipping through the recipe book…');
  const d = await api('archive');
  const rows = d.days.map(day => {
    const cells = [1, 2, 3].map(sl => {
      const s = day.slots.find(x => x.slot === sl);
      const v = s ? (s.daily != null ? s.daily : s.archive) : null;
      return `<span class="${v == null ? '' : 'sq ' + tier(v)}" title="${roomOf(sl).name}">${v == null ? '·' : v}</span>`;
    }).join('');
    const dateStr = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `<a class="aday" href="#/archive/${day.date}"><span class="num">#${day.number}</span><span class="d">${esc(dateStr)}</span><span class="s">${cells}</span></a>`;
  }).join('');
  $('#main').innerHTML = `<section class="card"><h2 class="prompt" style="margin-top:0">Recipe book</h2>
    <p class="sub">Replay any past day. Archive scores are kept separately and don't affect streaks.</p>
    <div class="archive" style="margin-top:14px">${rows || '<p class="empty">No past days yet. Come back tomorrow!</p>'}</div>
    <div class="row"><a class="btn alt sm" href="#/" style="display:inline-flex;align-items:center;text-decoration:none">← Today</a></div></section>`;
}

/* ═══════════ Header tools ═══════════ */
function paintTools() {
  document.querySelectorAll('[data-icon]').forEach(el => { if (!el.innerHTML) el.innerHTML = icon(el.dataset.icon); });
  $('#logo').innerHTML = bear('smile', { px: 0 });
  $('#unitBtn').textContent = S.units === 'imperial' ? 'US' : 'Metric';
  $('#unlBtn').hidden = !S.me.isAdmin;
  $('#admBtn').hidden = !S.me.isAdmin;
  $('#acctBtn').classList.toggle('on', !!S.me.signedIn);
}
$('#helpBtn').onclick = showHelp;
$('#statsBtn').onclick = showStats;
$('#acctBtn').onclick = showAccount;
$('#unlBtn').onclick = () => { location.hash = '#/unlimited'; };
$('#unitBtn').onclick = () => {
  S.units = S.units === 'imperial' ? 'metric' : 'imperial'; store.set('jr.units', S.units);
  paintTools(); render(); pad.setUnits(S.units);
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
if (store.get('jr.padOpen', false) && window.innerWidth >= 1000) togglePad(true);
route();
