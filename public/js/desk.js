// The home page's little extras: the pixel "desk" along the bottom (one thing from each game, plus seasonal
// pieces), and the seasonal decorations (Halloween: cobwebs, a spider, a few bats). Everything is drawn on tiny
// canvases and scaled up crisp, like the games' sprites.
import { canvas, outline, bayer, mix } from './pixel.js';

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

/** Three books in the games' colors, stacked a little crooked. */
function books() {
  const c = canvas(32, 15), x = c.getContext('2d');
  const book = (bx, by, w, col, tilt) => {
    rect(x, bx, by, w, 4, col); rect(x, bx, by, w, 1, mix(col, '#ffffff', .25)); rect(x, bx + w - 3, by + 1, 3, 2, '#f3ead8');
    for (let i = 0; i < 3; i++) px(x, bx + w - 3 + i, by + 2, '#d8cfbd');
    rect(x, bx + 3, by + 1, 6, 2, mix(col, '#000000', .25)); px(x, bx + 4 + tilt, by + 2, '#f2c230');
  };
  book(1, 10, 30, '#d9482b', 0);   // Summit red
  book(3, 6, 26, '#2f8f4e', 1);    // Venn green
  book(0, 2, 27, '#1f8a8a', 2);    // Polly teal
  return outline(c, EDGE);
}

/** A mug with a little steam (and "WK" on it). */
function mug() {
  const c = canvas(16, 19), x = c.getContext('2d');
  [[5, 0], [6, 1], [5, 2], [6, 3], [9, 1], [10, 2], [9, 3], [10, 4]].forEach(([sx, sy]) => px(x, sx, sy, '#c9c1b2'));
  rect(x, 2, 6, 10, 12, '#f3ead8'); rect(x, 2, 6, 10, 2, '#5b371f'); rect(x, 2, 6, 1, 12, '#ffffff'); rect(x, 11, 8, 1, 10, '#d8cfbd');
  rect(x, 12, 9, 3, 1, '#f3ead8'); rect(x, 14, 9, 1, 6, '#f3ead8'); rect(x, 12, 14, 3, 1, '#f3ead8');
  rect(x, 4, 11, 1, 3, '#d9482b'); px(x, 5, 13, '#d9482b'); rect(x, 6, 11, 1, 3, '#d9482b'); px(x, 7, 13, '#d9482b'); rect(x, 8, 11, 1, 3, '#d9482b');
  return outline(c, EDGE);
}

/** Mel's vine growing out of a little clay pot. */
function plant() {
  const c = canvas(20, 26), x = c.getContext('2d');
  rect(x, 4, 17, 12, 2, '#c4643a'); rect(x, 5, 19, 10, 7, '#b0532c'); rect(x, 5, 19, 2, 7, '#c4643a'); rect(x, 5, 17, 10, 1, '#5b371f');
  let last = [10, 17];
  for (let t = 0; t <= 1.001; t += .04) {
    const p = [10 + Math.sin(t * Math.PI * 2.4) * 5, 17 - t * 16];
    line(x, last[0], last[1], p[0], p[1], '#2f6b3a'); last = p;
  }
  [[4, 11, 1], [13, 6, -1], [5, 3, 1]].forEach(([lx, ly]) => { rect(x, lx, ly, 3, 2, '#62bb62'); px(x, lx + 1, ly, '#4aa356'); });
  [[14, 1], [13, 2], [15, 2], [14, 3]].forEach(([fx, fy]) => px(x, fx, fy, '#f2c230')); px(x, 14, 2, '#fff6c8');
  return outline(c, EDGE);
}

/** A wind-up desk clock (puzzles reset at midnight). */
function clock() {
  const c = canvas(16, 17), x = c.getContext('2d');
  ellipse(x, 3, 2, 2, 1, '#c9a227'); ellipse(x, 12, 2, 2, 1, '#c9a227');
  ellipse(x, 8, 8, 6, 6, '#d9482b'); ellipse(x, 8, 8, 4, 4, '#f6efe2');
  line(x, 8, 8, 8, 5, INK); line(x, 8, 8, 10, 9, INK);
  line(x, 4, 13, 2, 16, '#5b371f'); line(x, 12, 13, 14, 16, '#5b371f');
  return outline(c, EDGE);
}

/** A bendy desk lamp. */
function lamp() {
  const c = canvas(28, 32), x = c.getContext('2d'), g = '#2f6b3a', gl = '#3f8a46';
  ellipse(x, 20, 30, 6, 1, g); rect(x, 15, 29, 11, 1, gl);
  line(x, 20, 29, 13, 16, '#46414f'); line(x, 21, 29, 14, 16, '#46414f');
  line(x, 13, 16, 9, 6, '#46414f'); line(x, 14, 16, 10, 6, '#46414f');
  for (let i = 0; i < 7; i++) rect(x, 3 + i, 4 + i, 9 - i, 1, i < 2 ? gl : g);
  rect(x, 2, 10, 3, 2, '#fff1a8');
  return outline(c, EDGE);
}

