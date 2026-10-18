// Mel the chameleon, in pixel art. Everything draws onto small canvases that get scaled up with
// nearest-neighbor sampling, the same crisp style as Skipper. Mel faces right.
import { canvas, outline, mix, bayer, rng } from './pixel.js';
import { MEL_WARDROBE } from './mel-wardrobe.js';

export const FLASH = '#4cd35c';                 // the bright overlap green Mel flashes on a ✓
export const SPRITE_W = 46, SPRITE_H = 30;      // before the 1px outline
export const MOUTH = { x: 42, y: 15 };          // tongue starts here (sprite coords, before outline)
export const EYE = { x: 34, y: 11 };

function px(x, cx, cy, c) { x.fillStyle = c; x.fillRect(Math.floor(cx), Math.floor(cy), 1, 1); }
function rect(x, cx, cy, w, h, c) { x.fillStyle = c; x.fillRect(Math.floor(cx), Math.floor(cy), Math.round(w), Math.round(h)); }
function ellipse(x, cx, cy, rx, ry, c) {
  x.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25))));
    x.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

/** Turns a look ({ skin, pattern, hat, eyewear, neck } ids) into what to draw. */
export function melOutfit(look = {}) {
  const pick = (slot, id) => MEL_WARDROBE[slot].find(i => i.id === id) || MEL_WARDROBE[slot][0];
  return { skin: pick('skin', look.skin).c, pattern: pick('pattern', look.pattern).kind, hat: pick('hat', look.hat).kind, eyewear: pick('eyewear', look.eyewear).kind, neck: pick('neck', look.neck) };
}

/** Body shape (no colors yet): a mask canvas of every skin pixel. */
function bodyMask() {
  const c = canvas(SPRITE_W, SPRITE_H), x = c.getContext('2d'), k = '#000';
  ellipse(x, 21, 15, 11, 6, k);                        // body
  ellipse(x, 17, 11, 7, 3, k);                         // arched back
  ellipse(x, 34, 13, 7, 5, k);                         // head
  ellipse(x, 31, 8, 4, 3, k);                          // casque (the helmet crest)
  for (let i = 0; i < 4; i++) rect(x, 39 + i, 12 + Math.floor(i / 2), 1, 4 - Math.floor(i / 2), k);   // snout
  // curled tail: a spiral under the body's back end
  for (let t = 0; t < 1; t += .01) {
    const a = Math.PI * (1 + 2.6 * t), r = 6 - 4.6 * t, cx = 8 + Math.cos(a) * r, cy = 21 + Math.sin(a) * r * .9;
    const w = t < .5 ? 2 : 1;
    rect(x, cx - (w > 1 ? 1 : 0), cy - (w > 1 ? 1 : 0), w, w, k);
  }
  rect(x, 9, 14, 4, 3, k); rect(x, 7, 15, 3, 2, k);    // tail root
  // legs gripping the branch (the feet sit on row 27)
  [[13, 19], [26, 19]].forEach(([lx, ly]) => { rect(x, lx, ly, 3, 4, k); rect(x, lx - 1, ly + 4, 3, 3, k); rect(x, lx - 2, ly + 7, 5, 1, k); });
  return c;
}
let MASK = null;

const RAINBOW = ['#e5483b', '#f29a2e', '#f2d230', '#4bbf58', '#3b82d6', '#8e4fc4'];

/** The color of one skin pixel for a pattern. */
function patternColor(kind, x, y, base, shade, light, r) {
  switch (kind) {
    case 'spots': return ((x * 7 + y * 13) % 23 < 2 && y < 20) ? light : null;
    case 'stripes': return (x % 5 === 0 && y < 19) ? shade : null;
    case 'speckles': return (((x * 92821) ^ (y * 68917)) % 11 === 0) ? mix(light, '#ffffff', .3) : null;
    case 'zigzag': { const z = 13 + Math.abs((x % 6) - 3) - 1; return (y === z || y === z + 1) && x < 40 ? mix(base, '#f2d230', .7) : null; }
    case 'camo': { const v = Math.sin(x * .7 + Math.sin(y * .9) * 2) + Math.cos(y * .8 - x * .3); return v > .9 ? mix(base, '#3a3a1e', .55) : v < -1 ? mix(base, '#c9b77a', .45) : null; }
    case 'rainbow': return mix(base, RAINBOW[Math.floor(x / 5) % RAINBOW.length], .55);
    case 'galaxy': {
      const deep = mix(base, '#1a1240', .75);
      if (r() < .08) return r() < .5 ? '#ffffff' : '#f6b7e0';
      return bayer(x, y) < .3 ? mix(deep, '#5a2d8a', .5) : deep;
    }
    default: return null;
  }
}

