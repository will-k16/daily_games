// Lifeline: name someone who was alive for both events. Three pairs a day (easy, medium, hard), one guess
// each. Race the jerboa starts at the person's birth on the timeline and leaps to the day they died.
import { createLifelineScene, timeOfDay } from './lifeline-scene.js';
import { racePortrait, RACE_MOODS } from './race.js';
import { RACE_DEFAULT_LOOK } from './race-wardrobe.js';
import { openShop } from './shop.js';
import { crowdHTML, statsHTML } from './charts.js';
import { DAY_MAX, ROUND_MAX, band, bucksForRound, moodFor, lifelineShareText, eventSpan, yearOf, yearLabel, DAY_BONUS } from './lifeline-score.js';
import { bucksIcon } from './bucks.js';
import { showAccount as accountModal, signInReturn } from './account.js';
import { openModal, closeModal } from './modal.js';
import { api } from './net.js';

/* ═══════════ Basics ═══════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
};
const num = n => Number(n || 0).toLocaleString('en-US');
const TIERS = ['', 'Easy', 'Medium', 'Hard'];
const YEAR = 365.2425;

const S = {
  me: { signedIn: false, isAdmin: false, email: '', race: { ...RACE_DEFAULT_LOOK } }, bucks: null, today: null,
  ctx: null, idx: 0, view: 'round', scene: null, busy: false, showDates: store.get('wk.lifeDates', false), justPlayed: null
};

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3000); }
const look = () => S.me.race || RACE_DEFAULT_LOOK;
const raceName = () => esc(look().name || RACE_DEFAULT_LOOK.name);
const accountUI = () => ({ me: S.me, api, openModal, closeModal, toast });

function countUp(el, to, dur = 900) {
  if (!el) return;
  if (reduced()) { el.textContent = num(to); return; }
  const start = performance.now();
  const go = now => { const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = num(Math.round(to * e)); if (p < 1) requestAnimationFrame(go); };
  requestAnimationFrame(go);
}

/* ═══════════ Routing ═══════════ */
window.addEventListener('hashchange', route);
async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  closeModal();
  try {
    if (h === 'archive') return await renderArchiveList();
    if (h.startsWith('archive/')) return await loadArchiveDay(h.slice(8));
    if (h === 'unlimited') {
      if (!S.today) await loadMeta();
      if (S.me.isAdmin) return await loadUnlimited();
    }
    return await loadToday();
  } catch (e) { showError(e); }
}
function showError(e) {
  dropScene();
  $('#main').innerHTML = `<div class="card"><div class="note bad">${esc(e.message || e)}</div><div class="row"><button class="btn alt sm" id="retry">Try again</button></div></div>`;
  $('#retry').onclick = route;
}
const loadingHTML = msg => `<div class="loading"><div class="spin"></div>${esc(msg)}</div>`;

async function loadMeta() {
  const d = await api('lifeline/today');
  S.today = d; S.me = d.me; S.bucks = d.bucks; paintTools();
  return d;
}

async function loadToday() {
  dropScene(); $('#main').innerHTML = loadingHTML('Stretching Race\'s legs…');
  const d = await loadMeta();
  if (d.notYet) { renderSoon(d); signInReturn(accountUI()); return; }
  setCtx({ kind: 'daily', ...d });
  if (d.notifications && d.notifications.length) showNotifications(d.notifications);
  else if (!store.get('wk.lifeHelp', false)) { store.set('wk.lifeHelp', true); showHelp(); }
  signInReturn(accountUI());
}

async function loadArchiveDay(date) {
  dropScene(); $('#main').innerHTML = loadingHTML('Digging up an old day…');
  if (!S.today) await loadMeta();
  const d = await api('lifeline/archive/day?date=' + encodeURIComponent(date));
  setCtx({ kind: 'archive', ...d });
}

/** Unlimited (admins): one pair at a time, as many as you like. Pays no WK Bucks and never counts toward stats. */
async function loadUnlimited() {
  dropScene(); $('#main').innerHTML = loadingHTML('Finding Race a fresh stretch of history…');
  const d = await api('lifeline/unlimited/new', {});
  setCtx({ kind: 'unlimited', ...d });
}

