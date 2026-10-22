// WK Game Suite home page: one card per game (newest first) with today's status and streak, the
// WK streak, WK Bucks, the countdown to new puzzles, and one combined share for the day.
import { bucksIcon } from './bucks.js';
import { showAccount, signInReturn } from './account.js';
import { openModal, closeModal } from './modal.js';
import { drawVennPreview } from './venn-scene.js';
import { drawPollyPreview } from './polly-scene.js';
import { bayer, skipperPortrait } from './pixel.js';
import { melPortrait } from './mel.js';
import { pollyPortrait } from './polly-sprites.js';
import { renderDesk, decorate, season } from './desk.js';
import { api } from './net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = { me: { signedIn: false }, data: null, previews: [] };

const GAMES = {
  polly: { name: 'Polly', pitch: 'Guess what America said', href: '/polly', color: '#1f8a8a', draw: (cv, n) => drawPollyPreview(cv, n) },
  venn: { name: 'Venn', pitch: 'Find what fits both', href: '/venn', color: '#2f8f4e', draw: (cv, n) => drawVennPreview(cv, n) },
  summit: { name: 'Summit', pitch: 'Name something juuust right', href: '/summit', color: '#d9482b', draw: drawSummitPreview }
};

// Games by other people. `by` is the credit shown; leave it '' if the site doesn't say who made it.
const SIMILAR = [
  { name: 'Krillion', url: 'https://krillion.io', pitch: 'The daily dive: name the most obscure answer', by: '' },
  { name: 'Noillirk', url: 'https://noillirkdailygame.com', pitch: 'Give the most common answer and climb the highest', by: '' },
  { name: 'Chainle', url: 'https://chainle.io', pitch: 'Find the word that connects the others', by: 'the younger brother of Krillion’s maker' },
  { name: 'FactMap', url: 'https://factmap.world', pitch: 'A daily game on the world map', by: '' },
  { name: 'NYT Games', url: 'https://www.nytco.com/games', pitch: 'Wordle, Connections, Spelling Bee and more', by: 'The New York Times' },
  { name: 'Sortie!', url: 'https://dailysortie.com', pitch: 'Answer prompts to fly as far as you can.', by: '' }
];

function renderSimilar() {
  $('#others').innerHTML = SIMILAR.map(g => {
    const host = new URL(g.url).host.replace(/^www\./, '') + new URL(g.url).pathname.replace(/\/$/, '');
    return `<li><a class="other" href="${esc(g.url)}" target="_blank" rel="noopener">
      <span class="oname">${esc(g.name)} <i aria-hidden="true">↗</i></span>
      <span class="opitch">${esc(g.pitch)}</span>
      <span class="oby">${g.by ? `By ${esc(g.by)} · ` : 'Independent · '}${esc(host)}</span>
      <span class="sr-only"> (opens in a new tab)</span></a></li>`;
  }).join('');
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
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
  if (g.key === 'polly') return g.noPoll && !g.done ? 'No poll today' : g.done === 0 ? 'Not played yet' : g.done < g.of ? `${g.done} of ${g.of} answered` : `${g.total}/${g.max}`;
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
  // The "buy me a coffee" link shows only when TIP_URL is set.
  $('#tipcard').hidden = $('#tipFoot').hidden = !d.tipUrl;
  if (d.tipUrl) { $('#tipLink').href = d.tipUrl; $('#tipFoot').href = d.tipUrl; }
  $('#sharebar').hidden = !d.games.some(g => g.done > 0);
  $('#games').innerHTML = d.games.map(g => {
    const m = GAMES[g.key];
    return `<a class="game" href="${m.href}" data-key="${g.key}" style="--block:${m.color}">
      <div class="block"><canvas width="64" height="44" aria-hidden="true"></canvas>${g.isNew ? '<span class="sticker">NEW</span>' : ''}</div>
      <div class="info"><h2>${esc(m.name)}</h2><p class="pitch">${esc(m.pitch)}</p>
        <div class="facts"><span class="fact today ${g.done ? 'played' : ''}">${esc(status(g))}</span><span class="fact">Streak <b>${g.streak}</b></span></div></div></a>`;
  }).join('');
  renderPets(d.pets);
  S.previews = [...document.querySelectorAll('.game')].map(card => ({ card, cv: card.querySelector('canvas'), draw: GAMES[card.dataset.key].draw, n: 0, fast: false, last: 0 }));
  S.previews.forEach(p => {
    p.draw(p.cv, 0);
    const on = () => { p.fast = true; }, off = () => { p.fast = false; };
    p.card.addEventListener('mouseenter', on); p.card.addEventListener('mouseleave', off);
    p.card.addEventListener('focus', on); p.card.addEventListener('blur', off);
    p.card.addEventListener('click', e => openGame(e, p.card));
  });
}

/* ── The pet corner link: the three pets in their outfits ── */
function renderPets(p) {
  if (!p) return;
  const pics = [skipperPortrait('smile', false, 0, p.skipper), melPortrait(p.mel, { mood: 'smile' }), pollyPortrait(p.polly, {})];
  const box = $('#petpics'); box.innerHTML = '';
  pics.forEach(c => { c.className = 'petpic'; box.appendChild(c); });
  const names = [p.skipper.name || 'Skipper', p.mel.name || 'Mel', p.polly.name || 'Polly'].map(esc);
  $('#petnames').innerHTML = `${names[0]}, ${names[1]} and ${names[2]} are hanging out`;
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
  if (ms <= 0) { showClock('00:00:00'); load(); return; }
  const s = Math.floor(ms / 1000);
  showClock([Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(v => String(v).padStart(2, '0')).join(':'));
}

/** The countdown as split-flap tiles: a digit that changes flips over (two frames). */
function showClock(text) {
  $('#resetText').textContent = text;
  const box = $('#flaps');
  if (box.children.length !== text.length) box.innerHTML = [...text].map(ch => (ch === ':' ? '<i class="colon">:</i>' : '<i class="flap"></i>')).join('');
  [...text].forEach((ch, i) => {
    const el = box.children[i];
    if (ch === ':' || el.textContent === ch) return;
    el.textContent = ch;
    if (!reduced()) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
  });
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
renderSimilar();
const theme = season();
decorate(theme, { masthead: $('.masthead') });
renderDesk($('#desk'), theme);
// Switching light/dark redraws them in the right ink (without replaying the bats).
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderDesk($('#desk'), theme); decorate(theme, { masthead: $('.masthead') }); document.querySelectorAll('.bat').forEach(b => b.remove()); });
await load();
signInReturn(accountUI());
setInterval(tick, 1000);
requestAnimationFrame(loop);
// Coming back to this tab after playing: refresh the status lines.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
