// Pixel-art toolkit for Summit: palettes, dithering, procedural mountains, cabins, pines,
// the gondola and Skipper the goat. Everything draws on small low-resolution canvases that
// get scaled up with nearest-neighbor sampling, so edges stay crisp.

import { WARDROBE } from './wardrobe.js';

/* ───────────── basics ───────────── */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return c; }
const hexRgb = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + .5) / 16));
export const bayer = (x, y) => BAYER[y & 3][x & 3];
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), Math.round(w), Math.round(h)); }

/** Adds a 1px outline around every opaque pixel (classic sprite outline). */
export function outline(src, color = '#24170f') {
  const w = src.width, h = src.height, out = canvas(w + 2, h + 2), o = out.getContext('2d');
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  o.fillStyle = color;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) o.fillRect(x + 1, y + 1, 1, 1);
  }
  o.drawImage(src, 1, 1);
  return out;
}

function ellipse(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25))));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

/* ───────────── palettes ───────────── */
const SKIES = {
  morning: ['#6b7cc6', '#9a86c4', '#d79bab', '#f2b598', '#f9d2ad', '#fde8c9'],
  day: ['#3a8bd3', '#56a2df', '#77b8ea', '#9dcdf1', '#c3e2f6', '#e2f1f8'],
  evening: ['#2b2c69', '#523d84', '#8a4d8e', '#c45f80', '#ea8869', '#f6b379'],
  night: ['#060a1d', '#0b132e', '#111b40', '#192651', '#213163', '#2a3d76']
};
const STAGE = {
  1: { far: ['#a6c3d9', '#8eadc6', '#7a99b4'], mid: ['#86b27d', '#6f9a68', '#5a8355'], near: ['#74a95c', '#5c8e4b', '#47733b'], hill: ['#86bb64', '#6fa052', '#5a8542'], snowline: 60, nearSnow: -1 },
  2: { far: ['#b3c1d0', '#9aaabd', '#8394a9'], mid: ['#97a3ae', '#808b97', '#6a7480'], near: ['#9aa2a9', '#7f8890', '#666e76'], hill: ['#86a07c', '#718b68', '#5d7556'], snowline: 78, nearSnow: 92 },
  3: { far: ['#cbd7e3', '#b4c3d2', '#9eafc1'], mid: ['#d9e3ec', '#bfcbd8', '#a5b4c4'], near: ['#e8eff5', '#cfdae5', '#b3c1cf'], hill: ['#eef3f8', '#d9e2eb', '#c3cfdb'], snowline: 200, nearSnow: 200 }
};
const TINT = { morning: ['#f2a07f', .12], day: null, evening: ['#5b2f6c', .3], night: ['#0a1330', .62] };

export function palette(stage, tod) {
  const s = STAGE[stage] || STAGE[1], t = TINT[tod];
  const tint = c => t ? mix(c, t[0], t[1]) : c;
  const sky = SKIES[tod] || SKIES.day;
  const haze = sky[sky.length - 1];
  return {
    tod, stage, sky,
    far: s.far.map(c => tint(mix(c, haze, .3))), mid: s.mid.map(tint), near: s.near.map(tint), hill: s.hill.map(tint),
    snow: ['#ffffff', '#dfe8f1', '#c3d1df'].map(tint), rock: tint('#4f5862'),
    pine: (stage === 3 ? ['#4a7a63', '#3a6552', '#2c5040'] : ['#3d7c50', '#2d6340', '#214a30']).map(tint), trunk: tint('#5b3b27'),
    snowline: s.snowline, nearSnow: s.nearSnow,
    log: ['#a86c42', '#8a5533', '#6b4028'].map(tint), roof: ['#c2482f', '#9e3624', '#7a281a'].map(tint),
    win: tod === 'night' || tod === 'evening' ? ['#ffd66e', '#ffb648'] : ['#bfe1f2', '#8fc3de'], frame: tint('#4a2c1c'), door: tint('#5e3522'),
    steel: tint('#59636f'), steel2: tint('#9aa5b1'), cable: tint('#2a313b'),
    star: '#ffffff', sun: tod === 'evening' ? '#ffb15e' : tod === 'morning' ? '#ffd28a' : '#ffe680', cloud: tod === 'night' ? ['#53618a', '#3f4c73'] : tod === 'evening' ? ['#ffd9c4', '#e9a6a2'] : ['#ffffff', '#d4e3f0']
  };
}