function setCtx(d) {
  S.ctx = { kind: d.kind, date: d.date, number: d.number, mode: d.mode, rounds: d.rounds, summary: d.summary, total: d.total, done: d.done };
  const open = d.rounds.findIndex(r => !r.result);
  S.idx = open < 0 ? 0 : open;
  S.view = open < 0 && d.kind !== 'unlimited' ? 'summary' : 'round';
  render();
}

/* ═══════════ Opening soon ═══════════ */
function renderSoon(d) {
  paintHead();
  $('#main').innerHTML = `<section class="card soon">
      <div class="portrait"><canvas id="soonCv" width="56" height="52"></canvas></div>
      <h2 class="prompt">Life-Line opens soon</h2>
      <div class="clock cd" data-to="${esc(d.opensAt)}">--:--:--</div>
      <p class="sub" style="margin-top:0">${esc(new Date(d.opensAt).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }))}, your time</p>
      <ol class="rules">${rulesHTML()}</ol>
      <div class="row center"><button class="btn" id="soonShop">Dress up ${raceName()} first</button></div>
    </section>`;
  drawPortrait($('#soonCv'), {});
  $('#soonShop').onclick = showShop;
  tick();
}

/* ═══════════ Render ═══════════ */
const cur = () => S.ctx && S.ctx.rounds[S.idx];

function paintHead() {
  const c = S.ctx;
  $('#pnum').textContent = c ? (c.kind === 'unlimited' ? '∞ Unlimited' : `#${c.number}${c.kind === 'archive' ? ' · ' + niceDate(c.date) : ''}`) : '';
  $('#pips').innerHTML = c && c.kind !== 'unlimited' ? c.rounds.map((r, i) => {
    const s = r.result ? r.result.you.score : null;
    return `<button type="button" class="${s == null ? '' : 'sq-' + band(s)} ${i === S.idx && S.view === 'round' ? 'cur' : ''}" data-pip="${i}" title="Round ${i + 1}${s == null ? '' : ': ' + s}"></button>`;
  }).join('') : '';
  document.querySelectorAll('[data-pip]').forEach(b => b.onclick = () => { if (S.busy) return; S.idx = Number(b.dataset.pip); S.view = 'round'; render(); });
}
const niceDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function render() {
  const c = S.ctx; if (!c) return;
  paintHead();
  const done = c.rounds.every(r => r.result);
  const tabs = c.kind === 'unlimited' ? `<nav class="rtabs"><span class="rtab on">∞ Unlimited <b>${TIERS[c.rounds[0].puzzle.round]}</b></span></nav>` : `<nav class="rtabs">${c.rounds.map((r, i) => `<button type="button" class="rtab ${S.view === 'round' && i === S.idx ? 'on' : ''}" data-r="${i}">
      ${r.result ? `<span class="sqchip sq-${band(r.result.you.score)}"></span>` : ''}Round ${i + 1} <b>${TIERS[r.puzzle.round]}</b></button>`).join('')}
    ${done ? `<button type="button" class="rtab ${S.view === 'summary' ? 'on' : ''}" data-sum>Your day</button>` : ''}</nav>`;
  if (S.view === 'summary') {
    dropScene();
    $('#main').innerHTML = tabs + summaryHTML(c);
    wireTabs(); wireSummary(c);
    return;
  }
  const r = cur(), p = r.puzzle;
  $('#main').innerHTML = `${tabs}
    <div class="stage" id="stage"><div class="scene-host" id="sceneHost"></div></div>
    <div class="events">
      <div class="ev a"><div class="n">EVENT 1</div><div class="lbl">${esc(p.a.label)}</div><div class="when ${S.showDates ? '' : 'hide'}">${S.showDates ? esc(p.a.when) : 'Date hidden'}</div></div>
      <div class="evand">and</div>
      <div class="ev b"><div class="n">EVENT 2</div><div class="lbl">${esc(p.b.label)}</div><div class="when ${S.showDates ? '' : 'hide'}">${S.showDates ? esc(p.b.when) : 'Date hidden'}</div></div>
    </div>
    <div class="datesw"><label><input type="checkbox" id="dates" ${S.showDates ? 'checked' : ''}> Show the events' dates</label></div>
    <section class="qcard" id="panel"></section>`;
  wireTabs();
  $('#dates').onchange = e => { S.showDates = e.target.checked; store.set('wk.lifeDates', S.showDates); if (S.scene) S.scene.setShowDates(S.showDates);
    document.querySelectorAll('.ev .when').forEach((el, i) => { el.textContent = S.showDates ? (i ? p.b.when : p.a.when) : 'Date hidden'; el.classList.toggle('hide', !S.showDates); }); };
  ensureScene(r);
  if (r.result) {
    const animate = S.justPlayed === r.puzzle.id;
    S.justPlayed = null;
    showLife(r, animate);
  } else renderGuess(r);
}

