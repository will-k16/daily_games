// Race the long-eared jerboa, in pixel art: enormous ears, a round body, long hind legs and a very long
// tail ending in a black-and-white tuft. The same crisp style as the other pets. Race faces right.
import { canvas, outline, mix } from './pixel.js';
import { RACE_WARDROBE, RAINBOW } from './race-wardrobe.js';

export const RACE_W = 54, RACE_H = 46;          // before the 1px outline
export const RACE_FEET = 43;                     // the row the feet stand on (sprite coords, after the outline)
const TOP = 6;                                   // headroom for the ears and a tall hat
const INK = '#1f1a17', EAR_IN = '#f2a7b4', EAR_IN_D = '#d9879a', NOSE = '#e07a8c', EYE = '#15110e';

function px(x, cx, cy, c) { x.fillStyle = c; x.fillRect(Math.floor(cx), Math.floor(cy), 1, 1); }
function rect(x, cx, cy, w, h, c) { x.fillStyle = c; x.fillRect(Math.floor(cx), Math.floor(cy), Math.round(w), Math.round(h)); }
function ellipse(x, cx, cy, rx, ry, c) {
  x.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25))));
    x.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
/** A filled, tilted oval: center, half-length along `ang` (radians from straight up), half-width. */
function ear(x, cx, cy, len, wid, ang, c) {
  x.fillStyle = c;
  const s = Math.sin(ang), co = Math.cos(ang);
  for (let yy = -len - 1; yy <= len + 1; yy++) for (let xx = -len - 1; xx <= len + 1; xx++) {
    const u = xx * co + yy * s, v = -xx * s + yy * co;       // v runs along the ear, u across
    if ((u / wid) ** 2 + (v / len) ** 2 <= 1) x.fillRect(Math.round(cx + xx), Math.round(cy + yy), 1, 1);
  }
}

/** Turns a look into what to draw. */
export function raceOutfit(look = {}) {
  const pick = (slot, id) => RACE_WARDROBE[slot].find(i => i.id === id) || RACE_WARDROBE[slot][0];
  return { fur: pick('fur', look.fur).c, hat: pick('hat', look.hat).kind, socks: pick('socks', look.socks), trail: pick('trail', look.trail) };
}

/** The trail color at step i (the rainbow trail cycles). */
export function trailColor(look, i = 0) {
  const t = raceOutfit(look).trail;
  return t.rainbow ? RAINBOW[Math.abs(i) % RAINBOW.length] : t.c;
}

/**
 * Race on nothing (the scene draws the ground). opts: { pose: sit|crouch|jump|land, blink, mood: smile|happy|wow|sad, ear (0/1 twitch) }
 */
