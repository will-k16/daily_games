// Polly: guess what America said. Three real poll questions a day: pick your side (or skip), drag the split
// bar to guess what percent of US adults picked the left side, lock it in, and Polly rings the bell.
import { createPollyScene, timeOfDay } from './polly-scene.js';
import { pollyPortrait } from './polly-sprites.js';
import { POLLY_DEFAULT_LOOK } from './polly-wardrobe.js';
import { openShop } from './shop.js';
import { crowdHTML, statsHTML } from './charts.js';
import { DAY_MAX, QUESTION_MAX, band, crestFor, moodFor, pollyShareText, niceDate, dayBonus } from './polly-score.js';
import { bucksIcon } from './bucks.js';
import { showAccount as accountModal, signInReturn } from './account.js';
import { openModal, closeModal } from './modal.js';

/* ═══════════ Basics ═══════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

const S = { me: { signedIn: false, isAdmin: false, email: '', polly: { ...POLLY_DEFAULT_LOOK } }, bucks: null, today: null, ctx: null, scene: null, sel: null, busy: false, clockOn: false };

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch('/api/' + path, { credentials: 'same-origin', ...opt });
  const data = await res.json().catch(() => ({ error: 'Lost the connection there. Try again?' }));
  if (!res.ok || data.error) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3000); }

const look = () => S.me.polly || POLLY_DEFAULT_LOOK;
const pollyName = () => esc(look().name || POLLY_DEFAULT_LOOK.name);
const accountUI = () => ({ me: S.me, api, openModal, closeModal, toast });
const pct = n => `${n}%`;

function countUp(el, from, to, dur, fmt = v => v) {
  if (!el) return Promise.resolve();
  if (reduced() || dur <= 0) { el.textContent = fmt(to); return Promise.resolve(); }
  return new Promise(res => {
    const start = performance.now();
    const go = now => {
      const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(go); else res();
    };
    requestAnimationFrame(go);
  });
}

const MOODS = {
  thrilled: { line: 'You could run this town!', pose: 'thrilled', crest: 'fan' },
  happy: { line: 'You know this crowd well.', pose: 'happy', crest: 'high' },
  okay: { line: 'Not bad. People are hard to read.', pose: 'okay', crest: 'half' },
  puzzled: { line: 'This town keeps surprising us.', pose: 'puzzled', crest: 'low' },
  sad: { line: 'Tough crowd today. Tomorrow\'s a new poll.', pose: 'sad', crest: 'flat' }
};
const HEAR_YE = 'Hear ye! Three questions today.';
const SQUAWK = { perfect: 'Spot on! Bawk!', green: 'So close I felt it in my crest!', yellow: 'Not bad. The square\'s impressed.', orange: 'Hmm. The town had other ideas.', red: 'Squawk! Way off!' };

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
  const d = await api('polly/today');
  S.today = d; S.me = d.me; S.bucks = d.bucks; paintTools();
  return d;
}
async function loadToday() {
  if (!S.scene) $('#main').innerHTML = loadingHTML('Ringing the bell…');
  const d = await loadMeta();
  setCtx({ kind: 'daily', date: d.date, number: d.number, questions: d.questions, day: d.day, summary: d.summary, noPoll: d.noPoll });
  if (d.notifications && d.notifications.length) showNotifications(d.notifications);
  signInReturn(accountUI());
}
async function loadArchiveDay(date) {
  if (!S.scene) $('#main').innerHTML = loadingHTML('Unrolling an old scroll…');
  if (!S.today) await loadMeta();
  const d = await api('polly/archive/day?date=' + encodeURIComponent(date));
  setCtx({ kind: 'archive', date: d.date, number: d.number, mode: d.mode, questions: d.questions, day: d.day, summary: d.summary });
}
async function loadUnlimited() {
  if (!S.scene) $('#main').innerHTML = loadingHTML('Picking a question…');
  const d = await api('polly/unlimited/next', {});
  setCtx({ kind: 'unlimited', questionId: d.questionId, questions: [{ ...d.question, answered: false }], day: null });
}

/* ═══════════ Layout and scene ═══════════ */
function ensureLayout() {
  if ($('#stage')) return;
  $('#main').innerHTML = `
    <div class="stage" id="stage"><div class="scene-host" id="sceneHost"></div><div class="bubble" id="bubble" hidden></div><div class="clocktip" id="clocktip" hidden></div></div>
    <section class="qcard" id="qcard"></section>`;
  S.scene = createPollyScene($('#sceneHost'), {
    look: look(), tod: timeOfDay(),
    onPollyClick: showPolly,
    onClock: (on, at) => { S.clockOn = on; const t = $('#clocktip'); t.hidden = !on; t.style.left = at.x + '%'; t.style.top = at.y + '%'; tick(); }
  });
}
function dropScene() { if (S.scene) { S.scene.destroy(); S.scene = null; } }

