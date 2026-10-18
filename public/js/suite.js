// WK Game Suite home page: one card per game (newest first) with today's status and streak, the
// WK streak, WK Bucks, the countdown to new puzzles, and one combined share for the day.
import { bucksIcon } from './bucks.js';
import { showAccount, signInReturn } from './account.js';
import { drawVennPreview } from './venn-scene.js';
import { bayer } from './pixel.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = { me: { signedIn: false }, data: null, previews: [] };

const GAMES = {
  venn: { name: 'Venn', pitch: 'Find what fits both.', href: '/venn', color: '#2f8f4e', draw: (cv, n) => drawVennPreview(cv, n) },
  summit: { name: 'Summit', pitch: 'Name something juuust right.', href: '/summit', color: '#d9482b', draw: drawSummitPreview }
};

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch('/api/' + path, { credentials: 'same-origin', ...opt });
  const data = await res.json().catch(() => ({ error: 'Lost the connection there. Try again?' }));
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modalX').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const accountUI = () => ({ me: S.me, api, openModal, closeModal, toast });

/* ── The title, stamped in letter by letter every time the page is shown ── */
function stampTitle() {
  const h = $('#title'), text = h.getAttribute('aria-label');
  h.innerHTML = [...text].map((ch, i) => (ch === ' ' ? ' ' : `<span style="--i:${i}" aria-hidden="true">${ch}</span>`)).join('');
  if (reduced()) return;
  h.classList.remove('stamp');
  void h.offsetWidth;            // restart the animation
  h.classList.add('stamp');
}
// Coming back with the browser's back button restores the old page from memory; stamp it again.
window.addEventListener('pageshow', e => { if (e.persisted) stampTitle(); });

/* ── Status lines ── */
function status(g) {
  if (g.key === 'venn') return g.done === 0 ? 'Not played yet' : g.done === 1 ? 'Round 1 done' : `${g.total} / ${g.max}`;
  if (g.done === 0) return 'Not played yet';
  if (g.done < g.of) return `${g.done} of ${g.of} stages`;
  return `${g.total.toLocaleString('en-US')} m`;
}

function render(d) {
  $('#bucks').innerHTML = `${bucksIcon()} <b>${d.bucks.balance.toLocaleString('en-US')}</b>`;
  $('#streak').innerHTML = `WK streak <b>${d.wkStreak}</b>`;
  $('#acct').textContent = S.me.signedIn ? 'Account' : 'Sign in';
  $('#adminLink').hidden = !S.me.isAdmin;
  $('#sharebar').hidden = !d.games.some(g => g.done > 0);
  $('#games').innerHTML = d.games.map(g => {
    const m = GAMES[g.key];
    return `<a class="game" href="${m.href}" data-key="${g.key}" style="--block:${m.color}">
      <div class="block"><canvas width="64" height="44" aria-hidden="true"></canvas>${g.isNew ? '<span class="sticker">NEW</span>' : ''}</div>
      <div class="info"><h2>${esc(m.name)}</h2><p class="pitch">${esc(m.pitch)}</p>
        <div class="facts"><span class="fact today ${g.done ? 'played' : ''}">${esc(status(g))}</span><span class="fact">Streak <b>${g.streak}</b></span></div></div></a>`;
  }).join('');
  S.previews = [...document.querySelectorAll('.game')].map(card => ({ card, cv: card.querySelector('canvas'), draw: GAMES[card.dataset.key].draw, n: 0, fast: false, last: 0 }));
  S.previews.forEach(p => {
    p.draw(p.cv, 0);
    const on = () => { p.fast = true; }, off = () => { p.fast = false; };
    p.card.addEventListener('mouseenter', on); p.card.addEventListener('mouseleave', off);
    p.card.addEventListener('focus', on); p.card.addEventListener('blur', off);
    p.card.addEventListener('click', e => openGame(e, p.card));
  });
}

/* ── Previews: slow when idle, quicker while a card is hovered or focused ── */
function loop(now) {
  S.previews.forEach(p => {
    const gap = p.fast ? 80 : 400;
    if (reduced() || now - p.last < gap) return;
    p.last = now; p.n++;
    p.draw(p.cv, p.n);
  });
  requestAnimationFrame(loop);
}