export function raceSprite(look = {}, { pose = 'sit', blink = false, mood = 'smile', ear: twitch = 0 } = {}) {
  const o = raceOutfit(look);
  const [base, shade, belly] = o.fur;
  const light = mix(base, '#ffffff', .28);
  const c = canvas(RACE_W, RACE_H), x = c.getContext('2d');
  x.translate(0, TOP);
  const jump = pose === 'jump', crouch = pose === 'crouch' || pose === 'land';
  const dy = crouch ? 2 : 0;
  // Where the head sits, per pose.
  const hx = jump ? 41 : 37, hy = (jump ? 18 : 17) + dy;

  // Tail: long and thin, sweeping back to a black-and-white tuft.
  const tail = jump
    ? t => ({ x: 18 - t * 17, y: 22 - Math.sin(t * Math.PI) * 3 + t * 1 })
    : t => ({ x: 20 - t * 18, y: 31 + dy - Math.sin(t * Math.PI * .9) * 7 + t * 1 });
  for (let i = 0; i <= 60; i++) {
    const p = tail(i / 60), t = i / 60;
    const col = t > .9 ? '#ffffff' : t > .74 ? '#1d1a18' : shade;
    px(x, p.x, p.y, col);
    if (t > .74) { px(x, p.x, p.y - 1, col); px(x, p.x, p.y + 1, col); }
  }

  // Hind leg: a big haunch and a long foot (in socks, if any).
  const sock = (sx, sy, w) => {
    const s = o.socks;
    if (s.kind === 'none') return;
    for (let i = 0; i < w; i++) {
      const col = s.kind === 'rainbow' ? RAINBOW[i % RAINBOW.length] : s.kind === 'stripes' ? (i % 2 ? s.c[1] : s.c[0]) : (i === w - 1 ? s.c[1] : s.c[0]);
      rect(x, sx + i, sy, 1, 2, col);
    }
  };
  if (jump) {
    ellipse(x, 22, 22, 5, 4, shade);                                   // haunch
    for (let i = 0; i < 9; i++) rect(x, 14 - i, 25 + Math.floor(i / 3), 2, 2, shade);   // leg kicked back
    rect(x, 3, 27, 6, 2, belly); sock(3, 27, 6);                       // feet trailing
  } else {
    ellipse(x, 24, 29 + dy, 6, 6 - dy, shade);
    rect(x, 24, 34 + dy - (crouch ? 1 : 0), 3, 2, shade);
    rect(x, 24, 35, 12, 2, belly); px(x, 35, 35, shade);               // the long foot, flat on the ground
    sock(24, 35, 10);
  }

  // Body: an egg, lit on top, pale belly.
  const bx = jump ? 29 : 29, by = jump ? 21 : 26 + dy, brx = jump ? 9 : 7, bry = jump ? 5 : 7 - dy;
  ellipse(x, bx, by, brx, bry, base);
  ellipse(x, bx + 2, by + 2, brx - 3, bry - 3, belly);
  for (let i = -brx + 2; i < brx - 2; i++) px(x, bx + i, by - bry, light);
  // Haunch over the body (sitting), a soft shade line
  if (!jump) { ellipse(x, 25, 27 + dy, 4, 4, base); for (let i = 0; i < 5; i++) px(x, 21 + i, 31 + dy, shade); }
  // Little front paws, held up
  if (jump) { rect(x, 37, 24, 3, 1, belly); px(x, 39, 25, shade); }
  else { rect(x, 34, 29 + dy, 2, 3, belly); px(x, 35, 32 + dy, shade); }

  // Ears: huge, swept back (more when jumping), pink inside.
  const back = jump ? 1.25 : twitch ? .55 : .38;
  const ears = [[hx - 5, hy - 11, back + .12], [hx - 1, hy - 12, back - .1]];
  ears.forEach(([ex, ey, a], i) => {
    const len = jump ? 8 : 11;
    const exx = jump ? ex - 4 : ex, eyy = jump ? ey + 4 : ey;
    ear(x, exx, eyy, len, 3.4, -a, i ? base : shade);
    ear(x, exx + (jump ? 0 : .5), eyy + 1, len - 2.4, 1.6, -a, i ? EAR_IN : EAR_IN_D);
  });

  // Head: round with a short pointed snout.
  ellipse(x, hx, hy, 6, 5, base);
  ellipse(x, hx + 5, hy + 1, 3, 2, base);
  for (let i = -4; i <= 3; i++) px(x, hx + i, hy - 5, light);
  ellipse(x, hx + 2, hy + 3, 3, 1, belly);                               // pale chin
  px(x, hx + 8, hy, NOSE); px(x, hx + 8, hy + 1, mix(NOSE, '#000000', .2));
  // whiskers
  [[9, -1], [10, 0], [9, 2]].forEach(([wx, wy]) => px(x, hx + wx, hy + wy, mix(belly, '#000000', .25)));
  // eye: big and dark, with a shine
  if (blink) rect(x, hx + 1, hy - 1, 3, 1, mix(base, '#000000', .45));
  else {
    rect(x, hx + 1, hy - 2, 3, 3, EYE); px(x, hx + 1, hy - 2, '#ffffff');
    if (mood === 'wow') rect(x, hx + 1, hy - 3, 3, 1, EYE);
  }
  // mouth
  const lip = mix(shade, '#000000', .35);
  if (mood === 'happy') { px(x, hx + 5, hy + 3, lip); px(x, hx + 6, hy + 3, lip); px(x, hx + 7, hy + 2, lip); }
  else if (mood === 'sad') { px(x, hx + 5, hy + 3, lip); px(x, hx + 6, hy + 2, lip); }
  else if (mood === 'wow') { rect(x, hx + 5, hy + 2, 2, 2, '#7a2d33'); }
  else { px(x, hx + 6, hy + 3, lip); px(x, hx + 7, hy + 2, lip); }
  // cheek
  px(x, hx + 3, hy + 2, mix(base, '#e88a8a', .45));

  drawHat(x, o.hat, hx, hy, jump);
  return outline(c, INK);
}