function setCtx(ctx) {
  S.ctx = ctx;
  ensureLayout();
  const open = ctx.questions.findIndex(q => !q.answered);
  ctx.idx = open < 0 ? Math.max(0, ctx.questions.length - 1) : open;
  ctx.view = ctx.noPoll || !ctx.questions.length ? 'nopoll' : ctx.kind !== 'unlimited' && open < 0 ? 'summary' : 'question';
  render(true);
}

function render(fresh = false) {
  const c = S.ctx; if (!c) return;
  paintHead();
  hideBubble();
  if (c.view === 'nopoll') return renderNoPoll();
  if (c.view === 'summary') return renderSummary();
  const q = c.questions[c.idx];
  if (q.answered) return renderReveal(q, { animate: false });
  renderQuestion(q, fresh);
}

function paintHead() {
  const c = S.ctx;
  $('#pnum').textContent = !c ? '' : c.kind === 'unlimited' ? '∞' : `#${c.number}${c.kind === 'archive' ? ' · archive' : ''}`;
  const pips = $('#pips');
  if (!c || c.kind === 'unlimited' || c.view === 'nopoll') { pips.innerHTML = ''; return; }
  const next = c.questions.findIndex(q => !q.answered);
  pips.innerHTML = c.questions.map((q, i) => {
    const can = q.answered || i === next;
    return `<button type="button" data-i="${i}" class="${q.answered ? 'sq-' + band(q.reveal.score) : ''} ${i === c.idx && c.view === 'question' ? 'cur' : ''}"
      title="Question ${i + 1}${q.answered ? `: ${q.reveal.score}` : ''}" aria-label="Question ${i + 1}${q.answered ? `, scored ${q.reveal.score}` : ', not answered yet'}" ${can && !S.busy ? '' : 'disabled'}></button>`;
  }).join('');
  pips.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { if (S.busy) return; c.idx = Number(b.dataset.i); c.view = 'question'; render(); });
}

function bubble(text) {
  const b = $('#bubble'); if (!b || !S.scene) return;
  const at = S.scene.anchors().polly;
  b.textContent = text; b.style.left = at.x + '%'; b.style.top = at.y + '%'; b.hidden = false;
  clearTimeout(b._h); b._h = setTimeout(() => { b.hidden = true; }, 2500);
}
function hideBubble() { const b = $('#bubble'); if (b) { clearTimeout(b._h); b.hidden = true; } }

