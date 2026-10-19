// The home page's little extras: the pixel "desk" along the bottom (one thing from each game, plus seasonal
// pieces), and the seasonal decorations (Halloween: cobwebs, a spider, a few bats). Everything is drawn on tiny
// canvases and scaled up crisp, like the games' sprites.
import { canvas, outline, bayer } from './pixel.js';

const INK = '#1b1915';
// On dark paper the outlines and the dark critters switch to light ink, so nothing disappears.
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
let EDGE = INK, CRITTER = INK;
function setInk() { EDGE = dark() ? '#efe9dc' : INK; CRITTER = dark() ? '#d8d0c0' : INK; }
function px(x, cx, cy, c) { x.fillStyle = c; x.fillRect(Math.floor(cx), Math.floor(cy), 1, 1); }
function rect(x, cx, cy, w, h, c) { x.fillStyle = c; x.fillRect(Math.floor(cx), Math.floor(cy), Math.round(w), Math.round(h)); }
function ellipse(x, cx, cy, rx, ry, c) {
  x.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25))));
    x.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
function line(x, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { px(x, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}

/** Which seasonal theme is on today (the visitor's local date). `?season=halloween` / `?season=none` override it. */
export function season(d = new Date()) {
  const q = new URLSearchParams(location.search).get('season');
  if (q === 'halloween' || q === 'none') return q === 'none' ? '' : q;
  return d.getMonth() === 9 ? 'halloween' : '';
}

/* ───────────── things on the desk ───────────── */

/** Skipper's red beanie (Summit). */
function beanie() {
  const c = canvas(18, 14), x = c.getContext('2d');
  ellipse(x, 9, 2, 2, 2, '#f3ead8'); px(x, 8, 1, '#ffffff'); px(x, 10, 3, '#d8cfbd');
  for (let y = 4; y < 10; y++) {
    const w = Math.round(7.5 * Math.sqrt(1 - ((9.5 - y) / 6.5) ** 2));
    rect(x, 9 - w, y, w * 2 + 1, 1, '#d9482b');
    px(x, 9 - w + 1, y, '#e8674c'); px(x, 9 + w - 1, y, '#a8331c');
  }
  rect(x, 1, 10, 17, 4, '#b8381f');
  for (let i = 2; i < 17; i += 2) rect(x, i, 10, 1, 4, '#8f2a16');
  return outline(c, EDGE);
}

/** A curl of Mel's vine with a yellow flower (Venn). */
function vine() {
  const c = canvas(22, 14), x = c.getContext('2d');
  let last = null;
  for (let t = 0; t <= 1.001; t += .02) {
    const cx = 2 + t * 17, cy = 8 + Math.sin(t * Math.PI * 3) * 3.5;
    if (last) { line(x, last[0], last[1], cx, cy, '#2f6b3a'); line(x, last[0], last[1] - 1, cx, cy - 1, '#4aa356'); }
    last = [cx, cy];
  }
  [[6, 4, -1], [13, 11, 1]].forEach(([lx, ly, d]) => { rect(x, lx, ly, 3, 2, '#62bb62'); px(x, lx + (d > 0 ? 3 : -1), ly + (d > 0 ? 1 : 0), '#62bb62'); px(x, lx + 1, ly + (d > 0 ? 1 : 0), '#3f8a46'); });
  [[18, 3], [17, 4], [19, 4], [18, 5]].forEach(([fx, fy]) => px(x, fx, fy, '#f2c230')); px(x, 18, 4, '#fff6c8');
  return outline(c, EDGE);
}

/** Polly's brass hand bell (Polly). */
function bell() {
  const c = canvas(14, 17), x = c.getContext('2d');
  rect(x, 6, 0, 2, 5, '#7a5233'); px(x, 6, 0, '#9a6a3c');
  [[5, 2], [6, 2], [7, 3], [8, 3], [9, 4], [10, 4], [11, 5], [12, 6]].forEach(([y, w]) => {
    rect(x, 7 - w, y, w * 2, 1, '#b8862e'); px(x, 7 - w, y, '#e0b45a'); px(x, 7 + w - 1, y, '#8a6420');
  });
  rect(x, 0, 13, 14, 2, '#8a6420'); rect(x, 1, 13, 4, 1, '#e0b45a');
  rect(x, 6, 15, 2, 2, '#2b2b2b');
  return outline(c, EDGE);
}

/** A coffee-cup ring left on the paper. */
function coffeeRing() {
  const c = canvas(20, 10), x = c.getContext('2d');
  for (let a = 0; a < 120; a++) {
    const an = a / 120 * Math.PI * 2, rx = 8.5, ry = 3.6;
    const cx = Math.round(10 + Math.cos(an) * rx), cy = Math.round(5 + Math.sin(an) * ry);
    if (bayer(cx, cy) < .8) px(x, cx, cy, a % 9 < 6 ? '#8a5a3a' : '#a8744f');
  }
  [[4, 3], [14, 7], [12, 2]].forEach(([dx, dy]) => px(x, dx, dy, '#b38a6a'));
  return c;
}

/** A carved jack-o'-lantern (Halloween). */
function pumpkin() {
  const c = canvas(24, 19), x = c.getContext('2d');
  line(x, 12, 5, 12, 2, '#3f7f45'); line(x, 13, 5, 13, 1, '#2d6340'); px(x, 14, 0, '#2d6340'); px(x, 15, 0, '#3f7f45');
  ellipse(x, 12, 12, 11, 6, '#e8743b');
  for (const d of [-7, -3, 3, 7]) for (let y = 7; y <= 17; y++) {
    const bend = Math.round(d * .18 * Math.sin((y - 6) / 11 * Math.PI));
    if (((12 + d + bend - 12) / 11.5) ** 2 + ((y - 12) / 6.5) ** 2 < 1) px(x, 12 + d + bend, y, '#c95c27');
  }
  for (let y = 7; y < 11; y++) px(x, 5 + (y - 7) % 2, y, '#f29a5e');
  // the face: triangle eyes and a jagged grin, glowing
  const hole = '#3a1d0a', glow = '#f2c230';
  [[7, 9], [15, 9]].forEach(([ex, ey]) => { rect(x, ex, ey + 2, 3, 1, hole); rect(x, ex + 1, ey, 1, 2, hole); px(x, ex, ey + 1, hole); px(x, ex + 2, ey + 1, hole); px(x, ex + 1, ey + 1, glow); });
  px(x, 12, 12, hole);
  rect(x, 7, 14, 11, 2, hole);
  [8, 11, 14, 16].forEach(tx => px(x, tx, 14, '#e8743b'));
  [9, 12, 15].forEach(tx => px(x, tx, 15, glow));
  return outline(c, EDGE);
}

/** A witch's hat with an orange band and a crooked tip (Halloween). */
function witchHat() {
  const c = canvas(24, 20), x = c.getContext('2d'), k = '#2a2730', h = '#46414f';
  ellipse(x, 12, 17, 11, 2, k); rect(x, 3, 16, 18, 1, h);
  for (let y = 4; y < 16; y++) {
    const w = Math.round((y - 3) * .55), cx = 12 + Math.round((15 - y) * .12);
    rect(x, cx - w, y, w * 2 + 1, 1, k); px(x, cx - w, y, h);
  }
  line(x, 13, 4, 16, 1, k); line(x, 14, 4, 17, 1, k); px(x, 18, 1, k); px(x, 19, 2, k);
  rect(x, 6, 13, 13, 2, '#e8743b');
  rect(x, 11, 12, 4, 4, '#f2c230'); rect(x, 12, 13, 2, 2, k);
  return outline(c, EDGE);
}

const THINGS = {
  beanie: { draw: beanie, label: 'Skipper’s beanie' },
  vine: { draw: vine, label: 'A bit of Mel’s vine' },
  bell: { draw: bell, label: 'Polly’s bell' },
  coffee: { draw: coffeeRing, label: 'A coffee ring' },
  pumpkin: { draw: pumpkin, label: 'A jack-o’-lantern' },
  hat: { draw: witchHat, label: 'A witch’s hat' }
};

/** Fills the desk along the bottom of the page. Each thing wiggles on hover or tap. */
export function renderDesk(el, theme) {
  setInk();
  const order = theme === 'halloween' ? ['hat', 'beanie', 'coffee', 'pumpkin', 'vine', 'bell'] : ['beanie', 'coffee', 'vine', 'bell'];
  el.innerHTML = order.map(k => `<span class="thing" data-k="${k}" title="${THINGS[k].label}"></span>`).join('');
  el.querySelectorAll('.thing').forEach(t => {
    const cv = THINGS[t.dataset.k].draw();
    cv.setAttribute('aria-hidden', 'true');
    cv.style.setProperty('--w', cv.width);
    t.appendChild(cv);
    const wiggle = () => { t.classList.remove('wig'); void t.offsetWidth; t.classList.add('wig'); };
    t.addEventListener('mouseenter', wiggle);
    t.addEventListener('click', wiggle);
  });
}

/* ───────────── Halloween ───────────── */

/** A cobweb anchored in the top-left corner (mirror it with CSS for the right). */
function cobweb() {
  const S = 40, c = canvas(S, S), x = c.getContext('2d'), col = '#8f877a';
  const angles = [0, 15, 32, 48, 63, 77, 90].map(a => a * Math.PI / 180);
  angles.forEach(a => line(x, 0, 0, Math.cos(a) * (S - 2), Math.sin(a) * (S - 2), col));
  [7, 14, 22, 31].forEach((r, ri) => {
    for (let i = 0; i < angles.length - 1; i++) {
      const a0 = angles[i], a1 = angles[i + 1], sag = 1 + ri * .6;
      const p0 = [Math.cos(a0) * r, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
      const mid = [(p0[0] + p1[0]) / 2 - Math.cos((a0 + a1) / 2) * sag, (p0[1] + p1[1]) / 2 - Math.sin((a0 + a1) / 2) * sag];
      line(x, p0[0], p0[1], mid[0], mid[1], col); line(x, mid[0], mid[1], p1[0], p1[1], col);
    }
  });
  return c;
}

function spider() {
  const c = canvas(11, 9), x = c.getContext('2d'), k = CRITTER;
  ellipse(x, 5, 4, 2, 2, k); ellipse(x, 5, 7, 1, 1, k);
  [[1, 1], [0, 4], [1, 7], [9, 1], [10, 4], [9, 7]].forEach(([lx, ly]) => line(x, 5, 4, lx, ly, k));
  px(x, 4, 7, '#e8743b'); px(x, 6, 7, '#e8743b');
  return c;
}

/** Two frames side by side (a sprite sheet) of a small bat. */
function batSheet() {
  const c = canvas(28, 8), x = c.getContext('2d'), k = CRITTER;
  [0, 14].forEach((ox, f) => {
    ellipse(x, ox + 7, 4, 1, 2, k); px(x, ox + 6, 1, k); px(x, ox + 8, 1, k);
    if (f === 0) { line(x, ox + 6, 3, ox + 1, 1, k); line(x, ox + 1, 1, ox + 2, 4, k); line(x, ox + 8, 3, ox + 13, 1, k); line(x, ox + 13, 1, ox + 12, 4, k); rect(x, ox + 2, 2, 4, 2, k); rect(x, ox + 9, 2, 4, 2, k); }
    else { line(x, ox + 6, 4, ox + 1, 6, k); line(x, ox + 8, 4, ox + 13, 6, k); rect(x, ox + 3, 4, 3, 2, k); rect(x, ox + 9, 4, 3, 2, k); }
    px(x, ox + 6, 3, '#f2c230'); px(x, ox + 8, 3, '#f2c230');
  });
  return c;
}

/** Cobwebs in the top corners, a spider that drops on hover, three bats that fly past once, and a stamp by the title. */
export function decorate(theme, { sheet, masthead }) {
  setInk();
  document.documentElement.dataset.season = theme || '';
  document.querySelectorAll('.season-deco').forEach(n => n.remove());
  if (theme !== 'halloween') return;
  const web = cobweb().toDataURL(), sp = spider().toDataURL(), bats = batSheet().toDataURL();
  sheet.insertAdjacentHTML('afterbegin', `
    <div class="season-deco web left" aria-hidden="true" style="background-image:url(${web})"></div>
    <div class="season-deco web right" aria-hidden="true" style="background-image:url(${web})">
      <span class="spider"><i class="thread"></i><img src="${sp}" alt=""></span>
    </div>`);
  masthead.insertAdjacentHTML('beforeend', `
    <div class="season-deco bats" aria-hidden="true">${[0, 1, 2].map(i => `<i class="bat" style="--i:${i};background-image:url(${bats})"></i>`).join('')}</div>
    <span class="season-deco stamp" aria-hidden="true">Happy Halloween</span>`);
}