/**
 * Mel, side view, standing on nothing (the scene draws the branch).
 * opts: { mood: happy|smile|neutral|sad|wow, blink, eye: {dx, dy} (-1..1), flash: color override, tongueOpen }
 */
export function melSprite(look = {}, { mood = 'smile', blink = false, eye = { dx: 0, dy: 0 }, flash = null, mouthOpen = false } = {}) {
  if (!MASK) MASK = bodyMask();
  const o = melOutfit(look);
  let [base, shade, light] = o.skin;
  if (flash) { base = flash; shade = mix(flash, '#000000', .25); light = mix(flash, '#ffffff', .35); }
  const c = canvas(SPRITE_W, SPRITE_H), x = c.getContext('2d');
  const m = MASK.getContext('2d').getImageData(0, 0, SPRITE_W, SPRITE_H).data;
  const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < SPRITE_W && yy < SPRITE_H && m[(yy * SPRITE_W + xx) * 4 + 3] > 0;
  const r = rng(77);
  for (let yy = 0; yy < SPRITE_H; yy++) for (let xx = 0; xx < SPRITE_W; xx++) {
    if (!on(xx, yy)) continue;
    let col = base;
    if (!on(xx, yy - 1)) col = light;                                   // lit top edge
    else if (!on(xx, yy + 1) || (yy > 18 && xx > 10 && xx < 32 && yy < 22)) col = shade;   // underside
    if (yy >= 17 && yy <= 19 && xx > 12 && xx < 31) col = light;        // belly stripe
    if (!flash) { const p = patternColor(o.pattern, xx, yy, col, shade, light, r); if (p) col = p; }
    px(x, xx, yy, col);
  }
  // dorsal crest
  for (let i = 0; i < 6; i++) px(x, 13 + i * 3, 7 + (i > 1 && i < 4 ? -1 : 0) - (i === 0 ? -1 : 0), shade);
  // jaw line + mouth
  const ink = '#1b1712', lip = mix(shade, '#000000', .35);
  if (mood === 'wow' || mouthOpen) { rect(x, 36, 15, 6, 2, '#7a2d33'); rect(x, 36, 15, 6, 1, ink); px(x, 41, 16, '#e7798c'); }
  else if (mood === 'happy') { rect(x, 35, 15, 6, 1, lip); px(x, 34, 14, lip); px(x, 41, 14, lip); }
  else if (mood === 'sad') { rect(x, 35, 15, 6, 1, lip); px(x, 34, 16, lip); px(x, 41, 16, lip); }
  else if (mood === 'neutral') { rect(x, 35, 15, 7, 1, lip); }
  else { rect(x, 35, 15, 6, 1, lip); px(x, 41, 14, lip); }
  // nostril
  px(x, 41, 12, lip);
  // turret eye
  ellipse(x, EYE.x, EYE.y, 3, 3, shade);
  ellipse(x, EYE.x, EYE.y, 2, 2, light);
  if (blink) rect(x, EYE.x - 3, EYE.y, 7, 1, shade);
  else {
    const dx = Math.max(-1, Math.min(1, Math.round(eye.dx || 0))), dy = Math.max(-1, Math.min(1, Math.round(eye.dy || 0)));
    rect(x, EYE.x + dx, EYE.y + dy - (mood === 'sad' ? 0 : 0), 2, 2, ink);
    px(x, EYE.x + dx, EYE.y + dy, '#ffffff');
  }
  if (mood === 'sad' && !blink) rect(x, EYE.x - 2, EYE.y - 3, 4, 1, ink);           // worried brow
  drawEyewear(x, o.eyewear);
  drawNeck(x, o.neck);
  drawHat(x, o.hat);
  return outline(c, '#17120d');
}

