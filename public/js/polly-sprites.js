// Polly the cockatoo, the townsfolk, the square's small critters and a 3×5 pixel font. Everything draws onto
// small canvases that get scaled up with nearest-neighbor sampling: the same crisp style as Skipper and Mel.
import { canvas, outline, mix } from './pixel.js';
import { POLLY_WARDROBE } from './polly-wardrobe.js';

export const INK = '#1f1a17';
export const LEFT = '#e8743b', RIGHT = '#1f8a8a';
export const POLLY_W = 30, POLLY_H = 41;           // before the 1px outline
export const POLLY_FEET = 40;                      // the row her feet stand on, after the outline
const TOP = 5;                                     // headroom for a tall crest or a top hat

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
  for (;;) {
    px(x, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/* ───────────── Pixel font (3×5) ───────────── */
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  '-': '000000111000000', '!': '010010010000010', '?': '110001010000010', '.': '000000000000010', ',': '000000000010100',
  '%': '101001010100101', '/': '001001010100100', '+': '000010111010000', "'": '010010000000000', '&': '010101010101011', ':': '000010000010000'
};
const glyphOf = ch => GLYPHS[ch] || GLYPHS[String(ch).normalize('NFD').replace(/[̀-ͯ]/g, '')] || null;
/** Draws text in the 3×5 font (upper case). Returns the width used. */
export function drawText(x, text, cx, cy, color, s = 1) {
  let at = cx;
  for (const raw of String(text).toUpperCase()) {
    if (raw === ' ') { at += 3 * s; continue; }
    const g = glyphOf(raw) || GLYPHS['?'];
    for (let i = 0; i < 15; i++) if (g[i] === '1') rect(x, at + (i % 3) * s, cy + Math.floor(i / 3) * s, s, s, color);
    at += 4 * s;
  }
  return at - cx - (text.length ? s : 0);
}
export const textWidth = (text, s = 1) => [...String(text)].reduce((w, ch) => w + (ch === ' ' ? 3 : 4) * s, 0) - s;

/* ───────────── Polly ───────────── */

/** Turns a look into what to draw. */
export function pollyOutfit(look = {}) {
  const pick = (slot, id) => POLLY_WARDROBE[slot].find(i => i.id === id) || POLLY_WARDROBE[slot][0];
  return { crest: pick('crest', look.crest).c, hat: pick('hat', look.hat).kind, bell: pick('bell', look.bell).c };
}

const WHITE = '#fbfbf7', SHADE = '#e2dfd6', SHADE2 = '#cfcbc0', BEAK = '#3b3d44', BEAK2 = '#5d606a', FEET = '#4a4c52';
const CREST_TIPS = {
  flat: [[-7, 1], [-6, 2], [-5, 0]],
  low: [[-7, -2], [-6, -4], [-4, -4]],
  half: [[-6, -6], [-4, -8], [-2, -8]],
  high: [[-4, -9], [-2, -10], [0, -10]],
  fan: [[-8, -5], [-5, -9], [-1, -11], [3, -10], [5, -7]]
};
const BELL_AT = { idle: [23, 19], ring: [24, 11], thrilled: [25, 1], sad: [21, 25], happy: [23, 17], okay: [23, 19], puzzled: [23, 19] };

/**
 * Polly on nothing (the scene draws the podium). opts: { crest: flat|low|half|high|fan, pose: idle|ring|thrilled|happy|okay|puzzled|sad,
 * blink, tilt (head tilted), nod (head dipped), swing (-1..1, the bell), scroll (the scroll unrolled) }
 */
export function pollySprite(look = {}, { crest = 'half', pose = 'idle', blink = false, tilt = false, nod = false, swing = 0, scroll = false } = {}) {
  const o = pollyOutfit(look);
  const c = canvas(POLLY_W, POLLY_H), x = c.getContext('2d');
  x.translate(0, TOP);
  const hx = 14 + (tilt ? -1 : 0), hy = 11 + (tilt ? 1 : 0) + (nod ? 1 : 0);
  const crestD = mix(o.crest, '#000000', .22), crestL = mix(o.crest, '#ffffff', .35);

  // tail feathers and feet
  rect(x, 7, 30, 4, 4, WHITE); px(x, 8, 33, SHADE2); px(x, 10, 33, SHADE2);
  rect(x, 11, 32, 2, 2, FEET); rect(x, 15, 32, 2, 2, FEET); px(x, 10, 34, FEET); px(x, 17, 34, FEET);
  // back wing (holds the scroll), then the body
  if (pose === 'thrilled') { ellipse(x, 5, 20, 4, 3, SHADE); for (let i = 1; i < 5; i++) px(x, i * 2, 21, SHADE2); }
  else ellipse(x, 8, 23, 3, 6, SHADE);
  ellipse(x, 13, 24, 7, 9, WHITE);
  for (let y = 17; y < 33; y++) for (let xx = 15; xx < 21; xx++) {
    const inside = ((xx - 13) / 7.5) ** 2 + ((y - 24) / 9.5) ** 2 < 1;
    if (inside && (xx - 13) + (y - 24) * .6 > 6) px(x, xx, y, SHADE);
  }
  rect(x, 11, 22, 3, 6, '#ffffff');
  // the scroll under the wing (unrolls for a moment when a question appears)
  if (pose !== 'thrilled') {
    if (scroll) {
      rect(x, 3, 24, 6, 1, '#c8a96a'); rect(x, 3, 25, 6, 9, '#f3e6c4');
      for (let y = 27; y < 33; y += 2) rect(x, 4, y, 4, 1, '#b39a6a');
      rect(x, 3, 33, 6, 1, '#c8a96a');
    } else {
      rect(x, 2, 26, 7, 2, '#efe0b6'); px(x, 2, 26, '#c8a96a'); px(x, 2, 27, '#c8a96a'); px(x, 8, 26, '#d9c38e');
    }
    ellipse(x, 8, 22, 2, 4, SHADE);
  }
  // crest (behind the hat)
  const base = [hx - 1, hy - 4];
  CREST_TIPS[crest].forEach(([tx, ty], i) => {
    const tip = [hx + tx, hy - 4 + ty];
    line(x, base[0], base[1], tip[0], tip[1], i % 2 ? crestD : o.crest);
    line(x, base[0] + 1, base[1], tip[0] + 1, tip[1] + (crest === 'flat' ? 0 : 1), o.crest);
    px(x, tip[0], tip[1], crestL);
  });
  if (crest === 'fan') { px(x, hx - 1, hy - 6, crestL); px(x, hx + 1, hy - 7, crestL); }
  // head
  ellipse(x, hx, hy, 5, 5, WHITE);
  for (let y = hy + 2; y <= hy + 5; y++) px(x, hx - 4 + (y - hy - 2), y, SHADE);
  // eye: a pale ring with a black eye
  rect(x, hx + 1, hy - 2, 3, 3, '#e3edf4');
  if (blink) rect(x, hx + 1, hy - 1, 3, 1, SHADE2);
  else { rect(x, hx + 2, hy - 2, 1, 2, '#111111'); px(x, hx + 1, hy - 1, '#111111'); px(x, hx + 3, hy - 2, '#ffffff'); }
  px(x, hx + 3, hy + 2, '#f2c4c4');
  // hooked beak
  rect(x, hx + 4, hy - 1, 2, 2, BEAK2); px(x, hx + 6, hy, BEAK2); px(x, hx + 6, hy + 1, BEAK); px(x, hx + 6, hy + 2, BEAK);
  rect(x, hx + 4, hy + 1, 2, 2, BEAK); px(x, hx + 5, hy + 3, BEAK);
  drawHat(x, o.hat, hx, hy);
  // front wing and the bell
  const [bx0, by] = BELL_AT[pose] || BELL_AT.idle;
  const bx = bx0 + (pose === 'ring' ? swing : 0);
  if (pose === 'thrilled') ellipse(x, 22, 15, 4, 3, SHADE);
  else ellipse(x, pose === 'ring' ? 19 : 18, pose === 'ring' ? 19 : 23, 3, 5, SHADE);
  drawBell(x, bx, by, o.bell, pose === 'ring' ? swing : 0);
  return outline(c, INK);
}

function drawBell(x, bx, by, col, swing) {
  const d = mix(col, '#000000', .32), l = mix(col, '#ffffff', .45);
  rect(x, bx, by, 1, 3, '#7a5233'); px(x, bx, by, '#5b3b24');
  const rows = [[3, 1], [4, 1], [5, 2], [6, 2], [7, 3]];
  rows.forEach(([dy, w]) => {
    const off = Math.round(swing * (dy - 3) / 2);
    rect(x, bx - w + off, by + dy, w * 2 + 1, 1, dy === 7 ? d : col);
    px(x, bx - w + off, by + dy, dy === 7 ? d : l);
  });
  px(x, bx + Math.round(swing * 2.5), by + 8, '#2b2b2b');
}

function drawHat(x, kind, hx, hy) {
  const k = '#2a2730', k2 = '#46414f';
  if (kind === 'tricorn') {
    rect(x, hx - 4, hy - 6, 9, 2, k); rect(x, hx - 2, hy - 8, 5, 2, k);
    px(x, hx - 5, hy - 7, k); px(x, hx + 5, hy - 7, k); rect(x, hx - 4, hy - 5, 9, 1, '#d9b04a');
  } else if (kind === 'bowler') {
    rect(x, hx - 5, hy - 5, 11, 1, k); ellipse(x, hx, hy - 8, 3, 3, k); rect(x, hx - 3, hy - 6, 7, 1, '#7a2e2e'); px(x, hx - 1, hy - 10, k2);
  } else if (kind === 'tophat') {
    rect(x, hx - 5, hy - 5, 11, 1, k); rect(x, hx - 3, hy - 13, 7, 8, k); rect(x, hx - 3, hy - 7, 7, 1, '#c0392b'); px(x, hx - 2, hy - 12, k2);
  } else if (kind === 'crown') {
    const g = '#f2c13d', gd = '#c8901f';
    rect(x, hx - 4, hy - 8, 9, 3, g); rect(x, hx - 4, hy - 6, 9, 1, gd);
    [-4, -1, 2, 4].forEach(d => px(x, hx + d, hy - 9, g)); px(x, hx, hy - 9, g);
    px(x, hx - 2, hy - 7, '#e5483b'); px(x, hx + 1, hy - 7, '#3b82d6'); px(x, hx + 3, hy - 7, '#4cb956');
  }
}

/** Polly's card portrait: Polly on a stone podium, on a 56×44 canvas. */
export function pollyPortrait(look, opts = {}) {
  const c = canvas(56, 44), x = c.getContext('2d');
  rect(x, 14, 38, 28, 6, '#a39e94'); rect(x, 14, 38, 28, 1, '#c9c4b8'); rect(x, 12, 42, 32, 2, '#8a857c');
  for (let i = 16; i < 42; i += 6) px(x, i, 40, '#8a857c');
  const s = pollySprite(look, opts);
  x.drawImage(s, 13, 38 - POLLY_FEET);
  return c;
}

/** A small head-and-hat icon for the shop. */
export function hatIcon(look, kind) {
  const s = pollySprite({ ...look, hat: kind }, { crest: 'half' });
  const c = canvas(22, 22), x = c.getContext('2d');
  x.drawImage(s, -3, -2);
  return c;
}

/* ───────────── Townsfolk ───────────── */
// 8 body types × palette swaps. Each is 7 wide; walking has 2 frames. They face right; the scene mirrors them.
export const BODY_TYPES = ['fedora', 'coat', 'cap', 'kid', 'cane', 'dog', 'dress', 'bun'];
const SKIN = ['#f1c7a3', '#d9a37a', '#a86f4c', '#7a4a2e', '#e8b98f'];
const HAIR = ['#2b1d14', '#6b4423', '#c69c5d', '#1c1c1c', '#a0522d', '#d8d6cf'];
const COAT = ['#4a6fa5', '#8a4f7d', '#3f7f5a', '#b5563c', '#6b5a8e', '#c9a227', '#2f3e4e', '#9c6644', '#d06f8a', '#5d8aa8'];
const PANTS = ['#2f3440', '#4b3b2f', '#3d4a5c', '#5a5a5a', '#6b4f3a'];
const HATS = ['#2b2b33', '#7a2e2e', '#3f5a3a', '#5a4632', '#2f4f6f'];

export function personLook(i, r) {
  const type = BODY_TYPES[i % BODY_TYPES.length];
  const pick = a => a[Math.floor(r() * a.length)];
  return { type, skin: pick(SKIN), hair: type === 'cane' ? '#d8d6cf' : pick(HAIR), coat: pick(COAT), pants: pick(PANTS), hat: pick(HATS) };
}

const personCache = new Map();
/** One townsperson. frame 0/1 = legs, `still` = standing. Height 14 (kids 10), plus a dog for the dog walker. */
export function personSprite(p, frame = 0, still = true) {
  const key = [p.type, p.skin, p.hair, p.coat, p.pants, p.hat, frame, still ? 1 : 0].join('|');
  if (personCache.has(key)) return personCache.get(key);
  const kid = p.type === 'kid', dog = p.type === 'dog';
  const W = dog ? 14 : 8, H = kid ? 11 : 15;
  const c = canvas(W, H), x = c.getContext('2d');
  const top = kid ? 1 : 1, head = top + (kid ? 0 : 1), body = head + 3, legs = H - (kid ? 3 : 4), bx = 1;
  const stoop = p.type === 'cane' ? 1 : 0;
  // legs
  const lh = kid ? 3 : 4;
  if (p.type === 'dress') { rect(x, bx, legs - 1, 5, 2, p.coat); rect(x, bx + 1, legs + 1, 1, lh - 1, p.skin); rect(x, bx + 3, legs + 1, 1, lh - 1, p.skin); }
  else if (still) { rect(x, bx + 1, legs, 1, lh, p.pants); rect(x, bx + 3, legs, 1, lh, p.pants); }
  else if (frame) { rect(x, bx, legs, 1, lh, p.pants); rect(x, bx + 1, legs, 1, 1, p.pants); rect(x, bx + 4, legs, 1, lh, p.pants); rect(x, bx + 3, legs, 1, 1, p.pants); }
  else { rect(x, bx + 1, legs, 1, lh, p.pants); rect(x, bx + 3, legs, 1, lh, p.pants); rect(x, bx + 2, legs, 1, 1, p.pants); }
  rect(x, bx + (still ? 1 : frame ? 0 : 1), H - 1, 1, 1, '#1f1a17'); rect(x, bx + (still ? 3 : frame ? 4 : 3), H - 1, 1, 1, '#1f1a17');
  // body (a long coat reaches the knees)
  const bodyH = legs - body + (p.type === 'coat' ? 2 : 0);
  rect(x, bx, body + stoop, 5, bodyH, p.coat);
  rect(x, bx + 4, body + stoop, 1, bodyH, mix(p.coat, '#000000', .25));
  if (p.type === 'bun') rect(x, bx - 1, body + 1, 2, 3, '#7a5233');                       // a backpack
  // arms
  px(x, bx + 5, body + 1 + stoop, mix(p.coat, '#000000', .15)); px(x, bx + 5, body + 2 + stoop, p.skin);
  // head
  rect(x, bx + 1 + stoop, head + stoop, 3, 3, p.skin); px(x, bx + 3 + stoop, head + 1 + stoop, '#1f1a17');
  rect(x, bx + 1 + stoop, head + stoop, 3, 1, p.hair); px(x, bx + 1 + stoop, head + 1 + stoop, p.hair);
  if (p.type === 'dress') { rect(x, bx, head + 1, 1, 3, p.hair); }
  if (p.type === 'bun') px(x, bx + 1, head - 1, p.hair);
  if (p.type === 'fedora') { rect(x, bx, head - 1, 5, 1, p.hat); rect(x, bx + 1, head - 2, 3, 1, p.hat); }
  if (p.type === 'cap') { rect(x, bx + 1, head - 1, 3, 1, p.hat); rect(x, bx + 4, head, 2, 1, p.hat); }
  if (p.type === 'cane') { line(x, bx + 6, body + 2, bx + 6, H - 1, '#7a5233'); }
  if (dog) {
    const d = '#8a5a3a';
    line(x, bx + 5, body + 2, 10, H - 4, '#c0392b');                                      // the lead
    rect(x, 9, H - 4, 4, 2, d); rect(x, 12, H - 5, 2, 2, d); px(x, 13, H - 5, '#1f1a17');
    px(x, 9, H - 2, d); px(x, 12, H - 2, d); px(x, 8, H - 5, d);
  }
  const out = outline(c, '#2a221c');
  personCache.set(key, out);
  return out;
}

/* ───────────── Critters and visitors ───────────── */
export function pigeonSprite(frame, flying = false) {
  const c = canvas(6, 5), x = c.getContext('2d'), g = '#8d93a0', d = '#5f6470';
  if (flying) { rect(x, 1, 2, 4, 2, g); if (frame) { px(x, 0, 1, d); px(x, 5, 1, d); } else { px(x, 0, 3, d); px(x, 5, 3, d); } px(x, 4, 1, '#3c6f5a'); }
  else if (frame) { rect(x, 0, 2, 4, 2, g); rect(x, 3, 3, 2, 1, d); px(x, 5, 4, '#e0a050'); px(x, 1, 4, '#c86f4a'); }
  else { rect(x, 0, 2, 4, 2, g); rect(x, 3, 1, 2, 2, d); px(x, 4, 1, '#3c6f5a'); px(x, 5, 2, '#e0a050'); px(x, 1, 4, '#c86f4a'); px(x, 3, 4, '#c86f4a'); }
  return c;
}
export function catSprite(stretch) {
  const c = canvas(10, 6), x = c.getContext('2d'), o = '#e08a3c', d = '#b8692a';
  if (stretch) { rect(x, 0, 3, 8, 2, o); rect(x, 6, 1, 3, 3, o); px(x, 6, 0, d); px(x, 8, 0, d); px(x, 0, 2, d); px(x, 1, 5, d); px(x, 6, 5, d); px(x, 8, 2, '#1f1a17'); }
  else { ellipse(x, 4, 3, 3, 2, o); rect(x, 6, 2, 3, 2, o); px(x, 6, 1, d); px(x, 8, 1, d); px(x, 2, 3, d); px(x, 4, 4, d); px(x, 1, 4, o); px(x, 0, 4, o); }
  return outline(c, '#3a2414');
}
export function duckSprite(frame, baby = false) {
  const c = canvas(7, 6), x = c.getContext('2d'), w = baby ? '#f2d94e' : '#f4f1e8';
  if (baby) { rect(x, 1, 3, 3, 2, w); rect(x, 3, 2, 2, 2, w); px(x, 5, 3, '#e08a2c'); }
  else { rect(x, 0, 3, 5, 2, w); rect(x, 3, 1, 2, 3, w); px(x, 4, 1, '#3c6f5a'); px(x, 5, 2, '#e08a2c'); px(x, 6, 2, '#e08a2c'); }
  px(x, frame ? 1 : 2, 5, '#e08a2c'); px(x, frame ? 3 : 2, 5, '#e08a2c');
  return outline(c, '#3a3226');
}
export function cartSprite() {
  const c = canvas(20, 20), x = c.getContext('2d');
  for (let i = 0; i < 16; i++) rect(x, 2 + i, 1 + Math.abs(8 - i) / 3, 1, 3, i % 4 < 2 ? '#f28cb1' : '#fff4f7');
  rect(x, 9, 4, 1, 7, '#8a8a8a');
  rect(x, 2, 10, 15, 6, '#f4f1e8'); rect(x, 2, 10, 15, 1, '#9fd3e6'); rect(x, 4, 12, 4, 2, '#f28cb1'); rect(x, 10, 12, 4, 2, '#8fd1a8');
  rect(x, 4, 16, 3, 3, '#3a3a3a'); rect(x, 13, 16, 3, 3, '#3a3a3a'); px(x, 17, 11, '#8a8a8a'); px(x, 18, 10, '#8a8a8a');
  return outline(c, '#2a221c');
}
export function paperSprite(frame) {
  const c = canvas(4, 4), x = c.getContext('2d');
  if (frame % 2) { rect(x, 0, 1, 4, 2, '#fbfbf7'); px(x, 1, 1, '#c9c4b8'); } else { rect(x, 1, 0, 2, 4, '#fbfbf7'); px(x, 1, 2, '#c9c4b8'); }
  return c;
}