function wireTabs() {
  document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if (S.busy) return; S.idx = Number(b.dataset.r); S.view = 'round'; render(); });
  const s = $('[data-sum]'); if (s) s.onclick = () => { if (S.busy) return; S.view = 'summary'; render(); };
}

/* ── the scene ── */
function spans(p) { return { a: { ...eventSpan(p.a), label: p.a.label }, b: { ...eventSpan(p.b), label: p.b.label } }; }
function ensureScene(r) {
  dropScene();
  S.scene = createLifelineScene($('#sceneHost'), look(), { tod: timeOfDay(), reduced: reduced() });
  const { a, b } = spans(r.puzzle);
  S.scene.setEvents(a, b, S.showDates);
}
function dropScene() { if (S.scene) { S.scene.destroy(); S.scene = null; } }
const lifeLabels = y => [yearLabel(yearOf(y.from)), y.living ? 'TODAY' : yearLabel(yearOf(y.to))];

/* ── one guess ── */
function renderGuess(r, msg = '', choices = null, typed = '') {
  const p = $('#panel'); if (!p) return;
  p.innerHTML = `<div class="kicker"><span>Round ${r.puzzle.round} · ${TIERS[r.puzzle.round]}</span><span class="badge">ONE GUESS</span></div>
    <p class="ask">Name someone who was alive for both.</p>
    <form class="guessrow" id="gform" autocomplete="off">
      <input class="pin" id="gin" maxlength="80" placeholder="A real person, like Marie Curie" value="${esc(typed)}" aria-label="A person's name" ${choices ? 'disabled' : ''}>
      <button class="btn" type="submit" id="gbtn" ${choices ? 'disabled' : ''}>Jump!</button>
    </form>
    <div class="msg" id="gmsg">${msg}</div>
    ${choices ? `<p class="sub" style="font-weight:800;color:var(--ink)">Which one did you mean?</p><div class="choices">${choices.map(ch => `<button type="button" class="choice" data-q="${esc(ch.qid)}"><b>${esc(ch.name)}</b><span>${esc(ch.descr || 'No description on Wikipedia')}</span></button>`).join('')}</div>
      <div class="row"><button class="link" type="button" id="gback">None of these: type again</button></div>` : '<p class="sub">Any real person with a Wikipedia page counts. Someone alive today counts up to today.</p>'}`;
  const inp = $('#gin');
  if (!choices) inp.focus();
  $('#gform').onsubmit = e => { e.preventDefault(); submit(r, { input: inp.value.trim() }); };
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => submit(r, { qid: b.dataset.q, input: typed }));
  const back = $('#gback'); if (back) back.onclick = () => renderGuess(r, '', null, typed);
}

async function submit(r, { input, qid }) {
  if (S.busy) return;
  if (!qid && !input) { $('#gmsg').innerHTML = '<div class="note warn">Type the name of a real person.</div>'; return; }
  S.busy = true;
  const btn = $('#gbtn'); if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Looking up…'; }
  document.querySelectorAll('[data-q]').forEach(b => { b.disabled = true; });
  try {
    const res = await api('lifeline/guess', { puzzleId: r.puzzle.id, mode: S.ctx.mode, input, qid });
    S.busy = false;
    if (res.status === 'choose') { renderGuess(r, '', res.choices, res.input); return; }
    if (res.status === 'invalid') { renderGuess(r, `<div class="note warn">${esc(res.reason)}</div>`, null, input); return; }
    if (res.bucks) { S.bucks = res.bucks; paintTools(); }
    const keep = S.idx;
    Object.assign(S.ctx, { rounds: res.rounds, summary: res.summary, total: res.total, done: res.done });
    S.idx = keep;
    S.justPlayed = r.puzzle.id;
    render();
  } catch (e) {
    S.busy = false;
    renderGuess(r, `<div class="note bad">${esc(e.message)}</div>`, null, input);
  }
}

