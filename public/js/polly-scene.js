// Polly's town square, in pixel art on a 320×150 canvas scaled up crisp. Back to front: a dithered sky with
// drifting clouds (stars and a moon at night), the town hall with a clock tower showing UTC, shops with
// striped awnings, orange/teal bunting, the two side banners, cobbles tinted orange (left) and teal (right),
// the fountain and the podium where Polly stands, 30 townsfolk, and the square's small life.
import * as P from './pixel.js';
import {
  pollySprite, personSprite, personLook, pigeonSprite, catSprite, duckSprite, cartSprite, paperSprite,
  drawText, textWidth, LEFT, RIGHT, INK, POLLY_W, POLLY_FEET
} from './polly-sprites.js';
import { TOWNSFOLK } from './polly-score.js';
import { POLLY_DEFAULT_LOOK } from './polly-wardrobe.js';

export const W = 320, H = 150;
const GROUND = 96, MID = 160, PODIUM_TOP = 117, FOUNTAIN_Y = 112, PODIUM_Y = 131;
const POLLY_X = MID - 16, POLLY_Y = PODIUM_TOP - POLLY_FEET;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Four palettes by the player's local time, the same as Summit. */
export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
}
const TINT = { morning: ['#f2a07f', .12], day: null, evening: ['#5b2f6c', .26], night: ['#0a1330', .52] };
const tinter = tod => { const t = TINT[tod]; return c => (t ? P.mix(c, t[0], t[1]) : c); };
const isLit = tod => tod === 'evening' || tod === 'night';

function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), Math.round(w), Math.round(h)); }
function ellipse(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25))));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

/* ───────────── static layers ───────────── */

function paintSky(tod, r) {
  const pal = P.palette(1, tod);
  const c = P.canvas(W + 4, GROUND + 4), x = c.getContext('2d');
  P.drawSky(x, W + 4, GROUND + 4, pal);
  if (tod === 'night') {
    for (let i = 0; i < 70; i++) px(x, r() * (W + 4), r() * 60, r() < .2 ? '#fff6c8' : '#ffffff');
    x.drawImage(P.sunSprite(pal, true), 262, 6);
  } else x.drawImage(P.sunSprite(pal, false), tod === 'morning' ? 26 : tod === 'evening' ? 278 : 236, tod === 'day' ? 4 : 18);
  return { canvas: c, pal };
}

const SHOPS = [
  { name: 'Bakery', x: 2, w: 56, top: 30, wall: '#e6c9a8', trim: '#c9a47e', awn: ['#c0392b', '#f4efe6'] },
  { name: 'Books', x: 60, w: 56, top: 22, wall: '#7d8f6a', trim: '#5f7050', awn: ['#2f4f6f', '#f4efe6'] },
  { name: 'Hardware', x: 204, w: 56, top: 24, wall: '#9c7b5a', trim: '#7a5e43', awn: ['#3f6f45', '#f4efe6'] },
  { name: 'Cafe', x: 262, w: 56, top: 32, wall: '#c98a8a', trim: '#a86b6b', awn: ['#6b4423', '#f3e3c3'] }
];

function drawShop(x, s, t, lit) {
  const bottom = GROUND;
  rect(x, s.x, s.top, s.w, bottom - s.top, t(s.wall));
  rect(x, s.x - 1, s.top - 3, s.w + 2, 3, t(s.trim)); rect(x, s.x - 1, s.top - 4, s.w + 2, 1, t(P.mix(s.trim, '#000000', .3)));
  for (let yy = s.top; yy < bottom; yy += 4) for (let xx = s.x + ((yy / 4) % 2) * 3; xx < s.x + s.w; xx += 7) px(x, xx, yy, t(P.mix(s.wall, '#000000', .08)));
  const win = lit ? '#ffd66e' : t('#9fc4d8'), win2 = lit ? '#ffb648' : t('#7fa6bd');
  // upper windows
  for (let i = 0; i < 2; i++) {
    const wx = s.x + 9 + i * 26, wy = s.top + 5;
    rect(x, wx - 1, wy - 1, 12, 12, t(s.trim)); rect(x, wx, wy, 10, 10, win); rect(x, wx, wy + 6, 10, 4, win2); rect(x, wx + 4, wy, 2, 10, t(s.trim));
  }
  // sign, awning, shop window and door
  const sy = s.top + 19;
  rect(x, s.x + 6, sy, s.w - 12, 8, t('#2a2420')); drawText(x, s.name, s.x + Math.round((s.w - textWidth(s.name)) / 2), sy + 2, t('#f3e6c4'));
  const ay = sy + 10;
  for (let xx = s.x - 1; xx < s.x + s.w + 1; xx++) {
    const stripe = Math.floor((xx - s.x) / 4) % 2 ? s.awn[1] : s.awn[0];
    rect(x, xx, ay, 1, 6, t(stripe));
    if ((xx - s.x) % 4 < 3) px(x, xx, ay + 6, t(stripe));
  }
  rect(x, s.x - 1, ay, s.w + 2, 1, t(P.mix(s.awn[0], '#000000', .3)));
  const wy = ay + 9;
  rect(x, s.x + 4, wy - 1, 30, bottom - wy - 2, t(s.trim)); rect(x, s.x + 5, wy, 28, bottom - wy - 4, win);
  for (let i = 0; i < 4; i++) rect(x, s.x + 8 + i * 6, bottom - 9, 4, 3, t(['#c98a3a', '#e8d7b0', '#8a5a3a', '#d06f8a'][(i + s.x) % 4]));
  rect(x, s.x + 40, wy - 2, 11, bottom - wy + 2, t(s.trim)); rect(x, s.x + 41, wy - 1, 9, bottom - wy + 1, t('#5b3b27'));
  rect(x, s.x + 42, wy + 1, 7, 6, lit ? '#ffb648' : t('#7fa6bd')); px(x, s.x + 48, wy + 10, t('#f2c13d'));
  rect(x, s.x + 38, bottom - 2, 15, 2, t('#8a857c'));                    // the step
}