/** A cup of pencils (and a ruler). */
function pencilCup() {
  const c = canvas(13, 22), x = c.getContext('2d');
  [[3, 0, '#f2c230', '#e7798c'], [6, 2, '#d9482b', '#3a3230'], [9, 1, '#1f8a8a', '#f6efe2']].forEach(([px0, top, col, tip]) => { rect(x, px0, top + 1, 2, 12, col); rect(x, px0, top, 2, 1, tip); });
  rect(x, 1, 3, 2, 10, '#d8cfbd'); for (let y = 4; y < 12; y += 2) px(x, 2, y, '#8a857c');
  rect(x, 1, 11, 11, 11, '#5d8aa8'); rect(x, 1, 11, 11, 1, '#86aec7'); rect(x, 1, 11, 2, 11, '#86aec7'); rect(x, 10, 12, 2, 10, '#3f6a86');
  return outline(c, EDGE);
}

/** A crumpled-up paper ball. */
function paperBall() {
  const c = canvas(8, 7), x = c.getContext('2d');
  ellipse(x, 4, 3, 3, 3, '#f6f1e6'); [[2, 2], [4, 1], [5, 4], [3, 4], [6, 2]].forEach(([cx, cy]) => px(x, cx, cy, '#c9c1b2')); px(x, 2, 1, '#ffffff');
  return outline(c, EDGE);
}

/** Two dice. */
function dice() {
  const c = canvas(14, 7), x = c.getContext('2d');
  rect(x, 0, 1, 6, 6, '#f6f1e6'); rect(x, 0, 1, 6, 1, '#ffffff'); [[1, 2], [4, 5], [2, 3]].forEach(([cx, cy]) => px(x, cx, cy, INK));
  rect(x, 7, 0, 6, 6, '#d9482b'); rect(x, 7, 0, 6, 1, '#e8674c'); [[8, 1], [11, 1], [8, 4], [11, 4]].forEach(([cx, cy]) => px(x, cx, cy, '#f6efe2'));
  return outline(c, EDGE);
}

const THINGS = {
  books: { draw: books, label: 'Three game books' },
  mug: { draw: mug, label: 'A WK mug' },
  bell: { draw: bell, label: 'Polly’s bell' },
  clock: { draw: clock, label: 'A desk clock: new puzzles at midnight UTC' },
  plant: { draw: plant, label: 'Mel’s vine in a pot' },
  beanie: { draw: beanie, label: 'Skipper’s beanie' },
  lamp: { draw: lamp, label: 'A desk lamp' },
  pencils: { draw: pencilCup, label: 'A cup of pencils' },
  ball: { draw: paperBall, label: 'A crumpled-up first draft' },
  dice: { draw: dice, label: 'A pair of dice' },
  pumpkin: { draw: pumpkin, label: 'A jack-o’-lantern' },
  hat: { draw: witchHat, label: 'A witch’s hat' }
};

/* ───────────── the desk itself ───────────── */
const DW = 256, DH = 80, TOP = 42;          // low-res size; the desktop's surface starts at TOP