/* ── the jump and the result ── */
function showLife(r, animate) {
  const y = r.result.you;
  const panel = $('#panel');
  if (y.from == null) { panel.innerHTML = resultHTML(r); wireResult(r); return; }
  const life = { from: y.from, to: y.to, living: y.living, labels: lifeLabels(y) };
  const mood = y.kind === 'both' ? 'happy' : y.score >= 500 ? 'smile' : y.score > 0 ? 'wow' : 'sad';
  if (animate && !reduced()) {
    S.busy = true;
    panel.innerHTML = `<div class="kicker"><span>Round ${r.puzzle.round} · ${TIERS[r.puzzle.round]}</span></div><p class="ask">${raceName()} is jumping ${esc(y.name)}'s life…</p>`;
    S.scene.play(life, { animate: true, mood, onDone: () => { S.busy = false; panel.innerHTML = resultHTML(r); wireResult(r, true); } });
  } else {
    S.scene.play(life, { animate: false });
    panel.innerHTML = resultHTML(r); wireResult(r);
  }
}

/** One sentence on why it scored what it did. */
function whyText(r) {
  const y = r.result.you, A = eventSpan(r.puzzle.a), B = eventSpan(r.puzzle.b);
  const pct = Math.round((y.cover || 0) * 100), yrs = d => { const n = Math.max(1, Math.round(d / YEAR)); return `${n} ${n === 1 ? 'year' : 'years'}`; };
  if (y.kind === 'both') return `Alive for both events. Full marks!`;
  if (y.kind === 'one' && y.aliveA) return `Alive for event 1, but ${y.living ? '' : 'died '}${yrs(B.lo - y.to)} before event 2 (${pct}% of the way there).`;
  if (y.kind === 'one') return `Alive for event 2, but born ${yrs(y.from - A.hi)} after event 1 (${pct}% of the gap lived).`;
  if (y.kind === 'between') return `Alive for neither, but lived between them: ${pct}% of the gap.`;
  const before = y.to < A.lo;
  return `Lived ${before ? `${yrs(A.lo - y.to)} before event 1` : `${yrs(y.from - B.hi)} after event 2`}.${y.score ? ' Close enough for a few points.' : ' Too far away for points.'}`;
}

function resultHTML(r) {
  const res = r.result, y = res.you, c = S.ctx;
  const bucks = bucksForRound(y.score, c.mode);
  const nextIdx = c.rounds.findIndex((x, i) => i !== S.idx && !x.result);
  const tick = (ok, label) => `<div class="${ok ? 'yes' : 'no'}"><i>${ok ? '✓' : '✗'}</i>${esc(label)}</div>`;
  return `<div class="kicker"><span>Round ${r.puzzle.round} · ${TIERS[r.puzzle.round]}</span><span class="sqchip sq-${band(y.score)}" title="${band(y.score)}"></span></div>
    <div class="scoreline"><span class="big" id="bigScore">${num(y.score)}</span><small>/ ${num(ROUND_MAX)}</small>
      ${bucks ? `<span class="bucksline">+<b>${bucks}</b> ${bucksIcon()}</span>` : ''}</div>
    <p class="who">${esc(y.name)}${y.descr ? `<small>${esc(y.descr)}</small>` : ''}</p>
    ${y.born ? `<p class="lifedates">Born ${esc(y.born)} · ${y.living ? 'alive today' : 'died ' + esc(y.died)}</p>` : ''}
    <div class="alive">${tick(y.aliveA, r.puzzle.a.label)}${tick(y.aliveB, r.puzzle.b.label)}</div>
    ${y.kind ? `<p class="why">${esc(whyText(r))}</p>` : ''}
    ${res.examples.length ? `<div class="h4">${y.kind === 'both' ? 'Others alive for both' : 'Alive for both'}</div>
      <ul class="plist">${res.examples.map(e => `<li><b>${esc(e.name)}</b><small>${e.born ? `${esc(e.born)} – ${e.died ? esc(e.died) : 'today'}` : ''}${e.descr ? ` · ${esc(e.descr)}` : ''}</small></li>`).join('')}</ul>` : ''}
    ${res.players > 1 ? `<div class="h4">What people named</div>
      <ul class="plist">${res.picks.map(p => `<li class="${p.mine ? 'mine' : ''}"><b>${esc(p.name)}${p.mine ? ' (you)' : ''}</b><span class="n"><span class="sqchip sq-${band(p.score)}"></span>${p.n}</span></li>`).join('')}</ul>` : ''}
    ${res.everyone ? crowdHTML(res.everyone, { max: ROUND_MAX, daily: c.kind === 'daily' }) : ''}
    <div class="reveal-foot">
      ${res.report ? `<span class="sub" style="margin:0">Dates reported</span>` : '<button class="link" id="report" type="button">Dates look wrong?</button>'}
      ${c.kind === 'unlimited' ? '<button class="btn" id="unlNext">Next pair →</button>' : nextIdx >= 0 ? `<button class="btn" id="next">Round ${nextIdx + 1} →</button>` : `<button class="btn" id="toSum">See your day →</button>`}
    </div>`;
}