function drawHat(x, kind, hx, hy, jump) {
  // The hat sits on the crown of the head, in front of the ears.
  const tx = hx + (jump ? 1 : 0), ty = hy - 5;
  if (kind === 'fez') {
    rect(x, tx - 2, ty - 4, 5, 4, '#c0392b'); rect(x, tx - 2, ty - 4, 5, 1, '#d9533f'); rect(x, tx - 3, ty, 7, 1, '#962d22');
    px(x, tx + 2, ty - 5, '#1f1a17'); px(x, tx + 3, ty - 4, '#f2c13d'); px(x, tx + 3, ty - 3, '#f2c13d');
  } else if (kind === 'party') {
    for (let i = 0; i < 6; i++) rect(x, tx - 3 + Math.floor(i / 2), ty - i, 7 - Math.floor(i / 2) * 2, 1, i % 2 ? '#ffd166' : '#f28cb1');
    px(x, tx, ty - 7, '#ffffff'); px(x, tx - 1, ty - 6, '#ffffff'); px(x, tx + 1, ty - 6, '#ffffff');
  } else if (kind === 'propeller') {
    ellipse(x, tx, ty - 1, 3, 2, '#3b82d6'); rect(x, tx - 3, ty, 7, 1, '#2a5fa0');
    px(x, tx - 1, ty - 2, '#d9412b'); px(x, tx + 1, ty - 2, '#f2c230');
    rect(x, tx, ty - 5, 1, 2, '#1f1a17'); rect(x, tx - 4, ty - 6, 4, 1, '#d9412b'); rect(x, tx + 1, ty - 6, 4, 1, '#f2c230');
  } else if (kind === 'explorer') {
    ellipse(x, tx, ty - 1, 4, 3, '#e2d1a6'); rect(x, tx - 6, ty + 1, 13, 1, '#b89b5e'); rect(x, tx - 4, ty, 9, 1, '#7a5a30');
    px(x, tx - 1, ty - 3, '#f4ead0'); px(x, tx, ty - 3, '#f4ead0');
  } else if (kind === 'cowboy') {
    rect(x, tx - 3, ty - 4, 7, 4, '#9a6a3c'); px(x, tx, ty - 4, '#7c532d'); rect(x, tx - 3, ty - 1, 7, 1, '#4a321c');
    rect(x, tx - 7, ty, 15, 1, '#9a6a3c'); px(x, tx - 7, ty - 1, '#9a6a3c'); px(x, tx + 7, ty - 1, '#9a6a3c'); px(x, tx - 2, ty - 3, '#b98a5a');
  } else if (kind === 'graduate') {
    rect(x, tx - 2, ty - 2, 5, 2, '#24232b'); rect(x, tx - 5, ty - 3, 11, 1, '#2f2e38'); rect(x, tx - 4, ty - 4, 9, 1, '#24232b');
    px(x, tx, ty - 5, '#f2c13d'); rect(x, tx + 4, ty - 3, 1, 4, '#f2c13d'); px(x, tx + 4, ty + 1, '#f2c13d');
  } else if (kind === 'wizard') {
    for (let i = 0; i < 9; i++) rect(x, tx - 3 + Math.floor(i / 2.5), ty - i, Math.max(1, 7 - Math.floor(i / 2.5) * 2), 1, '#4b3a8e');
    rect(x, tx - 5, ty, 11, 1, '#3a2c72'); px(x, tx - 1, ty - 3, '#f2c13d'); px(x, tx + 1, ty - 6, '#f2c13d'); px(x, tx, ty - 1, '#ffffff');
    px(x, tx + 2, ty - 9, '#4b3a8e'); px(x, tx + 3, ty - 9, '#4b3a8e');
  } else if (kind === 'tophat') {
    rect(x, tx - 2, ty - 6, 5, 6, '#24232b'); rect(x, tx - 2, ty - 2, 5, 1, '#d9412b'); rect(x, tx - 4, ty, 9, 1, '#24232b'); px(x, tx - 1, ty - 5, '#4a4955');
  } else if (kind === 'crown') {
    rect(x, tx - 3, ty - 3, 7, 3, '#f2c13d'); rect(x, tx - 3, ty - 1, 7, 1, '#c8901f');
    [tx - 3, tx, tx + 3].forEach(cx => px(x, cx, ty - 4, '#f2c13d'));
    px(x, tx - 1, ty - 2, '#e5483b'); px(x, tx + 2, ty - 2, '#3b82d6');
  }
}

/** Race's card portrait: Race sitting on a little dune, on a 56×52 canvas (low-res). */
export function racePortrait(look, opts = {}) {
  const c = canvas(56, 52), x = c.getContext('2d');
  for (let i = 0; i < 56; i++) {
    const top = 44 + Math.round(Math.sin(i / 9) * 1.5);
    rect(x, i, top, 1, 52 - top, '#e3bf83'); px(x, i, top, '#f2d7a6');
    if ((i * 7) % 11 === 0) px(x, i, top + 3, '#c9a066');
  }
  const s = raceSprite(look, opts);
  x.drawImage(s, Math.round((56 - s.width) / 2) + 2, 46 - RACE_FEET);
  return c;
}

export const RACE_MOODS = {
  thrilled: 'A perfect day! I could hop all the way home.',
  happy: 'Big jumps today. My ears are still flapping.',
  okay: 'Some good hops in there.',
  puzzled: 'History is a long way to jump.',
  sad: 'Short hops today. Tomorrow we leap!',
  ready: 'Name someone alive for both, and watch me jump their life.'
};