function drawHall(x, t, lit) {
  const brick = t('#b5654a'), brick2 = t('#9a5039'), stone = t('#d8cfc0'), stone2 = t('#b9ae9c');
  // main building and its pediment
  rect(x, 118, 40, 84, GROUND - 40, brick);
  for (let yy = 42; yy < GROUND; yy += 3) for (let xx = 118 + ((yy / 3) % 2) * 3; xx < 202; xx += 6) rect(x, xx, yy, 5, 1, brick2);
  for (let i = 0; i < 12; i++) rect(x, 116 + i, 40 - i, 88 - i * 2, 1, stone);
  rect(x, 116, 40, 88, 2, stone2);
  for (const cx of [121, 133, 187, 199]) rect(x, cx - 1, 42, 3, GROUND - 42, stone);   // pilasters
  // windows (glow at evening and night)
  const win = lit ? '#ffd66e' : t('#9fc4d8');
  for (const wx of [125, 139, 175, 189]) for (const wy of [48, 70]) {
    rect(x, wx - 1, wy - 1, 9, 15, stone); rect(x, wx, wy, 7, 13, win); rect(x, wx + 3, wy, 1, 13, stone2); px(x, wx, wy, stone); px(x, wx + 6, wy, stone);
  }
  // door and steps
  rect(x, 150, 66, 20, GROUND - 66, stone); ellipse(x, 160, 66, 9, 4, stone);
  rect(x, 152, 67, 16, GROUND - 67, t('#5b3b27')); ellipse(x, 160, 67, 7, 3, t('#5b3b27')); rect(x, 159, 66, 2, GROUND - 66, t('#3e2817'));
  rect(x, 146, GROUND - 4, 28, 2, stone2); rect(x, 144, GROUND - 2, 32, 2, stone);
  // clock tower
  rect(x, 148, 6, 24, 36, stone); rect(x, 148, 6, 2, 36, stone2); rect(x, 170, 6, 2, 36, stone2);
  for (let i = 0; i < 9; i++) rect(x, 146 + i, 6 - i, 28 - i * 2, 1, t('#4f5862'));
  rect(x, 159, -4, 2, 3, t('#4f5862')); px(x, 160, -5, t('#f2c13d'));
  ellipse(x, 160, 24, 8, 8, t('#3e2817')); ellipse(x, 160, 24, 7, 7, '#f6efe2');
  for (let h = 0; h < 12; h++) { const a = h / 12 * Math.PI * 2; px(x, 160 + Math.round(Math.sin(a) * 6), 24 - Math.round(Math.cos(a) * 6), INK); }
  rect(x, 152, 34, 16, 4, stone2); drawText(x, 'UTC', 155, 35, t('#5b3b27'));
}

/** The square's paving with the side tint: a 25% dither of orange (left) or teal (right) over the paving, split at the fountain. */
function drawGround(x, kind, t, tod) {
  const base = { cobbles: ['#9a958c', '#7d786f', '#b3aea4'], brick: ['#a4523f', '#7a3a2c', '#bf6b55'], herringbone: ['#b8a98f', '#8a7d66', '#d0c3aa'] }[kind] || ['#9a958c', '#7d786f', '#b3aea4'];
  const [b, m, hl] = base.map(t);
  for (let y = GROUND; y < H; y++) for (let xx = 0; xx < W; xx++) {
    let c = b;
    const gy = y - GROUND;
    if (kind === 'brick') {
      const row = Math.floor(gy / 4), off = row % 2 ? 4 : 0;
      if (gy % 4 === 3 || (xx + off) % 8 === 7) c = m; else if (gy % 4 === 0) c = hl;
    } else if (kind === 'herringbone') {
      const u = (xx + gy) % 12, v = (xx - gy + 120) % 12;
      if ((Math.floor((xx + gy) / 6) % 2 ? u : v) === 0) c = m; else if (((xx + gy) % 6) === 1) c = hl;
    } else {
      const row = Math.floor(gy / 4), off = row % 2 ? 3 : 0, cx = (xx + off) % 6;
      if (gy % 4 === 3 || cx === 5) c = m; else if (gy % 4 === 0 && cx < 2) c = hl;
    }
    if (P.bayer(xx, y) < .25) c = P.mix(c, xx < MID ? LEFT : RIGHT, .78);
    px(x, xx, y, c);
  }
  // building shadows: long in the morning and evening, short by day, none at night
  const len = tod === 'night' ? 0 : tod === 'day' ? 2 : 5;
  x.fillStyle = 'rgba(20, 14, 10, .22)';
  if (len) x.fillRect(0, GROUND, W, len);
  rect(x, 0, GROUND, W, 1, t('#6f6a62'));
}