function drawHat(x, kind) {
  if (kind === 'leaf') {
    const g = '#5fb84a', d = '#3c8a33';
    [[27, 4, 3], [28, 3, 5], [29, 2, 6], [31, 1, 5], [33, 2, 3]].forEach(([lx, ly, w], i) => rect(x, lx, ly, w, 1, i % 2 ? g : d));
    rect(x, 30, 5, 4, 1, d); px(x, 35, 1, '#6b4a2a'); px(x, 36, 0, '#6b4a2a');
  } else if (kind === 'flowers') {
    [[27, 5, '#f28cb1'], [31, 3, '#f2d230'], [35, 5, '#ffffff']].forEach(([fx, fy, fc]) => {
      px(x, fx, fy - 1, fc); px(x, fx - 1, fy, fc); px(x, fx + 1, fy, fc); px(x, fx, fy + 1, fc); px(x, fx, fy, '#e5483b');
    });
    rect(x, 26, 7, 11, 1, '#3c8a33');
  } else if (kind === 'explorer') {
    ellipse(x, 31, 4, 5, 3, '#d8c08a'); rect(x, 25, 6, 13, 1, '#b89b5e'); rect(x, 26, 5, 11, 1, '#7a5a30');
    px(x, 29, 2, '#efe0b6'); px(x, 30, 2, '#efe0b6');
  } else if (kind === 'tophat') {
    rect(x, 29, 0, 5, 5, '#24232b'); rect(x, 29, 3, 5, 1, '#d9412b'); rect(x, 27, 5, 9, 1, '#24232b'); px(x, 30, 1, '#4a4955');
  } else if (kind === 'crown') {
    rect(x, 27, 3, 8, 3, '#f2c13d'); rect(x, 27, 5, 8, 1, '#c8901f');
    [27, 30, 34].forEach(cx => px(x, cx, 2, '#f2c13d')); px(x, 31, 2, '#f2c13d');
    px(x, 29, 4, '#e5483b'); px(x, 32, 4, '#3b82d6');
  }
}

function drawEyewear(x, kind) {
  const ring = (c, r) => { for (let a = 0; a < 32; a++) px(x, EYE.x + Math.round(Math.cos(a / 32 * Math.PI * 2) * r), EYE.y + Math.round(Math.sin(a / 32 * Math.PI * 2) * r), c); };
  if (kind === 'specs') { ring('#2a313b', 4); rect(x, 26, 10, 4, 1, '#2a313b'); }
  else if (kind === 'shades') { ellipse(x, EYE.x, EYE.y, 3, 3, '#1d2230'); px(x, EYE.x - 1, EYE.y - 1, '#6d7a90'); rect(x, 26, 10, 5, 1, '#1d2230'); }
  else if (kind === 'monocle') { ring('#e2a72e', 4); for (let i = 0; i < 5; i++) px(x, EYE.x - 3 - (i > 2 ? 1 : 0), EYE.y + 4 + i, '#e2a72e'); }
}

function drawNeck(x, item) {
  if (!item || item.kind === 'none') return;
  const c = item.c, d = mix(c, '#000000', .3);
  if (item.kind === 'bandana') {
    for (let i = 0; i < 4; i++) rect(x, 27 + i, 15 + i, 6 - i * 2 > 0 ? 6 - i * 2 : 1, 1, i % 2 ? d : c);
    rect(x, 27, 15, 7, 1, c); px(x, 29, 16, '#ffffff'); px(x, 31, 17, '#ffffff');
  } else if (item.kind === 'bowtie') {
    rect(x, 28, 16, 2, 3, c); rect(x, 32, 16, 2, 3, c); rect(x, 30, 17, 2, 1, d); px(x, 28, 17, d); px(x, 33, 17, d);
  } else if (item.kind === 'scarf') {
    rect(x, 27, 15, 6, 2, c); for (let i = 27; i < 33; i += 2) px(x, i, 16, d);
    rect(x, 27, 17, 2, 4, c); px(x, 27, 20, d); px(x, 28, 21, c);
  }
}

/** Mel's card portrait: Mel on a short branch, on a canvas `size` px square (low-res). */
export function melPortrait(look, opts = {}) {
  const c = canvas(56, 44), x = c.getContext('2d');
  const s = melSprite(look, opts);
  // branch
  rect(x, 0, 36, 56, 4, '#6b4a2a'); rect(x, 0, 36, 56, 1, '#8a6238'); rect(x, 0, 39, 56, 1, '#4a321c');
  for (let i = 3; i < 56; i += 7) px(x, i, 37, '#4a321c');
  rect(x, 44, 33, 3, 3, '#3c8a33'); rect(x, 46, 32, 4, 2, '#5fb84a');
  x.drawImage(s, 4, 36 - s.height + 3);
  return c;
}

export const MEL_MOODS = {
  happy: 'Best catch all week! My tongue is tired.',
  smile: 'Nice haul. I barely had to stretch.',
  neutral: 'A few snacks. The vines had more in them.',
  sad: 'Slim pickings today. Tomorrow\'s rings will be juicier.',
  ready: 'Type fast. I\'ll catch anything that fits.'
};

/** End-of-round mood from a round score (0–100), like Skipper's. */
export const moodFor = score => (score >= 85 ? 'happy' : score >= 55 ? 'smile' : score >= 25 ? 'neutral' : 'sad');