function wireResult(r, fresh = false) {
  if (fresh) countUp($('#bigScore'), r.result.you.score);
  const c = S.ctx;
  const un = $('#unlNext'); if (un) un.onclick = () => { loadUnlimited().catch(showError); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const next = $('#next'); if (next) next.onclick = () => { S.idx = c.rounds.findIndex((x, i) => i !== S.idx && !x.result); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const sum = $('#toSum'); if (sum) sum.onclick = () => { S.view = 'summary'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const rep = $('#report'); if (rep) rep.onclick = () => showReport(r);
}

/* ═══════════ Summary ═══════════ */
function summaryHTML(c) {
  const total = c.rounds.reduce((t, r) => t + (r.result ? r.result.you.score : 0), 0);
  const m = moodFor(total);
  const bucks = c.rounds.reduce((t, r) => t + bucksForRound(r.result ? r.result.you.score : 0, c.mode), 0) + (c.mode === 'daily' ? DAY_BONUS : 0);
  return `<section class="card summary">
      <div class="portrait" style="margin:0 auto"><canvas id="sumCv" width="56" height="52"></canvas></div>
      <div class="kicker" style="justify-content:center;margin-top:10px"><span>Life-Line #${c.number}${c.kind === 'archive' ? ' · ' + niceDate(c.date) : ''}</span></div>
      <div class="total"><span id="dayTotal">${num(total)}</span> <small>/ ${num(DAY_MAX)}</small></div>
      <p class="moodline">“${esc(RACE_MOODS[m])}”</p>
      ${bucks ? `<p class="bucksline" style="justify-content:center;display:flex">+<b>${bucks}</b> ${bucksIcon()} WK Bucks${c.mode === 'daily' ? ` (with ${DAY_BONUS} for finishing)` : ''}</p>` : ''}
      <ul class="recap">${c.rounds.map((r, i) => {
        const y = r.result.you;
        return `<li><span class="qs">${esc(y.name)}</span><span class="nums">${esc(r.puzzle.a.label)} → ${esc(r.puzzle.b.label)}</span>
          <span class="sc"><span class="sqchip sq-${band(y.score)}"></span>${num(y.score)}</span></li>`;
      }).join('')}</ul>
      <div class="row center"><button class="btn" id="share">Share</button><button class="btn alt" id="shopBtn2">${raceName()}'s shop</button><button class="btn alt" id="statsBtn2">Stats</button></div>
      ${c.summary && c.summary.everyone ? crowdHTML(c.summary.everyone, { max: DAY_MAX, daily: c.kind === 'daily', finished: 'finished' }) : ''}
      ${c.kind === 'daily' ? `<p class="countdown">New events in <b class="cd">--:--:--</b></p>` : '<div class="row center"><a class="btn alt sm" href="#/">← Today</a></div>'}
      ${S.today && S.today.tipUrl ? `<a class="tip" href="${esc(S.today.tipUrl)}" target="_blank" rel="noopener">☕ Buy me a coffee</a>` : ''}
    </section>`;
}
function wireSummary(c) {
  drawPortrait($('#sumCv'), { mood: 'happy' });
  $('#share').onclick = () => doShare(c);
  $('#shopBtn2').onclick = showShop;
  $('#statsBtn2').onclick = showStats;
  tick();
}

function shareText(c) {
  return lifelineShareText({ number: c.number, rounds: c.rounds.map(r => ({ round: r.puzzle.round, score: r.result ? r.result.you.score : null })), archive: c.kind === 'archive' && c.mode !== 'daily' }, location.host + '/lifeline');
}
async function doShare(c) {
  const text = shareText(c);
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch { /* copy instead */ } }
  try { await navigator.clipboard.writeText(text); toast('Copied to your clipboard.'); }
  catch { openModal(`<h2>Share</h2><textarea class="box" readonly style="min-height:110px">${esc(text)}</textarea>`); const ta = $('#modalBody textarea'); ta.focus(); ta.select(); }
}

/* ── countdowns: to tomorrow's events, or to launch ── */
function tick() {
  document.querySelectorAll('.cd').forEach(el => {
    const to = el.dataset.to ? new Date(el.dataset.to).getTime() : (S.today && S.today.nextReset ? new Date(S.today.nextReset).getTime() : 0);
    const ms = to - Date.now(), s = Math.max(0, Math.floor(ms / 1000));
    el.textContent = ms <= 0 ? 'now!' : [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
    if (ms <= 0 && el.dataset.to && !el.dataset.reloaded) { el.dataset.reloaded = '1'; setTimeout(route, 1500); }
  });
}
setInterval(tick, 1000);

/* ═══════════ Race ═══════════ */
let portraitTimer = 0;
function drawPortrait(cv, opts) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let n = 0;
  const draw = () => { ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(racePortrait(look(), { ...opts, blink: n % 14 === 0, ear: n % 9 === 0 ? 1 : 0 }), 0, 0); };
  draw();
  clearInterval(portraitTimer);
  portraitTimer = setInterval(() => { if (!cv.isConnected) { clearInterval(portraitTimer); return; } n++; draw(); }, 220);
}

function showShop() {
  openShop('race', { api, toast, onChange: data => {
    S.bucks = data.bucks; S.me.race = data.look; paintTools();
    if (S.scene) S.scene.setLook(look());
  } });
}

const rulesHTML = () => `
  <li>Each day has three pairs of real events: easy, medium and hard.</li>
  <li>Name one real person who was alive for <b>both</b>. You get one guess per pair.</li>
  <li>Alive for both: <b>1,000</b>. Alive for one: <b>500–750</b>, more the closer they lived to the other.</li>
  <li>Alive for neither: up to <b>250</b> if they lived between the two, a little if they came close.</li>
  <li>${raceName()} jumps their life on the timeline, from birth to death. Dates come from Wikipedia (Wikidata).</li>`;

function showHelp() {
  openModal(`<h2>How to play</h2>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start">
      <div class="portrait sm"><canvas id="helpCv" width="56" height="52"></canvas></div>
      <p style="margin:0">Meet <b>${raceName()}</b>, a long-eared jerboa. Jerboas hop on their long back legs, and their ears are a third of their body length!</p>
    </div>
    <ol class="rules">${rulesHTML()}</ol>
    <p class="sub">The events' dates are hidden at first. Turn on “Show the events' dates” any time: there's no penalty.</p>
    <div class="row"><button class="btn" id="hOk">Let's jump</button></div>`);
  drawPortrait($('#helpCv'), {});
  $('#hOk').onclick = closeModal;
}

/* ═══════════ Stats, report, notes ═══════════ */
async function showStats() {
  openModal('<h2>Your stats</h2><div class="shimmer">Measuring the jumps…</div>');
  try {
    const s = await api('lifeline/stats');
    openModal(`<h2>Your stats</h2>
      ${statsHTML(s, { max: DAY_MAX, extra: s.rounds ? `<ul class="statlines"><li>Alive for both in <b>${s.perfect}</b> of ${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}.</li></ul>` : '' })}
      ${S.me.signedIn ? '' : '<p class="sub">These are only saved on this device. <button class="link" id="statsSignin">Sign in</button> to take them with you.</p>'}`);
    const si = $('#statsSignin'); if (si) si.onclick = () => accountModal(accountUI());
  } catch (e) { openModal(`<h2>Your stats</h2><div class="note bad">${esc(e.message)}</div>`); }
}

function showReport(r) {
  const y = r.result.you;
  openModal(`<h2>Dates look wrong?</h2>
    <p>We have <b>${esc(y.name)}</b> as ${y.born ? `born ${esc(y.born)}, ${y.living ? 'alive today' : 'died ' + esc(y.died)}` : 'having no dates'}. If that's wrong (or it's the wrong person), tell us and we'll fix it and rescore.</p>
    <form id="rform"><textarea class="box" id="rnote" maxlength="300" placeholder="What's wrong? (a source helps)"></textarea>
    <div class="msg" id="rmsg"></div>
    <div class="row"><button class="btn" type="submit" id="rsend">Send</button><button class="btn alt" type="button" id="rcancel">Cancel</button></div></form>`);
  $('#rcancel').onclick = closeModal;
  $('#rform').onsubmit = async e => {
    e.preventDefault();
    $('#rsend').disabled = true;
    try {
      await api('lifeline/report', { playId: r.result.playId, note: $('#rnote').value.trim() });
      r.result.report = 'open'; closeModal(); toast('Thanks! We\'ll take a look.');
      const rp = $('#report'); if (rp) rp.outerHTML = '<span class="sub" style="margin:0">Dates reported</span>';
    } catch (err) { $('#rmsg').innerHTML = `<div class="note bad">${esc(err.message)}</div>`; $('#rsend').disabled = false; }
  };
}

function showNotifications(list) {
  const line = n => n.status === 'fixed' ? `Thanks! We fixed ${esc(n.name)}'s dates. Your score was updated.` : `We checked ${esc(n.name)}'s dates and they stand.`;
  openModal(`<h2>Notes from the dig site</h2>${list.map(n => `<div class="note ${n.status === 'fixed' ? 'good' : ''}" style="margin-bottom:8px">${line(n)}${n.admin_note ? `<br><span class="sub">${esc(n.admin_note)}</span>` : ''}</div>`).join('')}
    <div class="row"><button class="btn" id="nOk">Got it</button></div>`);
  $('#nOk').onclick = closeModal;
  api('lifeline/notifications/seen', { ids: list.map(n => n.id) }).catch(() => {});
}

/* ═══════════ Archive ═══════════ */
async function renderArchiveList() {
  dropScene(); S.ctx = null; paintHead();
  $('#main').innerHTML = loadingHTML('Digging up old days…');
  if (!S.today) await loadMeta();
  if (S.today.notYet) { renderSoon(S.today); return; }
  const d = await api('lifeline/archive');
  const rows = d.days.map(day => {
    const play = day.daily && day.daily.done ? day.daily : day.archive;
    const cells = [0, 1, 2].map(i => { const v = play ? play.rounds[i] : null; return `<span class="${v == null ? '' : 'sq sq-' + band(v)}" title="Round ${i + 1}">${v == null ? '·' : v}</span>`; }).join('');
    return `<a class="aday" href="#/archive/${day.date}"><span class="num">#${day.number}</span><span class="d">${esc(niceDate(day.date))}</span><span class="s">${cells}</span></a>`;
  }).join('');
  $('#main').innerHTML = `<section class="card"><h2 class="prompt">Past days</h2>
    <p class="sub">Replays don't count toward your streak, and pay half the WK Bucks.</p>
    <div class="archive">${rows || '<p class="empty">No past days yet. Come back tomorrow!</p>'}</div>
    <div class="row"><a class="btn alt sm" href="#/">← Today</a></div></section>`;
}

/* ═══════════ Header tools ═══════════ */
function paintTools() {
  $('#admBtn').hidden = !S.me.isAdmin;
  $('#unlBtn').hidden = !S.me.isAdmin;
  $('#acctBtn').classList.toggle('on', !!S.me.signedIn);
  $('#bucksIco').innerHTML = bucksIcon();
  $('#bucksNum').textContent = S.bucks ? S.bucks.balance : '';
}
$('#statsBtn').onclick = showStats;
$('#helpBtn').onclick = showHelp;
$('#acctBtn').onclick = () => accountModal(accountUI());
$('#shopBtn').onclick = showShop;
$('#unlBtn').onclick = () => { if (location.hash === '#/unlimited') loadUnlimited().catch(showError); else location.hash = '#/unlimited'; };

paintTools();
route();