const LAMPS = [86, 234];
function drawLamp(x, lx, kind, t, lit) {
  const base = 118, pole = t('#2a2730');
  rect(x, lx - 2, base - 2, 5, 2, pole); rect(x, lx, base - 26, 1, 24, pole);
  const light = lit ? '#ffe39a' : t('#c9d6dc');
  if (kind === 'globe') { ellipse(x, lx, base - 29, 3, 3, lit ? '#fff4c8' : t('#eef2f0')); px(x, lx - 1, base - 30, '#ffffff'); }
  else if (kind === 'gas') {
    rect(x, lx - 4, base - 24, 9, 1, pole);
    for (const d of [-4, 4]) { rect(x, lx + d - 1, base - 28, 3, 4, pole); px(x, lx + d, base - 27, light); px(x, lx + d, base - 26, light); }
  } else { rect(x, lx - 2, base - 31, 5, 5, pole); rect(x, lx - 1, base - 30, 3, 3, light); rect(x, lx - 3, base - 32, 7, 1, pole); }
  if (lit) {
    for (let y = -10; y <= 10; y++) for (let xx = -10; xx <= 10; xx++) {
      const d = Math.hypot(xx, y);
      if (d > 3 && d < 10 && P.bayer(lx + xx, base - 28 + y) < .5 - d / 22) px(x, lx + xx, base - 28 + y, '#ffd66e');
    }
  }
}

/** Bunting across the top of the square, always orange and teal. */
function drawBunting(x, kind, lit) {
  const strings = [[[2, 33], [116, 38], 10], [[118, 41], [202, 41], 5], [[204, 38], [318, 33], 10]];
  let n = 0;
  strings.forEach(([a, b, sag]) => {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, xx = a[0] + (b[0] - a[0]) * t, yy = a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * sag;
      pts.push([Math.round(xx), Math.round(yy)]);
    }
    pts.forEach(([xx, yy]) => px(x, xx, yy, '#3a3230'));
    const step = kind === 'lights' ? 4 : 6;
    for (let i = 0; i < pts.length; i++) {
      const [xx, yy] = pts[i];
      if ((xx - a[0]) % step !== 0 || (i && pts[i - 1][0] === xx)) continue;
      const c = n++ % 2 ? RIGHT : LEFT, d = P.mix(c, '#000000', .25);
      if (kind === 'pennants') { rect(x, xx - 1, yy + 1, 3, 3, c); px(x, xx + 1, yy + 3, d); }
      else if (kind === 'lanterns') { rect(x, xx - 1, yy + 1, 3, 1, '#3a3230'); ellipse(x, xx, yy + 4, 2, 2, c); px(x, xx, yy + 4, lit ? '#fff4c8' : P.mix(c, '#ffffff', .3)); rect(x, xx - 1, yy + 7, 3, 1, '#3a3230'); }
      else if (kind === 'lights') { rect(x, xx, yy + 1, 1, 2, lit ? P.mix(c, '#ffffff', .45) : c); if (lit) { px(x, xx - 1, yy + 2, c); px(x, xx + 1, yy + 2, c); px(x, xx, yy + 3, c); } }
      else { for (let k = 0; k < 4; k++) rect(x, xx - 2 + Math.ceil(k / 2), yy + 1 + k, 4 - k, 1, k === 0 ? d : c); }
    }
  });
}

function paintFountain(kind, t) {
  const c = P.canvas(56, 30), x = c.getContext('2d'), cx = 28;
  const stone = { stone: ['#a39e94', '#8a857c', '#c9c4b8'], marble: ['#e9e6df', '#c8c3b8', '#ffffff'], lions: ['#a39e94', '#8a857c', '#c9c4b8'], golden: ['#e0b23a', '#b8862e', '#f6d77a'] }[kind] || ['#a39e94', '#8a857c', '#c9c4b8'];
  const [s, s2, s3] = stone.map(t);
  // pedestal and the top bowl
  rect(x, cx - 2, 6, 5, 16, s2); rect(x, cx - 2, 6, 1, 16, s3);
  if (kind === 'marble') { ellipse(x, cx, 10, 9, 2, s); ellipse(x, cx, 9, 7, 1, t('#6fa8c8')); rect(x, cx - 1, 2, 3, 5, s); ellipse(x, cx, 2, 3, 1, s); }
  else { ellipse(x, cx, 6, 5, 2, s); ellipse(x, cx, 5, 4, 1, t('#6fa8c8')); }
  if (kind === 'lions') for (const d of [-4, 3]) { rect(x, cx + d, 12, 2, 3, '#c8901f'); px(x, cx + d + (d < 0 ? 0 : 1), 13, INK); }
  // the basin
  ellipse(x, cx, 23, 25, 5, s2); ellipse(x, cx, 21, 25, 4, s); ellipse(x, cx, 21, 22, 3, t('#5f97b8')); ellipse(x, cx, 20, 19, 2, t('#6fa8c8'));
  for (let i = -24; i <= 24; i += 6) px(x, cx + i, 24, s3);
  rect(x, cx - 2, 18, 5, 4, s2);
  return c;
}

function paintPodium(t) {
  const c = P.canvas(32, 16), x = c.getContext('2d');
  const s = t('#a39e94'), s2 = t('#8a857c'), s3 = t('#c9c4b8');
  rect(x, 1, 0, 30, 3, s3); rect(x, 1, 2, 30, 1, s2);
  rect(x, 3, 3, 26, 10, s); rect(x, 3, 3, 2, 10, s3); rect(x, 27, 3, 2, 10, s2);
  rect(x, 9, 6, 14, 4, s2); rect(x, 10, 7, 12, 2, s3);
  rect(x, 0, 13, 32, 3, s2);
  return c;
}