/* ───────────── sky ───────────── */
export function drawSky(ctx, W, H, pal) {
  const img = ctx.createImageData(W, H), d = img.data, cols = pal.sky.map(hexRgb), n = cols.length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.min(n - 1, (y / (H * .78)) * (n - 1));
    const i = Math.floor(v), f = v - i;
    const c = cols[Math.min(n - 1, f > bayer(x, y) ? i + 1 : i)], k = (y * W + x) * 4;
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/* ───────────── terrain ───────────── */
/** 1D value noise ridge: array of y per x. */
export function ridgeNoise(r, W, base, amp, octaves = 4, scale = 60) {
  const pts = []; const layers = [];
  for (let o = 0; o < octaves; o++) { const n = Math.ceil(W / (scale / 2 ** o)) + 3; layers.push(Array.from({ length: n }, () => r() * 2 - 1)); }
  for (let x = 0; x < W; x++) {
    let y = 0, a = amp;
    layers.forEach((l, o) => {
      const s = scale / 2 ** o, p = x / s, i = Math.floor(p), f = p - i, sm = f * f * (3 - 2 * f);
      y += (l[i] * (1 - sm) + l[i + 1] * sm) * a; a *= .5;
    });
    pts.push(base + y);
  }
  return pts;
}

/**
 * Fills terrain below a ridge with lit/shadow faces (light from the upper left), rock specks
 * and jagged snowcaps above the snowline.
 */
export function drawTerrain(ctx, ridge, H, cols, pal, r, { snowline = -1, specks = .05, rocks = 0 } = {}) {
  const W = ridge.length;
  const hi = mix(cols[0], '#ffffff', .22);
  for (let x = 0; x < W; x++) {
    const top = Math.round(ridge[x]);
    const slope = (ridge[Math.min(W - 1, x + 5)] - ridge[Math.max(0, x - 5)]) / 10;
    const lit = slope < -.1, shade = slope > .1;
    const snowDepth = top < snowline ? Math.round((snowline - top) * .55 + 2 + r() * 3) : 0;
    const band = 7 + (x * 13 % 5);                     // ragged edge between the sunny top and the body
    for (let y = Math.max(0, top); y < H; y++) {
      const dpt = y - top;
      let c;
      if (dpt < snowDepth) c = lit ? pal.snow[0] : shade ? pal.snow[2] : pal.snow[1];
      else if (dpt === snowDepth && snowDepth && bayer(x, y) > .5) c = pal.snow[1];
      else if (lit) c = dpt < band ? cols[0] : dpt < band + 2 ? (bayer(x, y) > .5 ? cols[0] : cols[1]) : cols[1];
      else if (shade) c = dpt < band * 2 ? cols[2] : dpt < band * 2 + 2 ? (bayer(x, y) > .5 ? cols[2] : cols[1]) : cols[1];
      else c = cols[1];
      if (specks && r() < specks * .4) c = lit ? cols[1] : cols[2];
      px(ctx, x, y, c);
    }
    if (top >= 0 && !snowDepth) px(ctx, x, top, lit ? hi : cols[0]);
  }
  // rock outcrops: little clusters with a lit top edge and a dark base
  for (let i = 0; i < rocks; i++) {
    const x = 4 + Math.floor(r() * (W - 8)), top = Math.round(ridge[x]);
    const y = top + 4 + Math.floor(r() * 20), w = 3 + Math.floor(r() * 4), h = 2 + Math.floor(r() * 2);
    if (y >= H - 1) continue;
    for (let dy = 0; dy < h; dy++) for (let dx = -dy; dx < w + dy; dx++) px(ctx, x + dx, y + dy, dy === 0 ? mix(pal.rock, '#ffffff', .35) : dy === h - 1 ? mix(pal.rock, '#000000', .25) : pal.rock);
  }
}

/** A pixel pine: stacked, slightly ragged tiers, lit on the left, optional snow. */
export function drawPine(ctx, x, base, h, pal, snowy = false) {
  x = Math.round(x); base = Math.round(base);
  rect(ctx, x, base - 2, 1, 3, pal.trunk);
  const tiers = Math.max(2, Math.round(h / 4));
  for (let i = 0; i < h - 2; i++) {
    const y = base - 2 - i, inTier = i % Math.ceil((h - 2) / tiers);
    const w = Math.max(0, Math.round((h - 2 - i) * .42) - (inTier === 0 ? 0 : 1) + (inTier === 1 ? 1 : 0));
    for (let dx = -w; dx <= w; dx++) {
      let c = dx < 0 ? pal.pine[0] : dx === 0 ? pal.pine[1] : pal.pine[2];
      if (snowy && (inTier === 0 && Math.abs(dx) >= w - 1)) c = pal.snow[1];
      px(ctx, x + dx, y, c);
    }
  }
  px(ctx, x, base - h, snowy ? pal.snow[0] : pal.pine[1]);
}

/* ───────────── buildings ───────────── */
/**
 * A log chalet. (cx, base) = bottom center. Returns handy points (window centers, chimney top).
 */
export function drawChalet(ctx, cx, base, { w = 18, wallH = 10, roofH = 8, windows = 2, door = true, chimney = false, balcony = false, lantern = true, flag = false }, pal) {
  const x0 = Math.round(cx - w / 2), top = base - wallH;
  // walls: alternating log rows with darker log ends at the corners
  for (let r = 0; r < wallH; r++) {
    const c = r % 3 === 2 ? pal.log[2] : r % 3 === 1 ? pal.log[1] : pal.log[0];
    rect(ctx, x0, top + r, w, 1, c);
    px(ctx, x0 - 1, top + r, r % 2 ? pal.log[0] : pal.log[1]);
    px(ctx, x0 + w, top + r, r % 2 ? pal.log[0] : pal.log[1]);
  }
  rect(ctx, x0, base, w, 1, pal.frame);
  // roof with shingle rows, eaves overhang and snow
  for (let i = 0; i < roofH; i++) {
    const half = Math.round((w / 2 + 3) * (i + 1) / roofH);
    const y = top - roofH + i;
    for (let dx = -half; dx <= half; dx++) {
      let c = (i + (dx & 1)) % 3 === 0 ? pal.roof[1] : pal.roof[0];
      if (dx > half - 2) c = pal.roof[2];
      if (i === roofH - 1) c = pal.roof[2];
      px(ctx, Math.round(cx) + dx, y, c);
    }
    // snow along the top and edges
    if (i < 2) for (let dx = -half; dx <= half; dx++) px(ctx, Math.round(cx) + dx, y, i === 0 || Math.abs(dx) < half ? pal.snow[i] : pal.snow[1]);
    px(ctx, Math.round(cx) - half, y, pal.snow[1]);
  }
  for (let dx = -(w / 2 + 3); dx <= w / 2 + 3; dx += 3) px(ctx, Math.round(cx + dx), top, pal.snow[1]);
  // chimney
  let chimneyTop = null;
  if (chimney) {
    const chx = Math.round(cx + w / 4), chy = top - roofH + 1;
    rect(ctx, chx, chy - 4, 3, 5, '#7a4a3a'); rect(ctx, chx, chy - 4, 3, 1, pal.snow[0]); px(ctx, chx + 2, chy - 2, '#5c3529');
    chimneyTop = { x: chx + 1, y: chy - 5 };
  }
  // windows with frames, mullions and sills
  const wins = [];
  const slots = windows + (door ? 1 : 0), gap = w / (slots + 1);
  let k = 0;
  for (let i = 1; i <= slots; i++) {
    const wx = Math.round(x0 + gap * i);
    if (door && i === Math.ceil(slots / 2)) {
      rect(ctx, wx - 2, base - 7, 4, 7, pal.frame); rect(ctx, wx - 1, base - 6, 2, 6, pal.door); px(ctx, wx, base - 3, '#e7c46a');
      continue;
    }
    rect(ctx, wx - 2, top + 2, 5, 5, pal.frame); rect(ctx, wx - 1, top + 3, 3, 3, pal.win[0]);
    px(ctx, wx, top + 3, pal.frame); px(ctx, wx - 1, top + 4, pal.frame); px(ctx, wx + 1, top + 4, pal.frame); px(ctx, wx, top + 5, pal.win[1]);
    rect(ctx, wx - 2, top + 7, 5, 1, pal.snow[1]);
    wins.push({ x: wx, y: top + 4 }); k++;
  }
  if (balcony) {
    rect(ctx, x0 - 2, top + 8, w + 4, 1, pal.log[2]);
    for (let x = x0 - 2; x < x0 + w + 2; x += 2) px(ctx, x, top + 7, pal.log[1]);
    rect(ctx, x0 - 2, top + 6, w + 4, 1, pal.log[1]);
  }
  if (lantern) { px(ctx, x0 + w + 1, top + 3, pal.frame); px(ctx, x0 + w + 1, top + 4, '#ffd66e'); }
  if (flag) {
    const fx = Math.round(cx), fy = top - roofH;
    rect(ctx, fx, fy - 7, 1, 7, pal.steel);
    rect(ctx, fx + 1, fy - 7, 4, 1, '#f2b33d'); rect(ctx, fx + 1, fy - 6, 3, 1, '#f2b33d'); px(ctx, fx + 1, fy - 5, '#d99a24');
  }
  return { windows: wins, chimneyTop };
}

/** Cable-car station: a chalet with a steel bullwheel housing on the valley side. */
export function drawStation(ctx, cx, base, side, pal) {
  const info = drawChalet(ctx, cx, base, { w: 18, wallH: 10, roofH: 7, windows: 1, door: true }, pal);
  const wx = Math.round(cx + side * 11), wy = base - 13;
  rect(ctx, wx - 1, wy, 3, 13, pal.steel);                 // tower
  for (let y = wy + 2; y < base; y += 3) px(ctx, wx + side, y, pal.steel2);
  ellipse(ctx, wx, wy, 3, 3, pal.steel); ellipse(ctx, wx, wy, 1, 1, pal.steel2);  // bullwheel
  return { ...info, wheel: { x: wx, y: wy - 1 } };
}

/** Draws a quadratic cable as single pixels. */
export function drawCable(ctx, P0, C, P2, color) {
  ctx.fillStyle = color;
  let lx = null, ly = null;
  for (let i = 0; i <= 600; i++) {
    const t = i / 600, u = 1 - t;
    const x = Math.round(u * u * P0.x + 2 * u * t * C.x + t * t * P2.x), y = Math.round(u * u * P0.y + 2 * u * t * C.y + t * t * P2.y);
    if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
}

/* ───────────── clouds, sun, moon ───────────── */
export function cloudSprite(r, w, h, pal) {
  const c = canvas(w, h), x = c.getContext('2d');
  const blobs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const bx = 4 + r() * (w - 8), by = h * .55 - r() * h * .25, rx = 3 + r() * w * .22, ry = Math.max(2, rx * .55);
    ellipse(x, bx, by, Math.round(rx), Math.round(Math.min(ry, h / 2 - 1)), pal.cloud[0]);
  }
  rect(x, 0, w, 0, pal.cloud[0]);
  // shade the bottom rows
  const d = x.getImageData(0, 0, w, h);
  for (let yy = Math.floor(h * .62); yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (d.data[(yy * w + xx) * 4 + 3] > 0 && (yy > h * .75 || bayer(xx, yy) > .5)) px(x, xx, yy, pal.cloud[1]);
  }
  return c;
}
export function sunSprite(pal, moon) {
  const c = canvas(19, 19), x = c.getContext('2d');
  if (moon) {
    ellipse(x, 9, 9, 6, 6, '#f3efdf');
    x.globalCompositeOperation = 'destination-out'; ellipse(x, 12, 7, 5, 5, '#000'); x.globalCompositeOperation = 'source-over';
    px(x, 6, 11, '#d8d3bf'); px(x, 7, 13, '#d8d3bf'); px(x, 5, 8, '#d8d3bf');
    return c;
  }
  for (let y = 0; y < 19; y++) for (let xx = 0; xx < 19; xx++) {
    const d = Math.hypot(xx - 9, y - 9);
    if (d < 9.5 && d > 7.5 && bayer(xx, y) > .55) px(x, xx, y, mix(pal.sun, '#ffffff', .3));
  }
  ellipse(x, 9, 9, 6, 6, pal.sun); ellipse(x, 8, 8, 3, 3, mix(pal.sun, '#ffffff', .45));
  return c;
}

/* ───────────── Skipper's outfit ───────────── */
/** Turns a look ({ fur, hat, scarf, glasses, cabin } ids) into the colors and shapes to draw. */
export function outfit(look = {}) {
  const pick = (slot, id) => WARDROBE[slot].find(i => i.id === id) || WARDROBE[slot][0];
  return {
    fur: pick('fur', look.fur).c, hat: pick('hat', look.hat), scarf: pick('scarf', look.scarf),
    glasses: pick('glasses', look.glasses).kind, cabin: pick('cabin', look.cabin).c
  };
}

/* ───────────── the gondola ───────────── */
export function gondolaSprite(mood = 'smile', blink = false, look = {}) {
  const c = canvas(18, 23), x = c.getContext('2d');
  const o = outfit(look);
  const R = o.cabin, Rd = mix(o.cabin, '#000000', .25), Rl = mix(o.cabin, '#ffffff', .2), W = '#f3ead8';
  // hanger
  rect(x, 8, 0, 2, 6, '#59636f'); rect(x, 4, 5, 10, 1, '#59636f'); px(x, 3, 6, '#59636f'); px(x, 14, 6, '#59636f');
  // body
  rect(x, 2, 7, 14, 1, Rd); rect(x, 1, 8, 16, 13, R); rect(x, 2, 21, 14, 1, Rd); rect(x, 1, 19, 16, 2, Rd);
  rect(x, 2, 8, 1, 11, Rl); rect(x, 1, 17, 16, 1, W);
  // window
  rect(x, 3, 9, 12, 7, '#4a2014'); rect(x, 4, 10, 10, 5, '#bfe3f5'); px(x, 4, 10, '#e6f6ff'); px(x, 5, 10, '#e6f6ff'); px(x, 4, 11, '#e6f6ff');
  // Skipper in the window: horns, ears, face, hat, eyes, nose
  px(x, 7, 10, '#8a6440'); px(x, 10, 10, '#8a6440');
  rect(x, 7, 11, 4, 4, o.fur[0]); px(x, 6, 12, o.fur[1]); px(x, 11, 12, o.fur[1]);
  const h = o.hat, hc = h.c || [];
  if (h.kind === 'beanie') { rect(x, 7, 10, 4, 1, hc[0]); px(x, 8, 9, '#ffffff'); }
  else if (h.kind === 'party') { rect(x, 7, 10, 4, 1, hc[0]); rect(x, 8, 9, 2, 1, hc[1]); px(x, 8, 8, hc[0]); }
  else if (h.kind === 'cowboy') { rect(x, 6, 10, 6, 1, hc[1]); rect(x, 7, 9, 4, 1, hc[0]); }
  else if (h.kind === 'tophat') { rect(x, 6, 10, 6, 1, hc[0]); rect(x, 7, 8, 4, 2, hc[0]); rect(x, 7, 9, 4, 1, hc[1]); }
  else if (h.kind === 'crown') { rect(x, 7, 10, 4, 1, hc[0]); px(x, 7, 9, hc[0]); px(x, 10, 9, hc[0]); px(x, 8, 9, '#e4572e'); }
  const ink = '#1d1410', mouth = '#7a3b2e';
  if (o.glasses === 'shades' || o.glasses === 'stars') rect(x, 7, 12, 4, 1, o.glasses === 'stars' ? '#e2a72e' : ink);
  else if (blink || mood === 'happy') { px(x, 7, 12, '#8a6440'); px(x, 10, 12, '#8a6440'); }
  else { px(x, 7, 12, ink); px(x, 10, 12, ink); }
  if (o.glasses === 'specs') { px(x, 8, 12, '#59636f'); px(x, 9, 12, '#59636f'); }
  if (mood === 'wow') { px(x, 8, 14, mouth); px(x, 9, 14, mouth); px(x, 8, 13, '#e48c8c'); }
  else if (mood === 'sad' || mood === 'dizzy') { px(x, 8, 14, mouth); px(x, 9, 14, mouth); }
  else { px(x, 8, 13, '#e48c8c'); px(x, 9, 13, '#e48c8c'); px(x, 8, 14, mouth); px(x, 9, 14, mouth); }
  // door seam + rivets
  rect(x, 12, 17, 1, 3, Rd); px(x, 3, 19, '#f2b33d'); px(x, 14, 19, '#f2b33d');
  return outline(c);
}
export function trolleySprite() {
  const c = canvas(12, 5), x = c.getContext('2d');
  rect(x, 1, 1, 10, 2, '#59636f'); ellipse(x, 3, 1, 1, 1, '#9aa5b1'); ellipse(x, 8, 1, 1, 1, '#9aa5b1'); px(x, 3, 1, '#2a313b'); px(x, 8, 1, '#2a313b');
  rect(x, 5, 3, 2, 2, '#59636f');
  return outline(c, '#1e232b');
}

/* ───────────── Skipper's portrait ───────────── */
export function skipperPortrait(mood = 'smile', blink = false, ear = 0, look = {}) {
  const c = canvas(44, 44), x = c.getContext('2d');
  const o = outfit(look);
  const fur = o.fur[0], furS = o.fur[1], horn = '#9a7048', hornD = '#6f4e30', pink = '#f0a3a0', ink = '#1d1410';
  const muzzle = mix(fur, '#ffffff', .45);
  // horns curling back
  // curved goat horns sweeping up and back from under the beanie
  [[12, 15], [11, 14], [10, 13], [10, 12], [9, 11], [9, 10], [9, 9], [10, 8], [11, 7]].forEach(([hx, hy], i) => {
    px(x, hx, hy, i > 6 ? hornD : horn); px(x, hx + 1, hy, i > 6 ? horn : hornD);
    px(x, 43 - hx, hy, i > 6 ? hornD : horn); px(x, 42 - hx, hy, i > 6 ? horn : hornD);
  });
  // ears
  ellipse(x, 8 - ear, 20 + ear, 6, 2, furS); ellipse(x, 8 - ear, 20 + ear, 4, 1, pink);
  ellipse(x, 36 + ear, 20 + ear, 6, 2, furS); ellipse(x, 36 + ear, 20 + ear, 4, 1, pink);
  // head, muzzle, beard
  ellipse(x, 22, 22, 11, 12, fur); ellipse(x, 22, 29, 7, 5, muzzle);
  for (let i = 0; i < 6; i++) rect(x, 20 + (i > 3 ? 1 : 0), 34 + i, 4 - (i > 3 ? 2 : 0), 1, furS);
  rect(x, 12, 26, 2, 1, furS); rect(x, 30, 26, 2, 1, furS);
  drawHat(x, o.hat, furS);
  // eyes
  if (blink || mood === 'happy') { rect(x, 16, 25, 3, 1, ink); rect(x, 26, 25, 3, 1, ink); if (mood === 'happy') { px(x, 15, 24, ink); px(x, 29, 24, ink); } }
  else if (mood === 'dizzy') { [[16, 23], [18, 25], [18, 23], [16, 25], [17, 24]].forEach(([a, b]) => { px(x, a, b, ink); px(x, a + 10, b, ink); }); }
  else { rect(x, 16, 23, 3, 4, ink); rect(x, 26, 23, 3, 4, ink); px(x, 16, 23, '#ffffff'); px(x, 26, 23, '#ffffff'); }
  drawGlasses(x, o.glasses);
  // blush, nose, mouth
  rect(x, 13, 28, 2, 1, pink); rect(x, 30, 28, 2, 1, pink);
  rect(x, 21, 28, 3, 2, '#c9726a'); px(x, 21, 28, '#e59a92');
  if (mood === 'wow') ellipse(x, 22, 32, 1, 1, '#7a3b2e');
  else if (mood === 'sad' || mood === 'dizzy') { rect(x, 20, 32, 5, 1, '#7a3b2e'); px(x, 19, 33, '#7a3b2e'); px(x, 25, 33, '#7a3b2e'); }
  else { px(x, 19, 31, '#7a3b2e'); rect(x, 20, 32, 5, 1, '#7a3b2e'); px(x, 25, 31, '#7a3b2e'); }
  // scarf
  const [sc, st] = o.scarf.c, bands = ['#d9482b', '#f2b33d', '#5fae6a', '#3f78c9', '#7d55c7'];
  rect(x, 12, 38, 21, 3, sc);
  for (let i = 13, n = 0; i < 33; i += 4, n++) rect(x, i, 38, 2, 3, o.scarf.rainbow ? bands[n % bands.length] : st);
  rect(x, 27, 40, 4, 4, sc); px(x, 28, 41, o.scarf.rainbow ? bands[2] : st);
  return outline(c);
}

/**
 * Skipper standing on all fours, facing you: the portrait head (horns, hat, glasses, scarf) on a stocky body
 * with four legs, hooves and a flicky tail. 52×70. opts: { mood, blink, ear, step (0/1, alternates the legs
 * while walking), tail (0/1, tail up) }.
 */
export function skipperStanding(look = {}, { mood = 'smile', blink = false, ear = 0, step = 0, tail = 0 } = {}) {
  const c = canvas(52, 70), x = c.getContext('2d');
  const o = outfit(look);
  const fur = o.fur[0], furS = o.fur[1], furD = mix(furS, '#000000', .18), furL = mix(fur, '#ffffff', .35);
  const hoof = '#3a2a20', hoofL = '#5e4636';
  const b = canvas(52, 70), y = b.getContext('2d');
  // tail: a little tuft poking up behind the body on the right
  rect(y, 39, 37 - tail, 3, 5 + tail, furS); rect(y, 40, 35 - tail * 2, 2, 3, fur);
  // back legs (behind, darker, a touch shorter)
  const leg = (lx, top, len, col, lift) => {
    rect(y, lx, top, 4, len - lift, col);
    rect(y, lx, top + len - lift, 4, 3, hoof); rect(y, lx, top + len - lift, 4, 1, hoofL); px(y, lx + 2, top + len - lift + 2, '#000000');
  };
  leg(12, 52, 13, furD, step ? 0 : 1);
  leg(36, 52, 13, furD, step ? 1 : 0);
  // body: a round barrel, lit on top, shaded underneath, with a pale belly
  ellipse(y, 26, 49, 16, 10, furS);
  ellipse(y, 26, 47, 15, 8, fur);
  ellipse(y, 22, 43, 8, 3, furL);
  ellipse(y, 26, 55, 9, 3, mix(fur, furS, .5));
  // front legs, with knobbly knees
  leg(17, 54, 13, furS, step ? 1 : 0);
  leg(31, 54, 13, furS, step ? 0 : 1);
  px(y, 17, 59, fur); px(y, 31, 59, fur);
  const body = outline(b, '#1e232b');
  x.drawImage(body, -1, -1);
  // the head sits on the shoulders; the scarf covers the neck
  x.drawImage(skipperPortrait(mood, blink, ear, look), 3, 0);
  return c;
}

function drawHat(x, hat, furS) {
  const [a, b] = hat.c || [];
  if (hat.kind === 'beanie') {
    ellipse(x, 22, 13, 11, 6, a); rect(x, 11, 13, 23, 6, a); rect(x, 11, 17, 23, 2, '#f3ead8'); rect(x, 11, 19, 23, 1, b);
    for (let i = 12; i < 34; i += 3) px(x, i, 14, b);
    ellipse(x, 22, 5, 3, 3, '#ffffff'); px(x, 21, 4, '#e6e6e6');
  } else if (hat.kind === 'party') {
    for (let y = 1; y <= 15; y++) {
      const w = Math.round((y - 1) * .55);
      for (let dx = -w; dx <= w; dx++) px(x, 22 + dx, y, ((y >> 2) & 1) ? b : a);
    }
    rect(x, 13, 15, 19, 2, mix(a, '#000000', .2));
    ellipse(x, 22, 1, 2, 1, '#ffffff');
  } else if (hat.kind === 'cowboy') {
    rect(x, 14, 6, 17, 9, a); rect(x, 15, 5, 6, 1, a); rect(x, 24, 5, 6, 1, a); px(x, 22, 6, b);   // crown with a dent
    rect(x, 14, 12, 17, 2, b);                                                                     // band
    rect(x, 5, 15, 35, 2, a); rect(x, 3, 14, 3, 1, a); rect(x, 39, 14, 3, 1, a); rect(x, 5, 17, 35, 1, b);
  } else if (hat.kind === 'tophat') {
    rect(x, 14, 0, 17, 15, a); rect(x, 15, 1, 2, 12, mix(a, '#ffffff', .2));
    rect(x, 14, 11, 17, 2, b);
    rect(x, 9, 15, 27, 2, a); rect(x, 9, 17, 27, 1, mix(a, '#000000', .3));
  } else if (hat.kind === 'crown') {
    rect(x, 12, 10, 21, 6, a); rect(x, 12, 15, 21, 1, b);
    [12, 17, 22, 27, 32].forEach(cx => { rect(x, cx - 1, 6, 1, 4, a); px(x, cx - 1, 5, a); });
    rect(x, 31, 6, 1, 4, a);
    [[16, 12, '#e4572e'], [22, 12, '#3f78c9'], [28, 12, '#5fae6a']].forEach(([gx, gy, gc]) => { px(x, gx, gy, gc); px(x, gx + 1, gy, gc); });
  } else {
    // no hat: a little tuft of fur between the horns
    rect(x, 19, 9, 7, 2, furS); px(x, 21, 8, furS); px(x, 23, 8, furS);
  }
}

function drawGlasses(x, kind) {
  const frame = '#2a313b';
  if (kind === 'specs') {
    [15, 25].forEach(gx => { rect(x, gx, 21, 5, 1, frame); rect(x, gx, 27, 5, 1, frame); rect(x, gx - 1, 22, 1, 5, frame); rect(x, gx + 5, 22, 1, 5, frame); });
    rect(x, 21, 23, 4, 1, frame);
  } else if (kind === 'shades') {
    [14, 25].forEach(gx => { rect(x, gx, 22, 6, 5, '#1d2230'); px(x, gx + 1, 23, '#6d7a90'); });
    rect(x, 20, 23, 5, 1, frame); rect(x, 11, 23, 3, 1, frame); rect(x, 31, 23, 3, 1, frame);
  } else if (kind === 'stars') {
    const star = (cx, cy) => {
      rect(x, cx - 3, cy - 1, 7, 2, '#e2a72e'); rect(x, cx - 1, cy - 3, 3, 7, '#e2a72e'); rect(x, cx - 2, cy - 2, 5, 5, '#e2a72e');
      px(x, cx - 1, cy - 1, '#fff2b0');
    };
    star(17, 24); star(27, 24); rect(x, 21, 24, 3, 1, '#c8901f');
  }
}