/* ═══════════ A question ═══════════ */
function renderQuestion(q, fresh) {
  const c = S.ctx;
  S.sel = { own: null, skipped: false, v: null };
  S.scene.setLabels(q.left, q.right, !fresh);
  S.scene.question();
  $('#qcard').innerHTML = `
    <div class="kicker"><span>${c.kind === 'unlimited' ? 'Unlimited · admin' : `Question ${c.idx + 1} of 3`}</span>${c.kind === 'archive' ? '<span class="badge">ARCHIVE</span>' : ''}</div>
    <h2 class="qshort">${esc(q.short)}</h2>
    <p class="yours">Your answer</p>
    <div class="sides" id="sides">
      <button type="button" class="side left" data-own="left" aria-pressed="false">${esc(q.left)}</button>
      <button type="button" class="side right" data-own="right" aria-pressed="false">${esc(q.right)}</button>
    </div>
    <div class="skiprow" id="skiprow"></div>
    ${barHTML(q)}
    <div class="lockrow"><button class="btn lock" id="lock" disabled>Lock in</button></div>`;
  paintSkip();
  document.querySelectorAll('#sides [data-own]').forEach(b => b.onclick = () => {
    S.sel.own = b.dataset.own;
    document.querySelectorAll('#sides [data-own]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  wireBar(q);
  $('#lock').onclick = () => lockIn(q);
}

function paintSkip() {
  const row = $('#skiprow'), sides = $('#sides');
  if (S.sel.skipped) {
    sides.hidden = true; $('.yours').hidden = true;
    row.innerHTML = '<span>Skipped</span><button type="button" class="link" id="undo">Undo</button>';
    $('#undo').onclick = () => { S.sel.skipped = false; paintSkip(); };
  } else {
    sides.hidden = false; $('.yours').hidden = false;
    row.innerHTML = '<button type="button" class="link" id="skip">Skip</button>';
    $('#skip').onclick = () => { S.sel.skipped = true; paintSkip(); };
  }
}

function barHTML(q) {
  return `<div class="barwrap" id="barwrap">
      <div class="barends"><span class="l">${esc(q.left.toUpperCase())} <b id="lpct">–</b></span><span class="r"><b id="rpct">–</b> ${esc(q.right.toUpperCase())}</span></div>
      <div class="barrow">
        <button type="button" class="nudge" id="minus" aria-label="1 less for ${esc(q.left)}">−</button>
        <div class="splitbar empty" id="bar" role="slider" tabindex="0" aria-label="Your guess: percent who said ${esc(q.left)}"
          aria-valuemin="0" aria-valuemax="100" aria-valuetext="Not set yet"><i class="fillL"></i><i class="seam"></i><span class="hint">Tap the bar to guess</span><span class="peg"></span></div>
        <button type="button" class="nudge" id="plus" aria-label="1 more for ${esc(q.left)}">+</button>
      </div>
    </div>`;
}

/** Paints the bar at v (null = untouched): left orange up to the handle, right teal. */
function paintBar(q, v) {
  const bar = $('#bar'); if (!bar) return;
  bar.classList.toggle('empty', v == null);
  if (v != null) {
    bar.querySelector('.fillL').style.width = v + '%';
    bar.querySelector('.seam').style.left = v + '%';
    bar.querySelector('.peg').style.left = v + '%';
    bar.setAttribute('aria-valuenow', v);
    bar.setAttribute('aria-valuetext', `${q.left} ${v}%, ${q.right} ${100 - v}%`);
  }
  $('#lpct').textContent = v == null ? '–' : pct(v);
  $('#rpct').textContent = v == null ? '–' : pct(100 - v);
  const lock = $('#lock'); if (lock) lock.disabled = v == null || S.busy;
}

function wireBar(q) {
  const bar = $('#bar');
  const set = v => { if (S.busy) return; S.sel.v = clamp(v); paintBar(q, S.sel.v); };
  const fromX = x => { const r = bar.getBoundingClientRect(), b = 3; set((x - r.left - b) / (r.width - 2 * b) * 100); };
  let drag = false;
  bar.onpointerdown = e => { if (S.busy) return; drag = true; bar.setPointerCapture(e.pointerId); fromX(e.clientX); bar.focus({ preventScroll: true }); e.preventDefault(); };
  bar.onpointermove = e => { if (drag) fromX(e.clientX); };
  bar.onpointerup = bar.onpointercancel = () => { drag = false; };
  bar.onkeydown = e => {
    const v = S.sel.v == null ? 50 : S.sel.v;
    const to = { ArrowLeft: v - 1, ArrowDown: v - 1, ArrowRight: v + 1, ArrowUp: v + 1, PageDown: v - 10, PageUp: v + 10, Home: 0, End: 100 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    set(S.sel.v == null && /Arrow|Page/.test(e.key) ? 50 + (to - 50) : to);
  };
  // − / + nudge by 1; holding repeats every 80 ms after 400 ms.
  [['#minus', -1], ['#plus', 1]].forEach(([sel, d]) => {
    const b = $(sel);
    let t1 = 0, t2 = 0;
    const stepOnce = () => set(S.sel.v == null ? 50 + d : S.sel.v + d);
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    b.onpointerdown = e => { e.preventDefault(); stepOnce(); stop(); t1 = setTimeout(() => { t2 = setInterval(stepOnce, 80); }, 400); };
    b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
    b.onclick = e => { if (e.detail === 0) stepOnce(); };       // keyboard Enter / Space
    b.oncontextmenu = e => e.preventDefault();
  });
}

/* ═══════════ Lock in and the reveal ═══════════ */
async function lockIn(q) {
  const c = S.ctx;
  if (S.sel.v == null || S.busy) return;
  S.busy = true;
  const lock = $('#lock'); lock.disabled = true; lock.classList.add('busy');
  document.querySelectorAll('#qcard .side, #qcard .nudge, #skiprow button').forEach(b => { b.disabled = true; });
  const body = { slot: q.slot, guess: S.sel.v, own: S.sel.skipped ? null : S.sel.own };
  try {
    let res;
    if (c.kind === 'daily') res = await api('polly/lock', body);
    else if (c.kind === 'archive') res = await api('polly/archive/lock', { ...body, date: c.date });
    else res = await api('polly/unlimited/lock', { ...body, questionId: c.questionId });
    if (res.questions) { c.questions = res.questions; c.day = res.day; c.summary = res.summary; }
    else Object.assign(q, { answered: true, reveal: res.reveal });
    if (res.bucks) { S.bucks = res.bucks; paintTools(); }
    const nq = c.questions.find(x => x.slot === q.slot) || q;
    await renderReveal(nq, { animate: true });
  } catch (e) {
    toast(e.message);
    if (e.status === 409) { S.busy = false; return route(); }
    lock.classList.remove('busy');
    document.querySelectorAll('#qcard .side, #qcard .nudge, #skiprow button').forEach(b => { b.disabled = false; });
  } finally { S.busy = false; paintHead(); const n = $('#next'); if (n) n.disabled = false; }
}

/**
 * The reveal: the bell (400 ms), the walk (1,500 ms), the bar re-fills to the real split with its % counting
 * (600 ms), then the score counts up (600 ms), the crest rises, Polly squawks, and confetti on a 100.
 */
async function renderReveal(q, { animate }) {
  const c = S.ctx, rv = q.reveal, anim = animate && !reduced();
  S.scene.setLabels(q.left, q.right, false);
  const sideHTML = rv.own
    ? `<div class="sides"><button type="button" class="side left" aria-pressed="${rv.own === 'left'}" disabled>${esc(q.left)}</button><button type="button" class="side right" aria-pressed="${rv.own === 'right'}" disabled>${esc(q.right)}</button></div>`
    : '<div class="skiprow"><span>You skipped picking a side.</span></div>';
  const start = animate ? rv.guess : rv.real;
  $('#qcard').innerHTML = `
    <div class="kicker"><span>${c.kind === 'unlimited' ? 'Unlimited · admin' : `Question ${c.idx + 1} of 3`}</span>${c.kind === 'archive' ? '<span class="badge">ARCHIVE</span>' : ''}</div>
    <h2 class="qshort">${esc(q.short)}</h2>
    ${sideHTML}
    <div class="barwrap revealed" id="barwrap">
      <div class="barends"><span class="l">${esc(q.left.toUpperCase())} <b id="lpct">${pct(start)}</b></span><span class="r"><b id="rpct">${pct(100 - start)}</b> ${esc(q.right.toUpperCase())}</span></div>
      <div class="barrow">
        <button type="button" class="nudge" disabled aria-hidden="true">−</button>
        <div class="splitbar revealed" id="bar" role="img" aria-label="Real answer: ${rv.real}% ${esc(q.left)}, ${100 - rv.real}% ${esc(q.right)}. You guessed ${rv.guess}.">
          <i class="fillL" style="width:${start}%"></i><i class="seam" style="left:${start}%"></i>
          <span class="notch" id="notch" style="left:${start}%" ${animate ? 'hidden' : ''}></span><span class="tag" id="tag" style="left:${start}%" ${animate ? 'hidden' : ''}>${pct(start)}</span></div>
        <button type="button" class="nudge" disabled aria-hidden="true">+</button>
      </div>
      <div class="marks" id="marks">${marksHTML(rv, !animate)}</div>
      ${wkHTML(q, rv)}
    </div>
    <div class="scoreline"><i class="sqchip sq-${band(rv.score)}" id="sqchip" ${animate ? 'hidden' : ''}></i><span class="big" id="qscore">${animate ? 0 : rv.score}</span><small>/ 100</small>
      ${rv.bucks ? `<span class="bucksline" id="qbucks" ${animate ? 'hidden' : ''}>${bucksIcon()} <b>+${rv.bucks}</b></span>` : ''}</div>
    <div class="details" id="details" ${animate ? 'hidden' : ''}>${detailsHTML(q, rv)}</div>`;
  wireDetails(q);

  if (!animate) {
    S.scene.snapSides(rv.real);
    S.scene.setCrest(crestFor(rv.score)); S.scene.setPose('idle');
    return;
  }
  // 1. the bell, 2. the walk
  await S.scene.ring();
  await S.scene.walk(rv.real);
  // 3. the count-up to the real split
  $('#notch').hidden = false; $('#tag').hidden = false;
  await animateBar(rv, anim ? 600 : 0);
  $('#marks').innerHTML = marksHTML(rv, true);
  // 4. the score
  await countUp($('#qscore'), 0, rv.score, anim ? 600 : 0);
  $('#sqchip').hidden = false; const qb = $('#qbucks'); if (qb) qb.hidden = false;
  S.scene.setCrest(crestFor(rv.score));
  bubble(SQUAWK[band(rv.score)]);
  if (rv.score === 100) S.scene.confetti();
  $('#details').hidden = false;
  const n = $('#next'); if (n) n.focus({ preventScroll: true });
}

function animateBar(rv, dur) {
  const fill = $('#bar .fillL'), seam = $('#bar .seam'), notch = $('#notch'), tag = $('#tag');
  const paint = v => {
    fill.style.width = v + '%'; seam.style.left = v + '%'; notch.style.left = v + '%'; tag.style.left = v + '%';
    tag.textContent = pct(v); $('#lpct').textContent = pct(v); $('#rpct').textContent = pct(100 - v);
  };
  if (!dur) { paint(rv.real); return Promise.resolve(); }
  return new Promise(res => {
    const start = performance.now();
    const go = now => {
      const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      paint(Math.round(rv.guess + (rv.real - rv.guess) * e));
      if (p < 1) requestAnimationFrame(go); else res();
    };
    requestAnimationFrame(go);
  });
}

/** Your guess as an ink triangle under the bar, and a dithered bracket to the real notch: "7 off" or "Exact!". */
function marksHTML(rv, withGap) {
  const off = Math.abs(rv.guess - rv.real), lo = Math.min(rv.guess, rv.real), mid = (rv.guess + rv.real) / 2;
  return `<span class="you" style="left:${rv.guess}%"><i></i>You ${rv.guess}</span>
    ${withGap && off ? `<span class="bracket" style="left:${lo}%;width:${off}%"></span>` : ''}
    ${withGap ? `<span class="off ${off ? '' : 'exact'}" style="left:${off ? mid : rv.guess}%">${off ? `${off} off` : 'Exact!'}</span>` : ''}`;
}

/** The WK players' split: a slim bar under the real one, once 5+ players picked a side. */
function wkHTML(q, rv) {
  if (!rv.wk) return '';
  if (rv.wk.few) return '<p class="fewnote">WK players\' split shows once 5 people have picked a side.</p>';
  return `<div class="wkbar" role="img" aria-label="WK players: ${rv.wk.left}% ${esc(q.left)}, ${100 - rv.wk.left}% ${esc(q.right)}"><i style="width:${rv.wk.left}%"></i></div>
    <div class="wklabel"><span>${rv.wk.left}%</span><span>WK players (${rv.wk.n})</span><span>${100 - rv.wk.left}%</span></div>`;
}

function detailsHTML(q, rv) {
  const c = S.ctx;
  const nextLabel = c.kind === 'unlimited' ? 'Next question' : c.questions.every(x => x.answered) ? 'See your day' : 'Next question';
  const src = [esc(rv.source), rv.pollEnd ? `poll ended ${esc(niceDate(rv.pollEnd))}` : '', rv.sample ? `${Number(rv.sample).toLocaleString('en-US')} US adults` : '']
    .filter(Boolean).join(' · ');
  const reportHTML = c.kind === 'unlimited' ? '<span></span>' : rv.report ? '<span class="sub" style="margin:0">Reported</span>' : '<button type="button" class="link" id="report">Report this question</button>';
  return `
    <p class="realline"><b class="l">${rv.real}%</b> said ${esc(q.left)} · <b class="r">${100 - rv.real}%</b> said ${esc(q.right)}</p>
    <blockquote class="wording">“${esc(rv.original)}”</blockquote>
    <p class="srcline">${src}${rv.url ? ` · <a href="${esc(rv.url)}" target="_blank" rel="noopener noreferrer">See the poll ↗</a>` : ''}</p>
    ${rv.crowd ? crowdHTML(rv.crowd, { max: QUESTION_MAX, daily: c.kind === 'daily' }) : ''}
    <div class="reveal-foot">${reportHTML}<button type="button" class="btn" id="next">${nextLabel}</button></div>`;
}

function wireDetails(q) {
  const c = S.ctx;
  const rp = $('#report'); if (rp) rp.onclick = () => showReport(q);
  const n = $('#next');
  if (!n) return;
  n.disabled = S.busy;
  n.onclick = () => {
    if (c.kind === 'unlimited') return loadUnlimited().catch(showError);
    const open = c.questions.findIndex(x => !x.answered);
    if (open < 0) { c.view = 'summary'; render(); }
    else { c.idx = open; c.view = 'question'; render(); }
    window.scrollTo({ top: 0 });
  };
}

/* ═══════════ No poll, summary ═══════════ */
function renderNoPoll() {
  S.scene.setLabels('', '', false); S.scene.mill(); S.scene.setPose('idle'); S.scene.setCrest('low');
  $('#qcard').innerHTML = `<h2 class="qshort">No poll today. Check back tomorrow.</h2>
    <div class="countdown">Next poll in <b class="cd">--:--:--</b></div>
    ${S.me.isAdmin ? '<p class="sub">The bank is empty. Add questions in <a href="/admin#polly/add">admin</a>.</p>' : ''}`;
  tick();
}

function renderSummary() {
  const c = S.ctx;
  const qs = c.questions, total = qs.reduce((s, q) => s + (q.reveal ? q.reveal.score : 0), 0);
  const mood = MOODS[moodFor(total)], sm = c.summary || {};
  const mode = c.kind === 'archive' ? c.mode : 'daily';
  S.scene.setLabels('', '', false); S.scene.mill(); S.scene.setPose(mood.pose); S.scene.setCrest(mood.crest);
  const agree = sm.agree && sm.agree.of ? `<p class="agree">You sided with the majority on ${sm.agree.agreed} of ${sm.agree.of}.</p>` : '';
  const earned = sm.bucks != null ? sm.bucks : qs.reduce((s, q) => s + (q.reveal ? q.reveal.bucks : 0), 0) + dayBonus(mode);
  $('#qcard').innerHTML = `<div class="summary">
      <div class="kicker"><span>Polly #${c.number}${c.kind === 'archive' ? ' · archive' : ''}</span><span>${c.kind === 'archive' && c.mode === 'daily' ? 'played on the day' : ''}</span></div>
      <p class="moodline">“${esc(mood.line)}”</p>
      <div class="total"><span id="sumTotal">0</span><small>/${DAY_MAX}</small></div>
      <ul class="recap">${qs.map((q, i) => {
        const r = q.reveal, off = Math.abs(r.guess - r.real);
        return `<li><span class="qs">${esc(q.short)}</span><span class="nums">You ${r.guess} · Real ${r.real} · ${off ? off + ' off' : 'Exact!'}</span>
          <span class="sc"><button type="button" class="link" data-review="${i}" aria-label="Look at question ${i + 1} again"><i class="sqchip sq-${band(r.score)}"></i></button>${r.score}</span></li>`;
      }).join('')}</ul>
      ${sm.crowd ? `<div class="sumcrowd">${crowdHTML(sm.crowd, { max: DAY_MAX, daily: mode === 'daily' && c.kind === 'daily', finished: 'finished' })}</div>` : ''}
      ${agree}
      ${earned ? `<div class="row center" style="margin-top:10px"><span class="bucksline">${bucksIcon()} <b>+${earned}</b> WK Bucks ${c.kind === 'daily' ? 'today' : 'from this day'}${S.bucks ? ` · ${S.bucks.balance} to spend` : ''}</span><button class="btn sm alt" id="shopBtn2" type="button">${pollyName()}'s shop</button></div>` : ''}
      <div class="row center"><button class="btn" id="shareBtn">Share</button><button class="btn alt" id="statsBtn2">Stats</button>
        ${c.kind === 'archive' ? '<a class="btn alt" href="#/archive">More days</a>' : ''}</div>
      ${c.kind === 'daily' ? '<div class="countdown">Next poll in <b class="cd">--:--:--</b></div>' : ''}
      ${S.today && S.today.tipUrl ? `<a class="tip" href="${esc(S.today.tipUrl)}" target="_blank" rel="noopener">☕ Enjoying it? Buy me a coffee</a>` : ''}
    </div>`;
  countUp($('#sumTotal'), 0, total, 1100);
  $('#shareBtn').onclick = () => doShare(c);
  $('#statsBtn2').onclick = showStats;
  const wb = $('#shopBtn2'); if (wb) wb.onclick = showShop;
  document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => { c.idx = Number(b.dataset.review); c.view = 'question'; render(); window.scrollTo({ top: 0 }); });
  tick();
}

function shareText(c) {
  return pollyShareText({ number: c.number, questions: c.questions.map(q => ({ slot: q.slot, score: q.answered ? q.reveal.score : null })), archive: c.kind === 'archive' && c.mode !== 'daily' }, location.host + '/polly');
}
async function doShare(c) {
  const text = shareText(c);
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch { /* copy instead */ } }
  try { await navigator.clipboard.writeText(text); toast('Copied to your clipboard.'); }
  catch { openModal(`<h2>Share</h2><textarea class="box" readonly style="min-height:110px">${esc(text)}</textarea>`); const ta = $('#modalBody textarea'); ta.focus(); ta.select(); }
}

/* ── the countdown (summary, no-poll card, and the clock's tooltip) ── */
function nextReset() {
  if (S.today && S.today.nextReset) return new Date(S.today.nextReset).getTime();
  const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime();
}
function tick() {
  const ms = nextReset() - Date.now();
  const s = Math.max(0, Math.floor(ms / 1000));
  const txt = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
  document.querySelectorAll('.cd').forEach(el => { el.textContent = ms <= 0 ? 'now! refresh' : txt; });
  const tip = $('#clocktip'); if (tip && S.clockOn) tip.textContent = `New poll in ${txt}`;
}
setInterval(tick, 1000);

/* ═══════════ Polly's card ═══════════ */
let portraitTimer = 0;
function drawPortrait(cv, opts, getLook = look) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let n = 0;
  const draw = blink => { ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(pollyPortrait(getLook(), { ...opts, blink }), 0, 0); };
  draw(false);
  clearInterval(portraitTimer);
  portraitTimer = setInterval(() => { if (!cv.isConnected) { clearInterval(portraitTimer); return; } n++; draw(n % 16 === 0); }, 220);
}

function todayMood() {
  const c = S.ctx;
  if (c && c.kind === 'daily' && c.questions.length && c.questions.every(q => q.answered)) return MOODS[moodFor(c.questions.reduce((s, q) => s + q.reveal.score, 0))];
  return null;
}

function showPolly() {
  const m = todayMood();
  openModal(`<div class="pollycard">
      <div class="portrait"><canvas id="pollyCv" width="56" height="44"></canvas></div>
      <div><h2>${pollyName()}</h2>
        <p class="p-role">Cockatoo · Town crier</p>
        <p class="p-quote">“${esc(m ? m.line : HEAR_YE)}”</p>
        <ul class="p-facts"><li><b>Crest:</b> goes up when she's excited, down when she's not</li>
          <li><b>Rhythm:</b> cockatoos can bob along to a beat</li><li><b>Home:</b> cockatoos come from Australia and nearby islands</li></ul>
        <div class="row"><button class="btn" id="pOk">Back to the square</button><button class="btn alt" id="pWear">Shop</button></div></div></div>`);
  drawPortrait($('#pollyCv'), { crest: m ? m.crest : 'half', pose: m ? m.pose : 'idle' });
  $('#pOk').onclick = closeModal;
  $('#pWear').onclick = showShop;
}

/* ═══════════ Polly's shop ═══════════ */
function showShop() {
  openShop('polly', { api, toast, onChange: data => {
    S.bucks = data.bucks; S.me.polly = data.look; paintTools();
    if (S.scene) S.scene.setLook(look());
  } });
}

/* ═══════════ Stats, report, notes ═══════════ */
async function showStats() {
  openModal('<h2>Your stats</h2><div class="shimmer">Counting the town…</div>');
  try {
    const s = await api('polly/stats');
    const lean = s.lean == null ? '' : s.lean > 1 ? `You think people agree more than they do (+${s.lean.toFixed(1)}).`
      : s.lean < -1 ? `You think things are closer than they are (−${Math.abs(s.lean).toFixed(1)}).` : 'No lean. You read splits about right.';
    openModal(`<h2>Your stats</h2>
      ${statsHTML(s, { max: DAY_MAX, extra: `<ul class="statlines">
        ${s.avgMiss != null ? `<li>You're off by <b>${s.avgMiss.toFixed(1)}</b> on average.</li>` : ''}
        ${lean ? `<li>${lean}</li>` : ''}
        ${s.agree.n ? `<li>You sided with the majority <b>${s.agree.pct}%</b> of the time (${s.agree.n} ${s.agree.n === 1 ? 'question' : 'questions'}).</li>` : ''}
      </ul>`, note: `<p class="sub">Days are out of ${DAY_MAX}. Archive: ${s.archive.played} ${s.archive.played === 1 ? 'day' : 'days'} · average ${s.archive.avg}.</p>` })}
      ${S.me.signedIn ? '' : '<p class="sub">These are only saved on this device. <button class="link" id="statsSignin">Sign in</button> to take them with you.</p>'}`);
    const si = $('#statsSignin'); if (si) si.onclick = () => accountModal(accountUI());
  } catch (e) { openModal(`<h2>Your stats</h2><div class="note bad">${esc(e.message)}</div>`); }
}

function showReport(q) {
  const rv = q.reveal;
  openModal(`<h2>Report this question</h2>
    <p>“${esc(q.short)}”</p>
    <form id="rform"><div class="reasons">
      ${[['wrong', 'Number looks wrong'], ['wording', 'Confusing wording'], ['biased', 'Biased / unfair'], ['other', 'Other']].map(([k, t], i) => `<label><input type="radio" name="reason" value="${k}" ${i === 0 ? 'checked' : ''}> ${t}</label>`).join('')}
    </div>
    <textarea class="box" id="rnote" maxlength="300" placeholder="Anything to add? (needed for Other)"></textarea>
    <div class="msg" id="rmsg"></div>
    <div class="row"><button class="btn" type="submit" id="rsend">Send</button><button class="btn alt" type="button" id="rcancel">Cancel</button></div></form>`);
  $('#rcancel').onclick = closeModal;
  $('#rform').onsubmit = async e => {
    e.preventDefault();
    const reason = new FormData(e.target).get('reason'), note = $('#rnote').value.trim();
    if (reason === 'other' && !note) { $('#rmsg').innerHTML = '<div class="note warn">Tell us a little about it.</div>'; return; }
    $('#rsend').disabled = true;
    try {
      await api('polly/report', { guessId: rv.guessId, reason, note });
      rv.report = 'open'; closeModal(); toast('Thanks! We\'ll take a look.');
      const rp = $('#report'); if (rp) rp.outerHTML = '<span class="sub" style="margin:0">Reported</span>';
    } catch (err) { $('#rmsg').innerHTML = `<div class="note bad">${esc(err.message)}</div>`; $('#rsend').disabled = false; }
  };
}

function showNotifications(list) {
  const line = n => n.status === 'fixed' ? `Thanks! We fixed ‘${esc(n.short)}’. Your score was updated.`
    : n.status === 'retired' ? `Thanks! We've retired ‘${esc(n.short)}’.` : `We checked ‘${esc(n.short)}’ and the numbers stand.`;
  openModal(`<h2>Notes from the town hall</h2>${list.map(n => `<div class="note ${n.status === 'dismissed' ? '' : 'good'}" style="margin-bottom:8px">${line(n)}</div>`).join('')}
    <div class="row"><button class="btn" id="nOk">Got it</button></div>`);
  $('#nOk').onclick = closeModal;
}

/* ═══════════ Archive ═══════════ */
async function renderArchiveList() {
  dropScene(); S.ctx = null; paintHead();
  $('#main').innerHTML = loadingHTML('Unrolling old scrolls…');
  if (!S.today) await loadMeta();
  const d = await api('polly/archive');
  const rows = d.days.map(day => {
    const dateStr = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    // What they played on the day wins; otherwise their replay. One square per question, colored like the share text.
    const play = day.daily && day.daily.done ? day.daily : day.archive;
    const cells = [0, 1, 2].map(i => {
      const v = play ? play.slots[i] : null;
      return `<span class="${v == null ? '' : 'sq sq-' + band(v)}" title="Question ${i + 1}">${v == null ? '·' : v}</span>`;
    }).join('');
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
$('#statsBtn').onclick = showStats;
$('#acctBtn').onclick = () => accountModal(accountUI());
$('#shopBtn').onclick = showShop;
$('#unlBtn').onclick = () => { if (location.hash === '#/unlimited') loadUnlimited().catch(showError); else location.hash = '#/unlimited'; };

paintTools();
route();