/** One side banner: a tall orange or teal cloth with the side label in white pixel letters, top to bottom. */
function paintBanner(label, color) {
  const chars = [...String(label || '').toUpperCase()].slice(0, 14);
  const hgt = 8 + chars.reduce((h, ch) => h + (ch === ' ' ? 3 : 6), 0) + 6;
  const c = P.canvas(15, Math.max(30, hgt)), x = c.getContext('2d'), d = P.mix(color, '#000000', .22);
  rect(x, 0, 0, 15, 2, '#5b3b24');
  rect(x, 1, 2, 13, c.height - 6, color); rect(x, 1, 2, 1, c.height - 6, d); rect(x, 13, 2, 1, c.height - 6, d);
  for (let i = 0; i < 4; i++) { rect(x, 1 + i, c.height - 4 + i, 6 - i * 2 > 0 ? 6 - i : 1, 1, color); rect(x, 8 + i, c.height - 4 + i, 6 - i, 1, color); }
  let y = 6;
  chars.forEach(ch => { if (ch === ' ') { y += 3; return; } drawText(x, ch, 6, y, '#ffffff'); y += 6; });
  return c;
}

/* ───────────── the world (layers + everyone in it) ───────────── */

/** Mill area (the middle of the square), and where each side gathers on a reveal. */
const MILL = { x0: 92, x1: 228, y0: 101, y1: 147 };
const blocked = (x, y) => (x > 132 && x < 188 && y > 99 && y < 113) || (x > 140 && x < 180 && y >= 113 && y < 133);
function randomSpot(r, box) {
  for (let i = 0; i < 40; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (box.y1 - box.y0);
    if (!blocked(x, y)) return { x, y };
  }
  return { x: box.x0, y: box.y1 };
}
function sideSpots(left, n) {
  const ax = left ? 64 : 256, ay = 125, pts = [];
  for (let y = 101; y <= 146; y += 6) for (let x = left ? 6 : 166; x <= (left ? 154 : 314); x += 8) {
    const jx = x + ((y / 6) % 2) * 4;
    if ((left ? jx < MID - 4 : jx > MID + 4) && !blocked(jx, y)) pts.push({ x: jx, y });
  }
  pts.sort((a, b) => Math.hypot(a.x - ax, (a.y - ay) * 1.6) - Math.hypot(b.x - ax, (b.y - ay) * 1.6));
  return pts.slice(0, n);
}

export function buildWorld(look, tod, seed = 7) {
  const r = P.rng(seed), t = tinter(tod), lit = isLit(tod);
  const lk = { ...POLLY_DEFAULT_LOOK, ...look };
  const sky = paintSky(tod, r);
  const town = P.canvas(W, H), x = town.getContext('2d');
  drawHall(x, t, lit);
  SHOPS.forEach(s => drawShop(x, s, t, lit));
  drawGround(x, lk.ground, t, tod);
  LAMPS.forEach(lx => drawLamp(x, lx, lk.lamps === 'gas' ? 'gas' : lk.lamps === 'globe' ? 'globe' : 'iron', t, lit));
  drawBunting(x, lk.bunting, lit);
  const clouds = Array.from({ length: 5 }, () => ({ img: P.cloudSprite(r, 22 + Math.floor(r() * 24), 9 + Math.floor(r() * 5), sky.pal), x: r() * W, y: 2 + r() * 26, sp: 1.5 + r() * 2.5 }));
  const people = Array.from({ length: TOWNSFOLK }, (_, i) => {
    const s = randomSpot(r, MILL);
    return { look: personLook(i, r), x: s.x, y: s.y, tx: s.x, ty: s.y, sp: 8, wait: r() * 3, face: r() < .5 ? -1 : 1, frame: 0, ft: 0, moving: false, side: 0 };
  });
  const pigeons = Array.from({ length: 5 }, (_, i) => ({ x: [40, 112, 210, 288, 70][i] + r() * 10, y: 102 + r() * 40, f: 0, ft: r() * 2, fly: null, away: 0 }));
  const visitors = lk.visitors;
  return {
    tod, lit, t, look: lk, sky, town, clouds, people, pigeons, visitors, r,
    fountain: paintFountain(lk.fountain, t), podium: paintPodium(t),
    banners: { left: '', right: '', imgL: null, imgR: null, flip: 0 },
    cat: { stretch: 0, next: 8 + r() * 10 },
    paper: { on: false, next: 10 + r() * 15, x: 0, y: 0, f: 0 },
    ducks: { x: 20, dir: 1 }, walker: { x: 300, dir: -1, look: personLook(5, r), f: 0, ft: 0 }, vendor: personLook(2, r),
    polly: { crest: 'half', pose: 'idle', blink: false, tilt: false, nod: false, swing: 0, scroll: false, hop: 0, twitch: 0 },
    dings: 0, confetti: []
  };
}

const spriteCache = new Map();
function pollyImg(world) {
  const p = world.polly, crest = p.twitch > 0 && p.crest !== 'fan' ? { flat: 'low', low: 'half', half: 'high', high: 'fan' }[p.crest] : p.crest;
  const key = JSON.stringify([world.look.crest, world.look.hat, world.look.bell, crest, p.pose, p.blink, p.tilt, p.nod, p.swing, p.scroll]);
  if (!spriteCache.has(key)) {
    if (spriteCache.size > 120) spriteCache.clear();
    spriteCache.set(key, pollySprite(world.look, { crest, pose: p.pose, blink: p.blink, tilt: p.tilt, nod: p.nod, swing: p.swing, scroll: p.scroll }));
  }
  return spriteCache.get(key);
}

