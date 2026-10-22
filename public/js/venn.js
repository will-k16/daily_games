// Venn: name everything that fits both circles (then all three) in 90 seconds. Mel the chameleon
// catches every answer that fits. The server keeps the clock; this file mirrors it between replies.
import { createVennScene, COLORS } from './venn-scene.js';
import { melPortrait, moodFor, MEL_MOODS, FLASH } from './mel.js';
import { MEL_DEFAULT_LOOK } from './mel-wardrobe.js';
import { openShop } from './shop.js';
import { ROUND_MS, MAX_ANSWER, DAY_MAX, ROUND_MAX, bucksForRound, vennShareText, scoreSquare, tierOf } from './venn-score.js';
import { crowdHTML, statsHTML } from './charts.js';
import { bucksIcon } from './bucks.js';
import { showAccount as accountModal, signInReturn } from './account.js';
import { openModal, closeModal } from './modal.js';

/* ═══════════ Basics ═══════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEYS = ['A', 'B', 'C'];
const KEY_CLASS = { A: 'a', B: 'b', C: 'c' };

const S = {
  me: { signedIn: false, isAdmin: false, email: '', mel: { ...MEL_DEFAULT_LOOK } }, bucks: null, today: null,
  ctx: null, idx: 0, view: 'round', scene: null, sceneKey: null,
  clock: null, chips: [], pending: null, paused: false, leaving: false,
  // Answers being judged right now (several at once, including ones held back while a "did you mean"
  // has the clock stopped), and any further "did you mean"s waiting their turn.
  checking: [], inflight: new Set(), dymQueue: []
};
const MAX_PARALLEL = 4;

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch('/api/' + path, { credentials: 'same-origin', ...opt });
  const data = await res.json().catch(() => ({ error: 'Lost the connection there. Try again?' }));
  if (!res.ok || data.error) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3000);
}
const look = () => S.me.mel || MEL_DEFAULT_LOOK;
const mel = () => esc(look().name || 'Mel');
const accountUI = () => ({ me: S.me, api, openModal, closeModal, toast });
const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const cur = () => S.ctx && S.ctx.rounds[S.idx];
const roundName = n => (n === 2 ? 'Round 2' : 'Round 1');

function countUp(el, to, dur = 1000) {
  if (!el) return;
  if (reduced()) { el.textContent = to; return; }
  const start = performance.now();
  const go = now => { const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(go); };
  requestAnimationFrame(go);
}

/* ═══════════ Routing ═══════════ */
window.addEventListener('hashchange', route);
async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  closeModal();
  try {
    if (h === 'archive') return renderArchiveList();
    if (h.startsWith('archive/')) return loadArchiveDay(h.slice(8));
    if (h === 'unlimited') {
      if (!S.today) await loadMeta();
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
const loadingHTML = msg => `<div class="loading"><div class="spin-ring"></div>${esc(msg)}</div>`;

async function loadMeta() {
  const d = await api('venn/today');
  S.today = d; S.me = d.me; S.bucks = d.bucks; paintTools();
  return d;
}
async function loadToday() {
  dropScene(); $('#main').innerHTML = loadingHTML('Hanging the vines…');
  const d = await loadMeta();
  setCtx({ kind: 'daily', date: d.date, number: d.number, rounds: d.rounds, day: d.day });
  if (d.notifications && d.notifications.length) showNotifications(d.notifications);
  else if (!store.get('wk.vennHelp', false)) { store.set('wk.vennHelp', true); showHelp(); }
  signInReturn(accountUI());
}
async function loadArchiveDay(date) {
  dropScene(); $('#main').innerHTML = loadingHTML('Untangling an old vine…');
  if (!S.today) await loadMeta();
  const d = await api('venn/archive/day?date=' + encodeURIComponent(date));
  setCtx({ kind: 'archive', date: d.date, number: d.number, rounds: d.rounds, day: d.day });
}
async function loadUnlimited(fresh) {
  dropScene(); $('#main').innerHTML = loadingHTML('Weaving fresh rings…');
  if (fresh || !S.unl) S.unl = await api('venn/unlimited/new', {});
  setCtx({ kind: 'unlimited', rounds: [S.unl], day: null });
}

function setCtx(ctx) {
  S.ctx = ctx;
  const open = ctx.rounds.findIndex(r => r.play.state !== 'done');
  S.idx = open < 0 ? ctx.rounds.length - 1 : open;
  S.view = ctx.kind !== 'unlimited' && ctx.rounds.length && ctx.rounds.every(r => r.play.state === 'done') ? 'summary' : 'round';
  $('#main').innerHTML = `
    <div class="dayhead" id="dayhead"></div>
    <section class="play" id="play">
      <div class="stage" id="stage">
        <div class="scene-host" id="sceneHost"></div>
        <div class="tags" id="tags"></div>
        <div class="labels" id="labels"></div>
        <div class="pausecover" id="pausecover" hidden></div>
      </div>
      <aside class="panel" id="panel"></aside>
    </section>`;
  render();
}

/* ═══════════ Render ═══════════ */
function render() {
  const c = S.ctx; if (!c || !$('#panel')) return;
  renderHead(c);
  if (S.view === 'summary') {
    stopClock(); dropScene();
    $('#play').classList.add('summary-mode');
    $('#stage').hidden = true;
    $('#panel').innerHTML = summaryHTML(c); wireSummary(c);
    return;
  }
  $('#play').classList.remove('summary-mode');
  $('#stage').hidden = false;
  const r = cur();
  ensureScene(r);
  const st = r.play.state;
  if (st === 'done') renderResults(r);
  else if (st === 'running') renderPlaying(r);
  else if (st === 'paused') renderPaused(r);
  else renderReady(r);
}

function renderHead(c) {
  const el = $('#dayhead');
  if (c.kind === 'unlimited') {
    el.innerHTML = `<div><div class="daylabel"><span class="badge">Admin</span> <b>Unlimited</b> · testing only</div></div>
      <button class="btn sm alt" id="newUnl">New puzzle →</button>`;
    $('#newUnl').onclick = () => loadUnlimited(true);
    return;
  }
  const total = c.rounds.reduce((s, r) => s + (r.play.state === 'done' ? r.play.score || 0 : 0), 0);
  const allDone = c.rounds.every(r => r.play.state === 'done');
  const dateStr = new Date(c.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const tabs = c.rounds.map((r, i) => {
    const done = r.play.state === 'done';
    const locked = i > 0 && c.rounds[i - 1].play.state !== 'done';
    return `<button class="tab ${i === S.idx && S.view !== 'summary' ? 'on' : ''}" data-r="${i}" ${locked ? 'disabled' : ''}>
      <span class="dots">${r.puzzle.round === 2 ? '<i class="a"></i><i class="b"></i><i class="c"></i>' : '<i class="a"></i><i class="b"></i>'}</span>${roundName(r.puzzle.round)}<span class="sc">${done ? r.play.score : locked ? '🔒' : '·'}</span></button>`;
  }).join('') + (allDone ? `<button class="tab ${S.view === 'summary' ? 'on' : ''}" data-sum="1">Your day</button>` : '');
  el.innerHTML = `<div><div class="daylabel">${c.kind === 'archive' ? '<span class="badge">Archive</span> ' : ''}Venn <b>#${c.number}</b> · ${esc(dateStr)}</div><div class="tabs">${tabs}</div></div>
    <div class="daytotal"><b>${total}</b><span>/ ${DAY_MAX}</span></div>`;
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if (isLive()) return; S.idx = Number(b.dataset.r); S.view = 'round'; render(); });
  const sb = el.querySelector('[data-sum]'); if (sb) sb.onclick = () => { if (isLive()) return; S.view = 'summary'; render(); };
}
const isLive = () => { const r = cur(); return S.view === 'round' && r && (r.play.state === 'running' || S.pending); };

/* ═══════════ Scene, tags and labels ═══════════ */
function dropScene() { if (S.scene) { S.scene.destroy(); S.scene = null; S.sceneKey = null; } S.chips = []; }

function ensureScene(r) {
  const key = r.puzzle.id + '|' + r.mode;
  if (S.scene && S.sceneKey === key) return;
  dropScene();
  S.scene = createVennScene($('#sceneHost'), { round: r.puzzle.round, look: look(), onMelClick: () => showMel(cur()) });
  S.sceneKey = key;
  S.scene.onLayout = () => { placeTags(); placeChips(); };
  placeTags(); placeChips();
  // Mel's eyes follow the pointer anywhere on the page.
  document.onpointermove = e => S.scene && S.scene.lookAt(e.clientX, e.clientY);
}

/** The circle phrases, as tags on each vine ring. Hidden until Start and while paused. */
function placeTags() {
  const r = cur(), box = $('#tags');
  if (!box || !S.scene || !r) return;
  const circles = r.puzzle.circles;
  const hide = !circles || S.paused || !!S.pending;
  box.innerHTML = S.scene.anchors().map((a, i) => `<div class="tag ${KEY_CLASS[a.key]} ${a.align} ${hide ? 'hidden' : ''}" style="left:${a.x}%;top:${a.y}%">
      <i class="sw"></i><span>${hide ? (circles ? 'Paused' : '? ? ?') : esc(circles[i])}</span></div>`).join('');
  // Keep every tag fully inside the scene.
  const sr = box.getBoundingClientRect();
  box.querySelectorAll('.tag').forEach(t => {
    const r = t.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (r.right > sr.right - 4) dx = sr.right - 4 - r.right;
    if (r.left + dx < sr.left + 4) dx = sr.left + 4 - r.left;
    if (r.top < sr.top + 4) dy = sr.top + 4 - r.top;
    if (r.bottom + dy > sr.bottom - 4) dy = sr.bottom - 4 - r.bottom;
    if (dx || dy) t.style.translate = `${dx}px ${dy}px`;
  });
}

function regionKey(fits) { return fits.map((f, i) => (f ? KEYS[i] : '')).join(''); }

/** Answer labels on the diagram: ✓ in the overlap (or center), "Close!" in their two-ring region. */
function placeChips() {
  const box = $('#labels');
  if (!box || !S.scene) return;
  const used = {};
  S.chips.forEach(ch => {
    if (!ch.el.isConnected) box.appendChild(ch.el);
    if (!ch.region) return;
    const slots = S.scene.slots(ch.region), n = used[ch.region] = (used[ch.region] || 0) + 1;
    const s = slots.length ? slots[(n - 1) % slots.length] : { x: 50, y: 50 };
    const jitter = slots.length && n > slots.length ? 2 * Math.floor((n - 1) / slots.length) : 0;
    ch.el.style.left = (s.x + jitter) + '%'; ch.el.style.top = (s.y + jitter) + '%';
  });
}

function addChip(text, region, cls, { pop = true } = {}) {
  const el = document.createElement('span');
  el.className = 'chip ' + cls + (pop ? ' pop' : '');
  el.textContent = text;
  $('#labels').appendChild(el);
  const ch = { el, region, text };
  S.chips.push(ch);
  placeChips();
  return ch;
}

function clearChips() { S.chips = []; const b = $('#labels'); if (b) b.innerHTML = ''; }

/** Draws every answer of a round onto the diagram (used on enter and for results). */
function chipsFor(r) {
  clearChips();
  const size = r.puzzle.size;
  r.play.answers.forEach(a => {
    if (a.verdict === 'ok') addChip(a.canonical, size === 3 ? 'ABC' : 'AB', 'ok', { pop: false });
    else if (a.verdict === 'close') addChip(a.canonical, regionKey(a.fits), 'close', { pop: false });
  });
}

/* ═══════════ Ready ═══════════ */
function renderReady(r) {
  stopClock(); S.paused = false; S.pending = null; resetChecking();
  clearChips(); placeTags();
  $('#pausecover').hidden = true;
  S.scene.setMood('smile');
  const n = r.puzzle.size;
  $('#panel').innerHTML = `<div class="ready">
      <div class="kicker">${roundName(r.puzzle.round)}${S.ctx.kind === 'archive' ? ' · archive' : ''}</div>
      <h2 class="big">${n === 3 ? 'Three circles' : 'Two circles'}</h2>
      <p class="lead">Name things that fit ${n === 3 ? 'all three' : 'both'}. 90 seconds.</p>
      <div class="parbox"><span>Par</span><b>${r.puzzle.par}</b></div>
      <button class="btn go" id="startBtn">Start</button>
      ${r.puzzle.round === 2 ? '<p class="sub">Only the very center counts. Fitting two of three is close, but no catch.</p>' : ''}
    </div>`;
  $('#startBtn').onclick = () => startRound(r);
}

async function startRound(r) {
  const b = $('#startBtn'); b.disabled = true; b.classList.add('busy');
  try {
    const res = await api('venn/start', { puzzleId: r.puzzle.id, mode: r.mode });
    Object.assign(r, res);
    render();
  } catch (e) { toast(e.message); b.disabled = false; b.classList.remove('busy'); }
}

/* ═══════════ Playing ═══════════ */
function renderPlaying(r) {
  S.paused = false;
  $('#pausecover').hidden = true;
  $('#stage').classList.remove('paused');
  chipsFor(r); placeTags();
  $('#panel').innerHTML = `<div class="playing">
      <div class="hud">
        <div class="clock" id="clock"><b id="clockNum">${fmtClock(ROUND_MS - r.play.elapsed)}</b><i id="clockBar"></i></div>
        <div class="stat"><span>Found</span><b id="foundNum">${r.play.count}</b></div>
        <div class="stat"><span>Par</span><b>${r.puzzle.par}</b></div>
      </div>
      <form class="answer" id="answerForm" autocomplete="off">
        <input id="ans" name="a" maxlength="${MAX_ANSWER}" placeholder="Type a thing, press Enter" aria-label="Your answer" enterkeyhint="send" autocapitalize="off" spellcheck="false">
        <button class="btn" type="submit">Go</button>
      </form>
      <div class="dym" id="dym" hidden></div>
      <div class="checking" id="checking" hidden><span class="ck-h">Checking…</span><ul id="checkList"></ul></div>
      <ul class="feed" id="feed">${r.play.answers.slice().reverse().map(feedItem).join('')}</ul>
      <button class="btn alt sm done" id="doneBtn">I'm done</button>
    </div>`;
  const f = $('#answerForm'), input = $('#ans');
  f.onsubmit = e => { e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = ''; submit(r, v); };
  input.addEventListener('input', trackCaret); input.addEventListener('keyup', trackCaret); input.addEventListener('click', trackCaret);
  input.focus({ preventScroll: window.innerWidth < 760 });
  $('#doneBtn').onclick = () => finishRound(r, true);
  drawChecking();
  if (r.play.pending) showDidYouMean(r, r.play.pending.id, r.play.pending.suggestion, r.play.pending.input);
  startClock(r);
  if (!S.pending) sendHeld(r);
}

/** Mel's eyes follow the typing caret. */
function trackCaret() {
  const input = $('#ans'); if (!input || !S.scene) return;
  const rect = input.getBoundingClientRect();
  const w = Math.min(rect.width - 20, (input.selectionStart || input.value.length) * 9);
  S.scene.lookAt(rect.left + 14 + w, rect.top + rect.height / 2);
}

const VERDICT = {
  ok: ['✓', 'ok'], no: ['✗', 'no'], dup: ['=', 'dup'], close: ['≈', 'close'], pending: ['?', 'wait']
};
function feedItem(a) {
  const [icon, cls] = VERDICT[a.verdict] || VERDICT.no;
  const text = a.verdict === 'ok' || a.verdict === 'close' ? a.canonical || a.input : a.input;
  const why = a.verdict === 'dup' ? 'Already have it' : a.verdict === 'close' ? 'Close! Fits 2 of 3' : a.verdict === 'no' ? a.reason : '';
  return `<li class="${cls}"><i>${icon}</i><span>${esc(text)}${why ? `<small>${esc(why)}</small>` : ''}</span></li>`;
}
function pushFeed(a) {
  const feed = $('#feed'); if (!feed) return;
  feed.insertAdjacentHTML('afterbegin', feedItem(a));
  while (feed.children.length > 40) feed.lastElementChild.remove();
}

/* ── Answers: judged several at a time, each listed under "Checking…" until its verdict comes back ── */
const normText = t => t.toLowerCase().replace(/\s+/g, ' ').trim();

function submit(r, text) {
  if (S.paused || S.pending) return;
  const norm = normText(text);
  const same = S.checking.find(c => c.norm === norm);
  if (same) { nudge(same); return; }          // already on its way: it gets one verdict
  S.checking.push({ r, text, norm, held: false, sent: false });
  drawChecking();
  pump();
}

/** Starts as many waiting answers as the parallel limit allows. */
function pump() {
  if (S.pending || S.paused) return;
  for (const c of S.checking) {
    if (S.inflight.size >= MAX_PARALLEL) break;
    if (c.sent || c.held) continue;
    c.sent = true;
    const job = sendAnswer(c.r, c).catch(() => {}).finally(() => { S.inflight.delete(job); pump(); });
    S.inflight.add(job);
  }
}

function dropChecking(c) { S.checking = S.checking.filter(x => x !== c); drawChecking(); }
function resetChecking() { S.checking = []; S.dymQueue = []; }
function drawChecking() {
  const box = $('#checking'), list = $('#checkList'); if (!box || !list) return;
  box.hidden = !S.checking.length;
  list.innerHTML = S.checking.map((c, i) => `<li class="${c.held ? 'held' : ''}" data-ck="${i}"><i aria-hidden="true"></i><span>${esc(c.text)}${c.held ? '<small>after the question above</small>' : ''}</span></li>`).join('');
}
function nudge(c) {
  const li = $(`#checkList [data-ck="${S.checking.indexOf(c)}"]`);
  if (li) { li.classList.remove('nudge'); void li.offsetWidth; li.classList.add('nudge'); }
}

/** Sends the answers that were held back while a "did you mean" had the clock stopped. */
function sendHeld(r) {
  if (r.play.state !== 'running' || S.pending) return;
  S.checking.forEach(c => { if (c.held) { c.held = false; c.sent = false; } });
  drawChecking();
  pump();
}

async function sendAnswer(r, c) {
  if (r.play.state !== 'running') { dropChecking(c); return; }
  let res;
  try { res = await api('venn/answer', { puzzleId: r.puzzle.id, mode: r.mode, input: c.text }); }
  catch (e) {
    // The clock stopped (a "did you mean" opened) while this was on its way: it goes again afterwards.
    if (e.status === 409 && /paused/i.test(e.message) && S.view === 'round' && r.play.state !== 'done') { c.held = true; c.sent = false; drawChecking(); return; }
    dropChecking(c);
    toast(e.message); if (/paused/i.test(e.message)) resumeRound(r);
    return;
  }
  dropChecking(c);
  if (res.verdict === 'closed') { if (r.play.state !== 'done') { Object.assign(r, { puzzle: res.puzzle, play: res.play, results: res.results }); afterRound(r); } return; }
  if (res.verdict === 'ignored' || r.play.state === 'done') return;
  if (res.verdict === 'invalid') { toast(res.reason); return; }
  syncClock(r, res.elapsed, res.state);
  if (res.verdict === 'pending') {
    r.play.elapsed = res.elapsed;
    if (S.pending) S.dymQueue.push({ answerId: res.answerId, suggestion: res.didYouMean, typed: c.text });
    else showDidYouMean(r, res.answerId, res.didYouMean, c.text);
    return;
  }
  applyVerdict(r, { id: res.answerId, input: c.text, canonical: res.canonical, verdict: res.verdict, fits: res.fits, reason: res.reason }, res.count);
}

function applyVerdict(r, a, count) {
  r.play.answers.push(a);
  // Verdicts can land out of order, so keep the highest count seen.
  count = r.play.count = Math.max(r.play.count || 0, count);
  const fn = $('#foundNum'); if (fn) { fn.textContent = count; }
  pushFeed(a);
  const sc = S.scene; if (!sc) return;
  const size = r.puzzle.size;
  if (a.verdict === 'ok') {
    // Mel's tongue grabs the label from the top of the scene and drops it into the overlap.
    const ch = addChip(a.canonical, null, 'ok fly');
    ch.el.style.left = '50%'; ch.el.style.top = '14%';
    sc.flash(FLASH); sc.setMood('happy');
    sc.catchAt(50, 14, () => { ch.region = size === 3 ? 'ABC' : 'AB'; ch.el.classList.remove('fly'); placeChips(); });
    setTimeout(() => S.scene && S.scene.setMood('smile'), 900);
    if (fn) { fn.classList.remove('bump'); void fn.offsetWidth; fn.classList.add('bump'); }
  } else if (a.verdict === 'close') {
    sc.lightRings(a.fits);
    const ch = addChip(a.canonical, regionKey(a.fits), 'close');
    ch.el.title = 'Close! Fits 2 of 3';
    setTimeout(() => { ch.el.classList.add('fade'); setTimeout(() => { ch.el.remove(); S.chips = S.chips.filter(x => x !== ch); }, 600); }, 1600);
  } else if (a.verdict === 'dup') {
    const same = S.chips.find(c => c.text.toLowerCase() === String(a.canonical).toLowerCase());
    if (same) { same.el.classList.remove('pulse'); void same.el.offsetWidth; same.el.classList.add('pulse'); }
    bounce(a.input, 'Already have it', 'dup');
  } else {
    sc.setMood('neutral'); setTimeout(() => S.scene && S.scene.setMood('smile'), 700);
    bounce(a.input, a.reason, 'no');
  }
}

/** A wrong answer bounces off the rings and fades, with the reason underneath. */
function bounce(text, reason, cls) {
  const p = S.scene ? S.scene.bouncePoint() : { x: 80, y: 40 };
  const el = document.createElement('span');
  el.className = 'chip bounce ' + cls;
  el.style.left = p.x + '%'; el.style.top = p.y + '%';
  el.title = reason || '';
  el.innerHTML = `${esc(text)}${reason ? `<small>${esc(reason)}</small>` : ''}`;
  $('#labels').appendChild(el);
  setTimeout(() => el.remove(), reduced() ? 1800 : 2400);
}

/* ── Did you mean ── */
function showDidYouMean(r, answerId, suggestion, typed) {
  S.pending = { answerId, suggestion };
  pauseVisual(true);
  stopClock();
  // The clock is stopped, so no new answers until this one's settled.
  const input = $('#ans');
  if (input) { input.disabled = true; input.dataset.ph = input.dataset.ph || input.placeholder; input.placeholder = 'Answer the question first'; }
  const box = $('#dym'); if (!box) return;
  box.hidden = false;
  box.innerHTML = `<p>Did you mean <b>${esc(suggestion)}</b>?</p><p class="sub">You typed “${esc(typed || '')}”. The clock is stopped.</p>
    <div class="row"><button class="btn sm" id="dymYes">Yes</button><button class="btn sm alt" id="dymNo">No</button></div>`;
  $('#dymYes').focus();
  $('#dymYes').onclick = () => answerDidYouMean(r, true);
  $('#dymNo').onclick = () => answerDidYouMean(r, false);
}

async function answerDidYouMean(r, yes) {
  const p = S.pending; if (!p) return;
  document.querySelectorAll('#dym button').forEach(b => { b.disabled = true; });
  try {
    const res = await api('venn/confirm', { answerId: p.answerId, yes });
    S.pending = null;
    $('#dym').hidden = true;
    if (res.verdict === 'stale') { pauseVisual(false); Object.assign(r, { puzzle: res.puzzle, play: res.play, results: res.results }); render(); return; }
    r.play.elapsed = res.elapsed; r.play.state = res.state;
    applyVerdict(r, { id: res.answerId, input: yes ? p.suggestion : '', canonical: res.canonical, verdict: res.verdict, fits: res.fits, reason: res.reason }, res.count);
    // Another "did you mean" came back meanwhile: the clock stays stopped for that one too.
    const next = S.dymQueue.shift();
    if (next) { showDidYouMean(r, next.answerId, next.suggestion, next.typed); return; }
    pauseVisual(false);
    startClock(r);
    const input = $('#ans');
    if (input) { input.disabled = false; if (input.dataset.ph) input.placeholder = input.dataset.ph; if (!yes) input.value = ''; input.focus(); }
    sendHeld(r);
  } catch (e) { toast(e.message); document.querySelectorAll('#dym button').forEach(b => { b.disabled = false; }); }
}

/* ── The clock ── */
function startClock(r) {
  stopClock();
  S.clock = { r, base: r.play.elapsed, at: performance.now(), running: r.play.state === 'running' && !S.pending, ended: false };
  const tick = () => {
    const c = S.clock; if (!c) return;
    const el = c.running ? c.base + (performance.now() - c.at) : c.base;
    const left = ROUND_MS - el;
    const num = $('#clockNum'), bar = $('#clockBar');
    if (num) num.textContent = fmtClock(left);
    if (bar) bar.style.width = Math.max(0, left / ROUND_MS * 100) + '%';
    const clk = $('#clock'); if (clk) clk.classList.toggle('low', left < 10000);
    if (c.running && left <= 0 && !c.ended) { c.ended = true; finishRound(c.r, false); return; }
    c.raf = requestAnimationFrame(tick);
  };
  S.clock.raf = requestAnimationFrame(tick);
}
function stopClock() { if (S.clock) { cancelAnimationFrame(S.clock.raf); S.clock = null; } }
function syncClock(r, elapsed, state) {
  if (!S.clock || S.clock.r !== r || elapsed == null) return;
  S.clock.base = elapsed; S.clock.at = performance.now();
  S.clock.running = state === 'running' && !S.pending;
}

async function finishRound(r, early) {
  if (r.play.state === 'done') return;
  stopClock();
  const b = $('#doneBtn'); if (b) b.disabled = true;
  // Let answers already on their way land first (anything still held back can't count now).
  S.checking.forEach(c => { if (!c.sent) { c.held = false; c.sent = true; } });
  await Promise.allSettled([...S.inflight]);
  try {
    const res = await api('venn/done', { puzzleId: r.puzzle.id, mode: r.mode });
    Object.assign(r, { puzzle: res.puzzle, play: res.play, results: res.results });
    if (!early) toast('Time!');
    afterRound(r);
  } catch (e) { toast(e.message); if (b) b.disabled = false; }
}

function afterRound(r) {
  stopClock(); S.pending = null; S.paused = false; resetChecking();
  render();
  if (S.ctx.kind !== 'unlimited') refreshMeta();
}

async function refreshMeta() {
  try {
    const d = await api('venn/today'); S.today = d; S.bucks = d.bucks; paintTools();
    if (S.ctx && S.ctx.kind === 'daily' && S.ctx.date === d.date) { S.ctx.day = d.day; renderHead(S.ctx); }
  } catch { /* fine */ }
}

/* ── Pausing: leaving the page stops the clock and hides the circles ── */
function pauseVisual(on) {
  const stage = $('#stage'); if (stage) stage.classList.toggle('paused', on);
  placeTags();
}

function renderPaused(r) {
  stopClock();
  S.paused = true;
  chipsFor(r); placeTags();
  $('#stage').classList.add('paused');
  $('#pausecover').hidden = false;
  $('#pausecover').innerHTML = `<div class="pausebox"><b>Paused</b><span>${fmtClock(ROUND_MS - r.play.elapsed)} left</span><button class="btn" id="resumeBtn">Resume</button></div>`;
  $('#panel').innerHTML = `<div class="playing"><div class="hud">
      <div class="clock"><b>${fmtClock(ROUND_MS - r.play.elapsed)}</b><i style="width:${(ROUND_MS - r.play.elapsed) / ROUND_MS * 100}%"></i></div>
      <div class="stat"><span>Found</span><b>${r.play.count}</b></div><div class="stat"><span>Par</span><b>${r.puzzle.par}</b></div></div>
      <p class="sub">The clock stopped when you left. The circles stay hidden until you resume.</p>
      <ul class="feed">${r.play.answers.slice().reverse().map(feedItem).join('')}</ul></div>`;
  $('#resumeBtn').onclick = () => resumeRound(r);
}

async function resumeRound(r) {
  try {
    const res = await api('venn/resume', { puzzleId: r.puzzle.id, mode: r.mode });
    Object.assign(r, { puzzle: res.puzzle, play: res.play, results: res.results });
    $('#stage') && $('#stage').classList.remove('paused');
    if (r.play.state === 'done') afterRound(r); else render();
  } catch (e) { toast(e.message); }
}

function beaconPause() {
  const r = cur();
  if (!r || r.play.state !== 'running' || S.view !== 'round') return;
  const body = JSON.stringify({ puzzleId: r.puzzle.id, mode: r.mode });
  let sent = false;
  try { sent = navigator.sendBeacon('/api/venn/pause', new Blob([body], { type: 'text/plain' })); } catch { /* fall through */ }
  if (!sent) fetch('/api/venn/pause', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  // Hide the circles and freeze the clock here right away; the server banks the time.
  r.play.state = 'paused';
  if (S.clock) r.play.elapsed = Math.min(ROUND_MS, S.clock.base + (performance.now() - S.clock.at));
  stopClock();
  S.paused = true;
  const stage = $('#stage'); if (stage) stage.classList.add('paused');
  placeTags();
}

document.addEventListener('visibilitychange', () => {
  const r = cur();
  if (document.visibilityState === 'hidden') beaconPause();
  else if (r && r.play.state === 'paused' && S.view === 'round' && !S.pending) resumeRound(r);
});
window.addEventListener('pagehide', beaconPause);

/* ═══════════ Results ═══════════ */
function renderResults(r) {
  stopClock(); S.paused = false; S.pending = null;
  $('#pausecover').hidden = true;
  $('#stage').classList.remove('paused');
  chipsFor(r); placeTags();
  const res = r.results || { count: r.play.count, par: r.puzzle.par, score: r.play.score, missed: [], everyone: null, complaints: {} };
  const mood = moodFor(r.play.score || 0);
  S.scene.setMood(mood);
  const wrong = r.play.answers.filter(a => a.verdict === 'no');
  const close = r.play.answers.filter(a => a.verdict === 'close');
  const c = S.ctx;
  const nextIdx = c.rounds.findIndex(x => x !== r && x.play.state !== 'done');
  const next = c.kind === 'unlimited' ? '<button class="btn" id="nextUnl">Next puzzle →</button>'
    : nextIdx >= 0 ? `<button class="btn" id="nextRound" data-next="${nextIdx}">${roundName(c.rounds[nextIdx].puzzle.round)} →</button>`
      : '<button class="btn" id="toSummary">Your day →</button>';
  const REPORT = { open: 'Reported: we\'re taking a look', accepted: 'Reported: fixed', rejected: 'Reported: checked, no change' };
  const wrongHTML = wrong.length ? `<div class="h4">Didn't count</div><ul class="wrong">${wrong.map(a => {
    const cpl = res.complaints && res.complaints[a.id];
    return `<li><span><b>${esc(a.input)}</b><small>${esc(a.reason || '')}</small></span>${cpl ? `<em>${esc(REPORT[cpl] || cpl)}</em>` : `<button class="link report" data-a="${a.id}">Wrong call?</button>`}</li>`;
  }).join('')}</ul>` : '';
  const closeHTML = close.length ? `<p class="sub">Close (fit 2 of 3, so no catch): ${close.map(a => esc(a.canonical)).join(', ')}</p>` : '';
  const crowd = res.everyone ? crowdHTML(res.everyone, { max: ROUND_MAX, daily: c.kind === 'daily' }) : '';
  const earned = bucksForRound(r.play.score, r.mode);
  $('#panel').innerHTML = `<div class="results">
      <div class="verdict"><div class="score"><span id="bigScore">0</span><small>/ 100</small></div>
        <div><h3>${esc(verdictTitle(r.play.score, res.count >= res.par))}</h3><p>You found ${res.count}. Par was ${res.par}. ${r.play.score} / 100.</p></div></div>
      ${earned ? `<div class="bucksline">${bucksIcon()} <b>+${earned}</b> WK ${earned === 1 ? 'Buck' : 'Bucks'}</div>` : ''}
      ${wrongHTML}${closeHTML}
      ${res.missed.length ? `<div class="h4">Answers you missed</div><div class="missed">${res.missed.map(m => `<span title="${m.players ? `${m.players} ${m.players === 1 ? 'player' : 'players'} found it` : ''}">${esc(m.name)}</span>`).join('')}</div>` : ''}
      ${crowd}
      <div class="row">${next}</div>
    </div>`;
  countUp($('#bigScore'), r.play.score || 0, 1100);
  document.querySelectorAll('.report').forEach(b => b.onclick = () => showReport(r, Number(b.dataset.a)));
  const nr = $('#nextRound'); if (nr) nr.onclick = () => { S.idx = Number(nr.dataset.next); S.view = 'round'; render(); window.scrollTo({ top: 0 }); };
  const ts = $('#toSummary'); if (ts) ts.onclick = () => { S.view = 'summary'; render(); window.scrollTo({ top: 0 }); };
  const nu = $('#nextUnl'); if (nu) nu.onclick = () => loadUnlimited(true);
}

function verdictTitle(s, madePar) {
  if (!madePar) return 'Under par';
  if (s >= 100) return 'Double par!';
  if (s >= 85) return 'Big catch';
  if (s >= 55) return 'Good haul';
  return 'Made par';
}

/* ═══════════ Summary ═══════════ */
function summaryHTML(c) {
  const done = c.rounds.filter(r => r.play.state === 'done');
  const total = done.reduce((s, r) => s + (r.play.score || 0), 0);
  const earned = done.reduce((s, r) => s + bucksForRound(r.play.score, r.mode), 0);
  return `<div class="summary">
      <div class="daylabel">${c.kind === 'archive' ? 'Archive · ' : ''}Venn #${c.number}</div>
      <div class="sumrow"><div class="portrait"><canvas id="sumMel" width="56" height="44"></canvas></div>
        <div><div class="total"><span id="sumTotal">0</span><small> / ${DAY_MAX}</small></div>
          <p class="sub">“${esc(MEL_MOODS[moodFor(total / 2)])}”</p></div></div>
      <div class="mini">${done.map(r => `<span><i class="dots">${r.puzzle.round === 2 ? '<i class="a"></i><i class="b"></i><i class="c"></i>' : '<i class="a"></i><i class="b"></i>'}</i>${r.play.count} found (par ${r.puzzle.par}) ${scoreSquare(r.play.score)} <b>${r.play.score}</b></span>`).join('')}</div>
      ${c.day && c.day.crowd ? `<div class="sumcrowd">${crowdHTML(c.day.crowd, { max: DAY_MAX, daily: c.kind === 'daily', finished: 'finished' })}</div>` : ''}
      <div class="row center"><button class="btn" id="shareBtn">Share</button><button class="btn alt" id="statsBtn2">Stats</button>
        ${c.kind === 'archive' ? '<a class="btn alt" href="#/archive">More days</a>' : ''}</div>
      ${c.kind === 'daily' ? '<div class="countdown">New rings in <b class="cd">--:--:--</b></div>' : ''}
      ${S.today && S.today.tipUrl ? `<a class="tip" href="${esc(S.today.tipUrl)}" target="_blank" rel="noopener">☕ Enjoying it? Buy me a coffee</a>` : ''}
      ${earned ? `<div class="bucksline">${bucksIcon()} <b>+${earned}</b> WK Bucks ${c.kind === 'daily' ? 'today' : 'from this day'}${S.bucks ? ` · ${S.bucks.balance} to spend` : ''} <button class="btn sm alt" id="shopBtn2" type="button">${mel()}'s shop</button></div>` : ''}
    </div>`;
}
function wireSummary(c) {
  const done = c.rounds.filter(r => r.play.state === 'done');
  const total = done.reduce((s, r) => s + (r.play.score || 0), 0);
  drawPortrait($('#sumMel'), moodFor(total / 2));
  countUp($('#sumTotal'), total, 1400);
  $('#shareBtn').onclick = () => doShare(c);
  $('#statsBtn2').onclick = showStats;
  const wb = $('#shopBtn2'); if (wb) wb.onclick = showShop;
  tick();
}

function shareText(c) {
  const rounds = c.rounds.filter(r => r.play.state === 'done').map(r => ({ round: r.puzzle.round, count: r.play.count, par: r.puzzle.par, score: r.play.score }));
  return vennShareText({ number: c.number, rounds, archive: c.kind === 'archive' }, location.host + '/venn');
}
async function doShare(c) {
  const text = shareText(c);
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch { /* copy instead */ } }
  try { await navigator.clipboard.writeText(text); toast('Copied to your clipboard.'); }
  catch { openModal(`<h2>Share</h2><textarea class="box" readonly style="min-height:130px">${esc(text)}</textarea>`); const ta = $('#modalBody textarea'); ta.focus(); ta.select(); }
}

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
document.addEventListener('keydown', e => {
  if (S.pending && !$('#dym').hidden && (e.key === 'y' || e.key === 'n') && document.activeElement && document.activeElement.id !== 'ans') answerDidYouMean(cur(), e.key === 'y');
});

let portraitTimer = 0;
/** Draws Mel's portrait and keeps Mel blinking. `getLook` is read every frame so previews update live. */
function drawPortrait(cv, mood, getLook = look) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let n = 0;
  const draw = blink => { ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(melPortrait(getLook(), { mood, blink }), 0, 0); };
  draw(false);
  clearInterval(portraitTimer);
  portraitTimer = setInterval(() => { if (!cv.isConnected) { clearInterval(portraitTimer); return; } n++; draw(n % 14 === 0); }, 220);
}

/** Mel's card: click Mel to meet the catcher. */
function showMel(r) {
  const mood = r && r.play.state === 'done' ? moodFor(r.play.score || 0) : 'ready';
  openModal(`<div class="melcard">
      <div class="portrait"><canvas id="melCv" width="56" height="44"></canvas></div>
      <div class="mel-text"><h2>${mel()}</h2>
        <p class="mel-role">Chameleon · Catches anything that fits</p>
        <p class="mel-quote">“${esc(MEL_MOODS[mood] || MEL_MOODS.ready)}”</p>
        <ul class="mel-facts"><li><b>Tongue:</b> longer than its body, faster than a blink</li>
          <li><b>Eyes:</b> each one looks its own way</li><li><b>Turns green when:</b> something lands in the overlap</li></ul>
        <div class="row"><button class="btn" id="melOk">Back to the rings</button><button class="btn alt" id="melWear">Shop</button></div></div></div>`);
  drawPortrait($('#melCv'), mood === 'ready' ? 'smile' : mood);
  $('#melOk').onclick = closeModal;
  $('#melWear').onclick = showShop;
}

/* ═══════════ Mel's shop ═══════════ */
function showShop() {
  openShop('mel', { api, toast, onChange: data => {
    S.bucks = data.bucks; S.me.mel = data.look; paintTools();
    if (S.scene) S.scene.setLook(look());
  } });
}

/* ═══════════ Help, stats, report, notifications ═══════════ */
function ringsIcon(n) {
  return `<svg viewBox="0 0 70 56" aria-hidden="true"><rect width="70" height="56" fill="#17402b"/>
    <circle cx="${n === 3 ? 28 : 27}" cy="${n === 3 ? 22 : 28}" r="15" fill="${COLORS.A}" fill-opacity=".35" stroke="#3f8a46" stroke-width="3"/>
    <circle cx="${n === 3 ? 42 : 43}" cy="${n === 3 ? 22 : 28}" r="15" fill="${COLORS.B}" fill-opacity=".35" stroke="#3f8a46" stroke-width="3"/>
    ${n === 3 ? `<circle cx="35" cy="34" r="15" fill="${COLORS.C}" fill-opacity=".35" stroke="#3f8a46" stroke-width="3"/>` : ''}</svg>`;
}
function showHelp() {
  openModal(`<h2>How to play</h2>
    <div class="steps">
      <div class="stepc">${ringsIcon(2)}<p><b class="n">Round 1: two circles</b>Each circle is a category, like “Things colored orange” and “Foods people eat”. You get 90 seconds to name as many things as you can that fit <b>both</b>.</p></div>
      <div class="stepc">${ringsIcon(3)}<p><b class="n">Round 2: three circles</b>Only the very center counts. Something that fits two of the three is close, but doesn't count.</p></div>
      <div class="stepc"><svg viewBox="0 0 70 56" aria-hidden="true"><rect width="70" height="56" fill="#17402b"/><text x="35" y="25" text-anchor="middle" font-size="14" font-weight="700" fill="#f2c230">par 5</text><text x="35" y="44" text-anchor="middle" font-size="11" fill="#fff">10 = 100</text></svg><p><b class="n">Beat par</b>Every answer is 5 points until you reach par, which is worth at least 25. Every answer past par adds more, up to 100 at double par. The day is out of 200.</p></div>
    </div>
    <p class="sub">Wrong answers cost nothing. Leaving the page pauses the clock. Each round pays WK Bucks ${bucksIcon()} to spend in ${mel()}'s shop. New rings every midnight UTC.</p>
    <div class="row"><button class="btn" id="helpGo">Got it</button></div>`);
  $('#helpGo').onclick = closeModal;
}
async function showStats() {
  openModal('<h2>Your stats</h2><div class="shimmer">Counting catches…</div>');
  try {
    const s = await api('venn/stats');
    openModal(`<h2>Your stats</h2>
      ${statsHTML(s, { max: DAY_MAX, note: `<p class="sub">Days are out of ${DAY_MAX}. Archive: ${s.archive.played} ${s.archive.played === 1 ? 'round' : 'rounds'} · average ${s.archive.avg}.</p>` })}
      ${S.me.signedIn ? '' : '<p class="sub">These are only saved on this device. <button class="link" id="statsSignin">Sign in</button> to take them with you.</p>'}`);
    const si = $('#statsSignin'); if (si) si.onclick = () => accountModal(accountUI());
  } catch (e) { openModal(`<h2>Your stats</h2><div class="note bad">${esc(e.message)}</div>`); }
}
function showReport(r, answerId) {
  const a = r.play.answers.find(x => x.id === answerId); if (!a) return;
  openModal(`<h2>Wrong call?</h2>
    <p>You said “${esc(a.input)}”, and it didn't count${a.reason ? `: <i>${esc(a.reason)}</i>` : '.'}</p>
    <p class="sub">If we agree, it counts for everyone who gave it, scores update, and you'll see a note next time you stop by.</p>
    <textarea class="box" id="rnote" maxlength="500" placeholder="Why does it fit? (optional)"></textarea>
    <div class="row"><button class="btn" id="rsend">Send report</button><button class="btn alt" id="rcancel">Cancel</button></div>`);
  $('#rcancel').onclick = closeModal;
  $('#rsend').onclick = async () => {
    $('#rsend').disabled = true;
    try {
      await api('venn/complaint', { answerId, note: $('#rnote').value });
      r.results = r.results || {}; r.results.complaints = { ...(r.results.complaints || {}), [answerId]: 'open' };
      closeModal(); toast('Thanks! We\'ll take a look.'); renderResults(r);
    } catch (e) { toast(e.message); $('#rsend').disabled = false; }
  };
}
function showNotifications(list) {
  openModal(`<h2>Mail from the canopy</h2>
    ${list.map(n => `<div class="note ${n.status === 'accepted' ? '' : 'warn'}" style="margin-bottom:10px">${n.status === 'accepted' ? '✓ You were right!' : 'We checked your report.'}
      <div class="sub">“${esc(n.input)}” for ${n.circles.map(c => `“${esc(c)}”`).join(' + ')} ${n.status === 'accepted' ? 'now counts. Your score has been updated.' : 'still doesn\'t count.'}</div>
      ${n.note ? `<div class="sub">Note: ${esc(n.note)}</div>` : ''}</div>`).join('')}
    <div class="row"><button class="btn" id="nOk">Got it</button></div>`);
  $('#nOk').onclick = closeModal;
}

/* ═══════════ Archive ═══════════ */
async function renderArchiveList() {
  dropScene(); stopClock(); S.ctx = null;
  $('#main').innerHTML = loadingHTML('Gathering old vines…');
  if (!S.today) await loadMeta();
  const d = await api('venn/archive');
  const rows = d.days.map(day => {
    const cells = [1, 2].map(n => {
      const r = day.rounds.find(x => x.round === n);
      const v = r ? (r.daily != null ? r.daily : r.archive) : null;
      return `<span class="${v == null ? '' : 'sq ' + tierOf(v)}" title="${roundName(n)}">${v == null ? '·' : v}</span>`;
    }).join('');
    const dateStr = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `<a class="aday" href="#/archive/${day.date}"><span class="num">#${day.number}</span><span class="d">${esc(dateStr)}</span><span class="s">${cells}</span></a>`;
  }).join('');
  $('#main').innerHTML = `<section class="card"><h2 class="prompt">Past days</h2>
    <p class="sub">Replays don't count toward your streak, and pay half the WK Bucks.</p>
    <div class="archive">${rows || '<p class="empty">No past days yet. Come back tomorrow!</p>'}</div>
    <div class="row"><a class="btn alt sm" href="#/">← Today</a></div></section>`;
}

/* ═══════════ Header tools ═══════════ */
function paintTools() {
  $('#unlBtn').hidden = !S.me.isAdmin;
  $('#admBtn').hidden = !S.me.isAdmin;
  $('#acctBtn').classList.toggle('on', !!S.me.signedIn);
  $('#bucksIco').innerHTML = bucksIcon();
  $('#bucksNum').textContent = S.bucks ? S.bucks.balance : '';
}
$('#helpBtn').onclick = showHelp;
$('#statsBtn').onclick = showStats;
$('#acctBtn').onclick = () => accountModal(accountUI());
$('#shopBtn').onclick = showShop;
$('#unlBtn').onclick = () => { location.hash = '#/unlimited'; };

paintTools();
route();