/** Summit's cable car riding between two stations, on a 64×44 canvas. */
function drawSummitPreview(cv, n) {
  const W = 64, H = 44, x = cv.getContext('2d');
  if (cv.width !== W) { cv.width = W; cv.height = H; }
  const f = (c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  f('#9dcdf1', 0, 0, W, H);
  for (let y = 0; y < 16; y++) for (let i = 0; i < W; i++) if (bayer(i, y) < .5 - y / 32) f('#c3e2f6', i, y + 6, 1, 1);
  const ridge = (c, base, peaks) => { for (let i = 0; i < W; i++) { let top = H; peaks.forEach(([px, py, s]) => { top = Math.min(top, py + Math.abs(i - px) * s); }); f(c, i, Math.min(top, base), 1, H); } };
  ridge('#7a99b4', H, [[18, 14, .9], [48, 10, .8]]);
  ridge('#5c8e4b', H, [[6, 30, .6], [58, 12, .9], [32, 34, .3]]);
  ridge('#2d6340', H, [[0, 38, .2], [64, 36, .1]]);
  f('#f3ead8', 57, 11, 3, 2);
  // stations + cable
  f('#a86c42', 2, 25, 8, 5); f('#c2482f', 1, 23, 10, 2);
  f('#a86c42', 54, 7, 8, 5); f('#c2482f', 53, 5, 10, 2);
  const P0 = { x: 8, y: 24 }, C = { x: 32, y: 30 }, P2 = { x: 56, y: 6 };
  const at = t => { const u = 1 - t; return { x: u * u * P0.x + 2 * u * t * C.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * C.y + t * t * P2.y }; };
  for (let i = 0; i <= 80; i++) { const p = at(i / 80); f('#2a313b', Math.round(p.x), Math.round(p.y), 1, 1); }
  const t = .5 + .38 * Math.sin(n / 7), p = at(t), cx = Math.round(p.x), cy = Math.round(p.y);
  f('#59636f', cx, cy, 1, 3);
  f('#1d1410', cx - 4, cy + 3, 9, 8); f('#d9482b', cx - 3, cy + 4, 7, 6); f('#bfe3f5', cx - 2, cy + 5, 5, 2);
  f('#f7f1e5', cx - 1, cy + 5, 2, 2); if (n % 12 !== 0) f('#1d1410', cx - 1, cy + 5, 1, 1);
  f('#a8331c', cx - 3, cy + 9, 7, 1);
}

/* ── Opening a game: a short blocky dissolve in the game's color ── */
function openGame(e, card) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || reduced()) return;
  e.preventDefault();
  const href = card.getAttribute('href'), color = getComputedStyle(card).getPropertyValue('--block').trim() || '#1b1915';
  const cv = $('#wipe'), B = 24, cols = Math.ceil(innerWidth / B), rows = Math.ceil(innerHeight / B);
  cv.width = cols; cv.height = rows; cv.style.imageRendering = 'pixelated'; cv.classList.add('on');
  const x = cv.getContext('2d');
  x.fillStyle = color;
  const order = Array.from({ length: cols * rows }, (_, i) => i).sort(() => Math.random() - .5);
  const start = performance.now(), dur = 300;
  let done = 0;
  const step = now => {
    const want = Math.min(order.length, Math.ceil((now - start) / dur * order.length));
    for (; done < want; done++) x.fillRect(order[done] % cols, Math.floor(order[done] / cols), 1, 1);
    if (done < order.length) requestAnimationFrame(step); else location.href = href;
  };
  requestAnimationFrame(step);
}
// Coming back with the browser's back button shouldn't show a finished wipe.
window.addEventListener('pageshow', () => { const w = $('#wipe'); w.classList.remove('on'); if (w.getContext) w.getContext('2d').clearRect(0, 0, w.width, w.height); });

/* ── Countdown to midnight UTC ── */
function tick() {
  if (!S.data) return;
  const ms = new Date(S.data.nextReset).getTime() - Date.now();
  const b = $('#reset b');
  if (ms <= 0) { b.textContent = '00:00:00'; load(); return; }
  const s = Math.floor(ms / 1000);
  b.textContent = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(v => String(v).padStart(2, '0')).join(':');
}

/* ── Combined share ── */
$('#share').onclick = async () => {
  const b = $('#share'); b.disabled = true;
  try {
    const { text } = await api('suite/share');
    if (!text) { toast('Play something first.'); return; }
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch { /* copy instead */ } }
    try { await navigator.clipboard.writeText(text); toast('Copied.'); }
    catch { openModal(`<h2>Share</h2><textarea class="pin" readonly style="height:180px;padding:10px">${esc(text)}</textarea>`); const ta = $('#modalBody textarea'); ta.focus(); ta.select(); }
  } catch (e) { toast(e.message); } finally { b.disabled = false; }
};
$('#acct').onclick = () => showAccount(accountUI());

async function load() {
  try {
    const d = await api('suite/today');
    S.data = d; S.me = d.me;
    render(d); tick();
  } catch (e) { $('#games').innerHTML = `<p class="note bad">${esc(e.message)}</p>`; }
}

stampTitle();
await load();
signInReturn(accountUI());
setInterval(tick, 1000);
requestAnimationFrame(loop);
// Coming back to this tab after playing: refresh the status lines.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