/** Draws one frame of the world. `par` is the sky's parallax offset (-2..2), `now` in seconds. */
export function renderWorld(ctx, world, now, par = 0) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(world.sky.canvas, -2 + Math.round(par), 0);
  world.clouds.forEach(c => ctx.drawImage(c.img, Math.round(((c.x + W + 40) % (W + 60)) - 40 + par), Math.round(c.y)));
  ctx.drawImage(world.town, 0, 0);
  // the clock's hands show UTC
  const d = new Date(), m = d.getUTCMinutes() + d.getUTCSeconds() / 60, h = (d.getUTCHours() % 12) + m / 60;
  const hand = (a, len, c) => { for (let i = 0; i <= len; i++) px(ctx, 160 + Math.round(Math.sin(a) * i), 24 - Math.round(Math.cos(a) * i), c); };
  hand(m / 60 * Math.PI * 2, 5, INK); hand(h / 12 * Math.PI * 2, 3, '#7a2e2e'); px(ctx, 160, 24, '#7a2e2e');
  // banners
  const b = world.banners;
  if (b.imgL) drawBanner(ctx, b.imgL, 101, 14, b.flip);
  if (b.imgR) drawBanner(ctx, b.imgR, 205, 16, b.flip);
  // everything standing on the square, back to front
  const items = [];
  items.push({ y: FOUNTAIN_Y, draw: () => { ctx.drawImage(world.fountain, MID - 28, FOUNTAIN_Y - 26); fountainWater(ctx, world, now); } });
  items.push({ y: PODIUM_Y, draw: () => drawPodium(ctx, world) });
  const shadow = (x, y, w = 5) => {
    if (world.tod === 'night') return;
    const off = world.tod === 'morning' ? 3 : world.tod === 'evening' ? -3 : 0;
    ctx.fillStyle = 'rgba(20, 14, 10, .25)'; ctx.fillRect(Math.round(x - w / 2 + Math.min(0, off)), Math.round(y), w + Math.abs(off), 1);
  };
  world.people.forEach(p => items.push({ y: p.y, draw: () => {
    const img = personSprite(p.look, p.frame, !p.moving);
    shadow(p.x, p.y, 6);
    drawFacing(ctx, img, p.x, p.y, p.face);
  } }));
  world.pigeons.forEach(g => { if (!g.away) items.push({ y: g.y, draw: () => { const img = pigeonSprite(g.f, !!g.fly); drawFacing(ctx, img, g.x, g.y, g.fly ? g.fly.dir : 1); } }); });
  const cat = catSprite(world.cat.stretch > 0);
  items.push({ y: GROUND + 2, draw: () => ctx.drawImage(cat, 41, GROUND - 5) });
  if (world.paper.on) items.push({ y: world.paper.y, draw: () => ctx.drawImage(paperSprite(world.paper.f), Math.round(world.paper.x), Math.round(world.paper.y - 6 + Math.sin(now * 4) * 3)) });
  visitorItems(ctx, world, now, items, shadow);
  items.sort((a, b) => a.y - b.y).forEach(i => i.draw());
  // the bell's ding marks and confetti
  if (world.dings > 0) drawDings(ctx, world);
  world.confetti.forEach(c => rect(ctx, c.x, c.y, c.w, 1, c.c));
}