/** The wooden desk, plus everything that lies flat on it (papers and a pencil, the coffee ring, candy corn). */
function deskBase(theme) {
  const c = canvas(DW, DH), x = c.getContext('2d');
  const wood = '#b97c48', woodL = '#cf9560', woodD = '#8a5530', woodDD = '#6a3f22';
  // legs and the drawer
  [[8, 6], [DW - 14, 6]].forEach(([lx, w]) => { rect(x, lx, TOP + 12, w, DH - TOP - 12, woodD); rect(x, lx, TOP + 12, 1, DH - TOP - 12, wood); });
  rect(x, 92, TOP + 12, 72, 14, woodD); rect(x, 94, TOP + 13, 68, 11, wood); rect(x, 94, TOP + 13, 68, 1, woodL);
  rect(x, 125, TOP + 18, 6, 2, '#e0b45a'); px(x, 125, TOP + 18, '#fff1a8');
  // a sticky note on the drawer
  rect(x, 140, TOP + 14, 9, 8, '#f2d14a'); rect(x, 140, TOP + 14, 9, 1, '#e0b43a'); rect(x, 142, TOP + 17, 5, 1, '#8a6420'); rect(x, 142, TOP + 19, 3, 1, '#8a6420');
  // the desktop: a lit top seen from just above, then the front edge
  rect(x, 2, TOP, DW - 4, 8, wood); rect(x, 2, TOP, DW - 4, 1, woodL);
  for (let y = TOP + 2; y < TOP + 8; y += 2) for (let gx = 4 + (y * 7) % 13; gx < DW - 8; gx += 19 + (gx % 7)) rect(x, gx, y, 6 + (gx % 5), 1, '#a86f3e');
  rect(x, 0, TOP + 8, DW, 4, woodD); rect(x, 0, TOP + 8, DW, 1, woodDD); rect(x, 0, TOP + 11, DW, 1, woodDD);
  // papers and a pencil
  for (let i = 0; i < 6; i++) rect(x, 40 + i, TOP + 1 + i, 30, 1, '#ece4d0');
  for (let i = 0; i < 6; i++) rect(x, 50 - i, TOP + 1 + i, 32, 1, i === 0 ? '#ffffff' : '#f6f1e6');
  [TOP + 3, TOP + 5].forEach((ly, k) => rect(x, 52 - (ly - TOP), ly, 20 - k * 6, 1, '#b9b2a3'));
  line(x, 50, TOP + 6, 76, TOP + 2, '#f2c230'); line(x, 50, TOP + 7, 76, TOP + 3, '#d9a520'); px(x, 49, TOP + 7, '#3a3230'); px(x, 77, TOP + 2, '#e7798c');
  // a closed notebook under the lamp
  for (let i = 0; i < 6; i++) rect(x, 210 - i, TOP + 1 + i, 30, 1, i === 0 ? '#2f8f4e' : '#277a42');
  rect(x, 204, TOP + 6, 30, 1, '#f6f1e6'); rect(x, 222 - 3, TOP + 2, 2, 4, '#f2c230');
  // a coffee ring next to the mug
  for (let a = 0; a < 40; a++) {
    const an = a / 40 * Math.PI * 2, cx = Math.round(108 + Math.cos(an) * 5), cy = Math.round(TOP + 4 + Math.sin(an) * 1.6);
    if (a % 7) px(x, cx, cy, '#8a5a3a');
  }
  if (theme === 'halloween') {
    [[198, TOP + 3], [205, TOP + 5], [190, TOP + 6], [212, TOP + 2]].forEach(([cx, cy]) => {
      px(x, cx, cy, '#f6efe2'); rect(x, cx, cy + 1, 2, 1, '#e8743b'); rect(x, cx, cy + 2, 3, 1, '#f2c230');
    });
  }
  return outline(c, EDGE);
}

/** Where each thing sits: x and the row its base rests on (low-res), in back-to-front order. */
function layout(theme) {
  const spooky = theme === 'halloween';
  return [
    ['lamp', 224, TOP + 3], ['plant', 172, TOP + 4], ['books', 10, TOP + 5], ['pencils', 80, TOP + 4],
    [spooky ? 'pumpkin' : 'beanie', spooky ? 14 : 18, TOP - 9],
    ['clock', 150, TOP + 6], ['mug', 94, TOP + 6], ['bell', 126, TOP + 6],
    spooky ? ['hat', 190, TOP + 8] : null, spooky ? ['beanie', 54, TOP + 8] : null,
    ['ball', 116, TOP + 8], ['dice', 160, TOP + 9], ['ball', 214, TOP + 9], ['ball', 44, TOP + 9]
  ].filter(Boolean);
}

/** The desk along the bottom of the page. Each thing on it wiggles on hover or tap. */
export function renderDesk(el, theme) {
  setInk();
  el.innerHTML = '';
  const base = deskBase(theme);
  base.className = 'desk-base';
  el.appendChild(base);
  for (const [k, lx, by] of layout(theme)) {
    const cv = THINGS[k].draw();
    const t = document.createElement('span');
    t.className = 'thing'; t.title = THINGS[k].label;
    t.style.left = (lx / (DW + 2) * 100) + '%';
    t.style.bottom = ((DH + 2 - by) / (DH + 2) * 100) + '%';
    t.style.width = (cv.width / (DW + 2) * 100) + '%';
    cv.setAttribute('aria-hidden', 'true');
    t.appendChild(cv);
    const wiggle = () => { t.classList.remove('wig'); void t.offsetWidth; t.classList.add('wig'); };
    t.addEventListener('mouseenter', wiggle);
    t.addEventListener('click', wiggle);
    el.appendChild(t);
  }
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

/** Cobwebs in the window's top corners, a spider that drops on hover, and three bats that fly past once. */
export function decorate(theme, { masthead }) {
  setInk();
  document.documentElement.dataset.season = theme || '';
  document.querySelectorAll('.season-deco').forEach(n => n.remove());
  if (theme !== 'halloween') return;
  const web = cobweb().toDataURL(), sp = spider().toDataURL(), bats = batSheet().toDataURL();
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="season-deco web left" aria-hidden="true" style="background-image:url(${web})"></div>
    <div class="season-deco web right" aria-hidden="true" style="background-image:url(${web})">
      <span class="spider"><i class="thread"></i><img src="${sp}" alt=""></span>
    </div>`);
  masthead.insertAdjacentHTML('beforeend', `
    <div class="season-deco bats" aria-hidden="true">${[0, 1, 2].map(i => `<i class="bat" style="--i:${i};background-image:url(${bats})"></i>`).join('')}</div>`);
}