function drawFacing(ctx, img, x, y, face) {
  const dx = Math.round(x - img.width / 2), dy = Math.round(y - img.height + 1);
  if (face < 0) { ctx.save(); ctx.translate(dx + img.width, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
  else ctx.drawImage(img, dx, dy);
}

function drawBanner(ctx, img, x, y, flip) {
  if (flip > .5) { rect(ctx, x + 6, y, 2, img.height - 4, '#5b3b24'); rect(ctx, x + 2, y, 11, 2, '#5b3b24'); return; }
  ctx.drawImage(img, x, y);
}

function drawPodium(ctx, world) {
  ctx.drawImage(world.podium, MID - 16, PODIUM_TOP);
  const img = pollyImg(world);
  ctx.drawImage(img, POLLY_X, POLLY_Y - Math.round(world.polly.hop));
}

function fountainWater(ctx, world, now) {
  const top = FOUNTAIN_Y - 26 + (world.look.fountain === 'marble' ? 1 : 5);
  const t = reduced() ? 0 : now;
  for (let i = 0; i < 10; i++) {
    const ph = (t * 1.6 + i / 10) % 1, side = i % 2 ? 1 : -1;
    const x = MID + side * ph * 10, y = top + 1 - Math.sin(ph * Math.PI) * 5 + ph * 12;
    px(ctx, x, y, i % 3 ? '#cfe7f2' : '#ffffff');
  }
  if (world.look.fountain === 'lions') {
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { const ph = (t * 1.3 + i / 4) % 1; px(ctx, MID + side * (6 + ph * 8), FOUNTAIN_Y - 12 + ph * ph * 8, '#cfe7f2'); }
  }
  if (world.look.fountain === 'golden' && Math.floor(t * 3) % 2) { px(ctx, MID - 18, FOUNTAIN_Y - 6, '#ffffff'); px(ctx, MID + 15, FOUNTAIN_Y - 4, '#ffffff'); }
}

function visitorItems(ctx, world, now, items, shadow) {
  if (world.visitors === 'ducks') {
    const d = world.ducks;
    [0, 1, 2, 3].forEach(i => {
      const x = d.x - d.dir * i * 7, y = 144;
      items.push({ y, draw: () => drawFacing(ctx, duckSprite(Math.floor(now * 4 + i) % 2, i > 0), x, y, d.dir) });
    });
  } else if (world.visitors === 'dogwalker') {
    const w = world.walker;
    items.push({ y: 139, draw: () => { shadow(w.x, 139, 8); drawFacing(ctx, personSprite(w.look, w.f, false), w.x, 139, w.dir); } });
  } else if (world.visitors === 'icecream') {
    items.push({ y: 133, draw: () => { ctx.drawImage(cartSprite(), 284, 114); drawFacing(ctx, personSprite(world.vendor, 0, true), 278, 133, 1); } });
  }
}

function drawDings(ctx, world) {
  const bx = POLLY_X + 26, by = POLLY_Y + 10;
  const c = '#fff6c8';
  [[[2, -6], [4, -9]], [[6, -2], [9, -3]], [[6, 3], [9, 5]]].forEach(([a, b]) => {
    const steps = 4;
    for (let i = 0; i <= steps; i++) px(ctx, bx + a[0] + (b[0] - a[0]) * i / steps, by + a[1] + (b[1] - a[1]) * i / steps, i % 2 ? c : INK);
  });
}

/* ───────────── the live scene ───────────── */

/**
 * opts: { look, tod, onPollyClick, onClock(show, anchor) }. Returns the scene API used by polly.js.
 */
export function createPollyScene(host, { look = {}, tod = timeOfDay(), onPollyClick, onClock } = {}) {
  host.innerHTML = '<canvas class="polly-canvas" width="320" height="150" aria-label="A pixel town square: the town hall with its clock, shops, a fountain, Polly the cockatoo on a podium, and the townsfolk."></canvas>';
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let world = buildWorld(look, tod), alive = true, raf = 0, last = performance.now(), par = 0, parT = 0, clockShown = false;
  const timers = new Set();
  const later = (ms, fn) => { const h = setTimeout(() => { timers.delete(h); if (alive) fn(); }, ms); timers.add(h); return h; };
  const st = { blinkAt: 3 + Math.random() * 3, tiltAt: 8 + Math.random() * 6, twitchAt: 5 + Math.random() * 4, idleTilt: 0, time: 0, mode: 'mill' };

  function step(dt) {
    const w = world, calm = reduced();
    st.time += dt;
    par += (parT - par) * Math.min(1, dt * 4);
    if (!calm) w.clouds.forEach(c => { c.x += c.sp * dt; });
    // Polly's idle life: blinks, head tilts, crest twitches, and her poses
    const p = w.polly;
    if (st.time > st.blinkAt) { p.blink = true; if (st.time > st.blinkAt + .12) { p.blink = false; st.blinkAt = st.time + 3 + Math.random() * 3; } }
    if (p.pose === 'idle' && st.time > st.tiltAt) { st.idleTilt = .9; st.tiltAt = st.time + 7 + Math.random() * 6; }
    if (st.idleTilt > 0) st.idleTilt -= dt;
    p.tilt = p.pose === 'puzzled' || (p.pose === 'idle' && st.idleTilt > 0);
    if (st.time > st.twitchAt) { p.twitch = .2; st.twitchAt = st.time + 5 + Math.random() * 4; }
    if (p.twitch > 0) p.twitch -= dt;
    p.hop = p.pose === 'happy' && !calm ? Math.max(0, Math.sin(st.time * 8)) * 2 : 0;
    p.nod = p.pose === 'okay' && !calm && Math.floor(st.time * 2) % 2 === 0;
    if (w.dings > 0) w.dings -= dt;
    // townsfolk
    w.people.forEach(q => {
      const dx = q.tx - q.x, dy = q.ty - q.y, dist = Math.hypot(dx, dy);
      if (dist > .6) {
        const s = Math.min(dist, q.sp * dt);
        q.x += dx / dist * s; q.y += dy / dist * s; q.moving = true;
        if (Math.abs(dx) > .3) q.face = dx > 0 ? 1 : -1;
        q.ft += dt; if (q.ft > .16) { q.ft = 0; q.frame ^= 1; }
      } else {
        q.moving = false;
        if (st.mode === 'mill' && !calm) {
          q.wait -= dt;
          if (q.wait <= 0) { const s = randomSpot(w.r, MILL); q.tx = s.x; q.ty = s.y; q.sp = 5 + w.r() * 7; q.wait = 1 + w.r() * 4; }
        } else if (st.mode === 'sides') q.face = q.side < 0 ? 1 : -1;
      }
    });
    // pigeons peck, and flutter off when someone walks past
    w.pigeons.forEach(g => {
      if (g.away) { g.away -= dt; if (g.away <= 0) { g.away = 0; const s = randomSpot(w.r, { x0: 8, x1: 312, y0: 101, y1: 146 }); g.x = s.x; g.y = s.y; g.fly = null; } return; }
      if (g.fly) { g.x += g.fly.vx * dt; g.y += g.fly.vy * dt; g.ft += dt; if (g.ft > .08) { g.ft = 0; g.f ^= 1; } if (g.y < -10 || g.x < -10 || g.x > W + 10) g.away = 8 + w.r() * 8; return; }
      g.ft -= dt; if (g.ft <= 0) { g.f = calm ? 0 : g.f ^ 1; g.ft = .3 + w.r() * 1.2; }
      if (!calm && w.people.some(q => q.moving && Math.hypot(q.x - g.x, (q.y - g.y) * 1.5) < 10)) {
        const dir = g.x < MID ? -1 : 1;
        g.fly = { vx: dir * (40 + w.r() * 30), vy: -50 - w.r() * 30, dir }; g.ft = 0;
      }
    });
    // the cat stretches now and then; a sheet of paper blows across
    if (!calm) {
      w.cat.next -= dt; if (w.cat.next <= 0) { w.cat.stretch = 1.2; w.cat.next = 12 + w.r() * 10; }
      if (w.cat.stretch > 0) w.cat.stretch -= dt;
      const pp = w.paper;
      if (pp.on) { pp.x += 42 * dt; pp.f = Math.floor(st.time * 6); if (pp.x > W + 8) { pp.on = false; pp.next = 18 + w.r() * 14; } }
      else { pp.next -= dt; if (pp.next <= 0) { pp.on = true; pp.x = -6; pp.y = 104 + w.r() * 40; } }
      if (w.visitors === 'ducks') { w.ducks.x += w.ducks.dir * 7 * dt; if (w.ducks.x > W + 30) w.ducks.dir = -1; if (w.ducks.x < -30) w.ducks.dir = 1; }
      if (w.visitors === 'dogwalker') {
        const k = w.walker; k.x += k.dir * 10 * dt; k.ft += dt; if (k.ft > .18) { k.ft = 0; k.f ^= 1; }
        if (k.x > W - 10) k.dir = -1; if (k.x < 10) k.dir = 1;
      }
    }
    // the banners flip when the question changes
    if (w.banners.flip > 0) w.banners.flip = Math.max(0, w.banners.flip - dt * 10);
    w.confetti = w.confetti.filter(c => { c.vy += 70 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; return c.life > 0 && c.y < H; });
  }

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    step(dt);
    renderWorld(ctx, world, now / 1000, reduced() ? 0 : par);
    raf = requestAnimationFrame(frame);
  }

  const toLow = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  const overPolly = p => p.x > POLLY_X + 2 && p.x < POLLY_X + POLLY_W && p.y > POLLY_Y - 6 && p.y < PODIUM_TOP + 2;
  const overClock = p => Math.hypot(p.x - 160, p.y - 24) < 10;
  const anchors = () => ({
    polly: { x: (POLLY_X + POLLY_W + 2) / W * 100, y: (POLLY_Y + 2) / H * 100 },
    clock: { x: 160 / W * 100, y: 36 / H * 100 }
  });
  const showClock = on => { clockShown = on; if (onClock) onClock(on, anchors().clock); };
  const onMove = e => {
    const p = toLow(e);
    parT = (p.x / W - .5) * 4;
    cv.style.cursor = overPolly(p) || overClock(p) ? 'pointer' : '';
    if (e.pointerType === 'mouse') { if (overClock(p) !== clockShown) showClock(overClock(p)); }
  };
  const onLeave = () => { parT = 0; if (clockShown) showClock(false); };
  const onClick = e => {
    const p = toLow(e);
    if (overPolly(p) && onPollyClick) onPollyClick();
    else if (overClock(p)) showClock(!clockShown || e.pointerType !== 'mouse');
    else if (clockShown) showClock(false);
  };
  cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', onLeave); cv.addEventListener('click', onClick);

  function assignSides(real) {
    const nLeft = Math.round(TOWNSFOLK * Math.max(0, Math.min(100, real)) / 100);
    const order = world.people.slice().sort((a, b) => a.x - b.x);
    const ls = sideSpots(true, nLeft).sort((a, b) => a.x - b.x), rs = sideSpots(false, TOWNSFOLK - nLeft).sort((a, b) => a.x - b.x);
    order.forEach((q, i) => {
      const s = i < nLeft ? ls[i] : rs[i - nLeft];
      q.side = i < nLeft ? -1 : 1;
      q.tx = s.x + (world.r() - .5) * 2; q.ty = s.y + (world.r() - .5) * 2;
      q.sp = Math.max(12, Math.hypot(q.tx - q.x, q.ty - q.y) / 1.35);
    });
  }

  const api = {
    /** The side labels on the two banners. A change flips them (2 frames). */
    setLabels(left, right, flip = true) {
      const b = world.banners;
      if (b.left === left && b.right === right && b.imgL) return;
      b.left = left; b.right = right;
      b.imgL = left ? paintBanner(left, LEFT) : null; b.imgR = right ? paintBanner(right, RIGHT) : null;
      b.flip = flip && !reduced() ? 1 : 0;
    },
    setLook(lk) {
      const keep = world;
      world = buildWorld(lk, keep.tod);
      world.people.forEach((q, i) => Object.assign(q, { x: keep.people[i].x, y: keep.people[i].y, tx: keep.people[i].tx, ty: keep.people[i].ty, side: keep.people[i].side }));
      world.polly = keep.polly; world.banners = { ...keep.banners, imgL: keep.banners.left ? paintBanner(keep.banners.left, LEFT) : null, imgR: keep.banners.right ? paintBanner(keep.banners.right, RIGHT) : null };
      spriteCache.clear();
    },
    /** A new question: Polly reads it out (the scroll unrolls), and the townsfolk wander back to the middle. */
    question() {
      const p = world.polly;
      p.pose = 'idle'; p.crest = 'half'; p.swing = 0; p.scroll = true;
      later(900, () => { world.polly.scroll = false; });
      st.mode = 'mill';
      world.people.forEach(q => {
        q.side = 0;
        const s = randomSpot(world.r, MILL); q.tx = s.x; q.ty = s.y; q.sp = reduced() ? 999 : 18 + world.r() * 10; q.wait = 1 + world.r() * 3;
      });
    },
    /** Everyone wanders back to the middle (the summary, or a day with no poll). */
    mill() {
      st.mode = 'mill';
      world.people.forEach(q => { q.side = 0; const s = randomSpot(world.r, MILL); q.tx = s.x; q.ty = s.y; q.sp = reduced() ? 999 : 14 + world.r() * 8; q.wait = 1 + world.r() * 3; });
    },
    /** The bell (400 ms): Polly swings her hand bell and three ding marks pop out. */
    ring() {
      const p = world.polly;
      p.pose = 'ring'; world.dings = .75;
      return new Promise(res => {
        if (reduced()) { p.swing = 0; later(400, () => { p.pose = 'idle'; res(); }); return; }
        [-1, 1, -1, 1].forEach((s, i) => later(i * 100, () => { world.polly.swing = s; }));
        later(400, () => { world.polly.swing = 0; world.polly.pose = 'idle'; res(); });
      });
    },
    /** The walk (1,500 ms): exactly round(30 × real / 100) townsfolk go to the orange half, the rest to teal. */
    walk(real) {
      st.mode = 'sides';
      assignSides(real);
      if (reduced()) { world.people.forEach(q => { q.x = q.tx; q.y = q.ty; }); return Promise.resolve(); }
      return new Promise(res => later(1500, res));
    },
    /** Puts everyone on their sides at once (an answered question shown again). */
    snapSides(real) { st.mode = 'sides'; assignSides(real); world.people.forEach(q => { q.x = q.tx; q.y = q.ty; q.moving = false; }); },
    setCrest(level) { world.polly.crest = level; },
    setPose(pose) { world.polly.pose = pose; },
    confetti() {
      if (reduced()) return;
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 40 + Math.random() * 70;
        world.confetti.push({ x: 160 + (Math.random() - .5) * 20, y: 34, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: [LEFT, RIGHT, '#f2c230', '#ffffff'][i % 4], w: 1 + (i % 2), life: 2 + Math.random() });
      }
    },
    anchors,
    destroy() { alive = false; cancelAnimationFrame(raf); timers.forEach(clearTimeout); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave); cv.removeEventListener('click', onClick); }
  };
  raf = requestAnimationFrame(frame);
  return api;
}

/** A still picture of the square with a given look (the shop's Town preview). */
export function drawTownStill(cv, look, tod = timeOfDay(), labels = ['Yes', 'No']) {
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const world = buildWorld(look, tod, 11);
  world.banners.imgL = paintBanner(labels[0], LEFT); world.banners.imgR = paintBanner(labels[1], RIGHT);
  renderWorld(ctx, world, 0, 0);
}

/* ───────────── tiny preview for the suite home page ───────────── */
/** Polly on the podium swinging her bell, her crest bobbing, and two tiny townsfolk walking to opposite sides. 64×44. */
export function drawPollyPreview(cv, n) {
  const PW = 64, PH = 44;
  if (cv.width !== PW) { cv.width = PW; cv.height = PH; }
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  rect(x, 0, 0, PW, PH, '#9dcdf1');
  for (let y = 0; y < 14; y++) for (let i = 0; i < PW; i++) if (P.bayer(i, y) < .5 - y / 28) px(x, i, y + 4, '#c3e2f6');
  // town hall
  rect(x, 22, 8, 20, 18, '#b5654a'); rect(x, 28, 2, 8, 8, '#d8cfc0'); ellipse(x, 32, 6, 2, 2, '#f6efe2'); px(x, 32, 5, INK); px(x, 33, 6, INK);
  rect(x, 4, 14, 16, 12, '#7d8f6a'); rect(x, 44, 12, 16, 14, '#9c7b5a');
  // ground, tinted orange on the left and teal on the right
  for (let y = 26; y < PH; y++) for (let i = 0; i < PW; i++) px(x, i, y, P.bayer(i, y) < .3 ? (i < 32 ? LEFT : RIGHT) : (y % 3 === 0 || (i + (y % 6 < 3 ? 0 : 2)) % 4 === 0 ? '#7d786f' : '#9a958c'));
  // banners
  rect(x, 16, 10, 4, 12, LEFT); rect(x, 44, 10, 4, 12, RIGHT);
  // podium and Polly
  rect(x, 26, 34, 12, 6, '#a39e94'); rect(x, 26, 34, 12, 1, '#c9c4b8');
  const bob = n % 4 < 2 ? 0 : 1;
  ellipse(x, 31, 30, 3, 4, '#fbfbf7'); ellipse(x, 32, 24, 2, 2, '#fbfbf7'); px(x, 34, 24, '#3b3d44'); px(x, 33, 23, '#111111');
  rect(x, 30, 20 - bob, 1, 2 + bob, '#f2c230'); px(x, 29, 19 - bob, '#f2c230'); px(x, 31, 21 - bob, '#f2c230');
  const sw = n % 2 ? 1 : -1;
  rect(x, 35, 27, 1, 1, '#7a5233'); rect(x, 34 + (sw > 0 ? 1 : 0), 28, 3, 2, '#b8862e'); px(x, 35 + sw, 30, '#2b2b2b');
  if (n % 2) { px(x, 39, 26, '#fff6c8'); px(x, 40, 28, '#fff6c8'); }
  // two tiny townsfolk walking to opposite sides
  const t = (n % 24) / 24;
  const walker = (wx, c) => { rect(x, wx, 33, 2, 3, c); px(x, wx, 32, '#f1c7a3'); px(x, wx + 1, 32, '#f1c7a3'); px(x, wx + (n % 2), 36, INK); px(x, wx + 1 - (n % 2), 36, INK); };
  walker(Math.round(24 - t * 20), '#4a6fa5');
  walker(Math.round(38 + t * 20), '#8a4f7d');
}
