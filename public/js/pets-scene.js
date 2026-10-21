// The pet corner: Skipper, Mel and Polly hanging out together, dressed in their wardrobes, each with a
// name tag. The backdrop mixes their three worlds: a striped Venn-ring sun, Summit's mountains with a
// cable car gliding by, Mel's jungle on the left, Polly's clock-tower town on the right, and fairy lights.
// Pixel art on a 256×144 canvas (16:9, so it screenshots well), scaled up crisp.
import { canvas, mix, bayer, rng, palette, drawSky, ridgeNoise, drawTerrain, drawPine, cloudSprite, outfit, skipperStanding } from './pixel.js';
import { melSprite, MOUTH } from './mel.js';
import { pollySprite, POLLY_FEET, drawText, textWidth } from './polly-sprites.js';

export const W = 256, H = 144;
const GROUND = 116;
const LOG = { x0: 14, x1: 86, top: 106 };            // Mel's mossy log
const ROCK = { cx: 128, top: 108 };                  // Skipper's boulder
const POSTS = [204, 236], POST_TOP = 100;            // Polly's two pedestals
const TAG_Y = 129;
const CABLE = { a: { x: 70, y: 58 }, c: { x: 128, y: 82 }, b: { x: 186, y: 54 } };
const LIGHTS = { a: { x: 0, y: 6 }, c: { x: 128, y: 40 }, b: { x: 256, y: 6 } };
const BULBS = ['#f2c230', '#3b82d6', '#d9412b', '#4cb956', '#e8743b', '#1f8a8a'];

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
}

function rect(x, a, b, w, h, c) { x.fillStyle = c; x.fillRect(Math.floor(a), Math.floor(b), Math.round(w), Math.round(h)); }
function disc(x, cx, cy, r, c) { for (let yy = -r; yy <= r; yy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - yy * yy))); rect(x, cx - w, cy + yy, w * 2 + 1, 1, c); } }
const quad = (P0, C, P2, t) => { const u = 1 - t; return { x: u * u * P0.x + 2 * u * t * C.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * C.y + t * t * P2.y }; };

/** The sun: three overlapping Venn rings with a dithered glow, cut by synthwave stripes near the bottom. */
function vennSun(x, cx, cy, night) {
  const R = 17, rings = [[cx - 8, cy - 4, '#f2c230'], [cx + 8, cy - 4, '#3b82d6'], [cx, cy + 9, '#d9412b']];
  const bottom = cy + 9 + R, striped = y => { const f = bottom - y; return f < 14 && (f % 4 === 1 || (f < 6 && f % 4 === 2)); };
  const glow = night ? '#8fa0d8' : '#ffe2a8';
  for (let yy = cy - 40; yy < cy + 44; yy++) for (let xx = cx - 46; xx < cx + 46; xx++) {
    const d = Math.hypot(xx - cx, yy - (cy + 2));
    if (d > 27 && d < 40 && bayer(xx, yy) < (40 - d) / 26) rect(x, xx, yy, 1, 1, mix(glow, '#ffffff', .2));
  }
  for (let yy = cy - R - 6; yy <= bottom; yy++) {
    if (striped(yy)) continue;
    for (let xx = cx - R - 9; xx <= cx + R + 9; xx++) {
      const hit = rings.filter(([rx, ry]) => Math.hypot(xx - rx, yy - ry) <= R);
      if (!hit.length) continue;
      const ring = hit.some(([rx, ry]) => Math.hypot(xx - rx, yy - ry) > R - 1.2);
      let col = hit.length === 3 ? '#fff6dc' : hit.length === 2 ? mix(mix(hit[0][2], hit[1][2], .5), '#ffffff', .35) : hit[0][2];
      if (ring) col = mix(col, '#1f1a17', .3);
      if (night) col = mix(col, '#2a3d76', .35);
      rect(x, xx, yy, 1, 1, col);
    }
  }
}

/** Mel's jungle on the left: layered canopy blobs with hanging vines and a few big leaves. */
function jungle(x, pal, r) {
  const far = mix(pal.pine[2], pal.sky[0], .35), near = mix(pal.pine[1], '#0d2416', .25), leaf = pal.pine[0];
  [[0, 56, 30, 22, far], [34, 62, 22, 16, far], [-6, 76, 34, 24, near], [30, 82, 24, 18, near], [58, 90, 16, 12, near]].forEach(([cx, cy, rx, ry, col]) => {
    for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
      if ((xx / rx) ** 2 + (yy / ry) ** 2 > 1) continue;
      rect(x, cx + xx, cy + yy, 1, 1, yy < -ry * .55 && bayer(cx + xx, cy + yy) > .4 ? mix(col, leaf, .5) : col);
    }
  });
  for (let i = 0; i < 9; i++) {
    const vx = 4 + Math.floor(r() * 66), top = 62 + Math.floor(r() * 16), len = 10 + Math.floor(r() * 20);
    for (let k = 0; k < len; k++) rect(x, vx + Math.round(Math.sin(k / 4) * .8), top + k, 1, 1, k % 5 === 4 ? leaf : mix(near, '#000000', .15));
    rect(x, vx - 1, top + len, 3, 2, leaf);
  }
}

/** Polly's town on the right: rooftops, lit windows and a clock tower. */
function town(x, pal, r) {
  const lit = pal.tod === 'night' || pal.tod === 'evening';
  const wall = mix(pal.far[2], '#2a2440', .45), roof = mix('#8a3b2a', pal.far[2], .35), win = lit ? '#ffd66e' : mix(pal.sky[4], '#ffffff', .3);
  [[178, 18, 22], [198, 14, 28], [244, 16, 20], [260, 14, 26]].forEach(([hx, w, h]) => {
    const top = GROUND - 8 - h;
    rect(x, hx - w / 2, top, w, h + 8, wall);
    for (let k = 0; k < 7; k++) rect(x, hx - w / 2 - 1 + k, top - k, w + 2 - k * 2, 1, roof);
    for (let wy = top + 4; wy < GROUND - 14; wy += 7) for (let wx = hx - w / 2 + 3; wx < hx + w / 2 - 3; wx += 6) if (r() < .75) rect(x, wx, wy, 2, 3, win);
  });
  // the clock tower
  const tx = 222, tw = 16, ttop = 44;
  rect(x, tx - tw / 2, ttop, tw, GROUND - ttop, mix(wall, '#000000', .1));
  for (let k = 0; k < 12; k++) rect(x, tx - tw / 2 - 1 + Math.floor(k * .75), ttop - k, tw + 2 - Math.floor(k * 1.5), 1, roof);
  rect(x, tx, ttop - 16, 1, 5, roof); rect(x, tx - 1, ttop - 17, 3, 1, '#f2c230');
  disc(x, tx, ttop + 9, 5, '#f3ead8'); disc(x, tx, ttop + 9, 4, lit ? '#fff2c0' : '#f7f1e5');
  rect(x, tx, ttop + 5, 1, 4, '#1f1a17'); rect(x, tx, ttop + 9, 3, 1, '#1f1a17');
  for (let wy = ttop + 18; wy < GROUND - 12; wy += 8) rect(x, tx - 2, wy, 4, 4, win);
}

/** Sky, sun, mountains, both side worlds, the hill and the three perches: everything that doesn't move. */
function backdrop(pal, seed) {
  const c = canvas(W, H), x = c.getContext('2d'), r = rng(seed);
  const night = pal.tod === 'night';
  drawSky(x, W, H, pal);
  if (night || pal.tod === 'evening') for (let i = 0; i < 60; i++) rect(x, r() * W, r() * 60, 1, 1, r() < .2 ? '#ffe9a8' : '#ffffff');
  vennSun(x, 84, 30, night);
  drawTerrain(x, ridgeNoise(r, W, 76, 16, 4, 64), H, pal.far, pal, r, { snowline: 72, specks: 0 });
  // Summit's cable, station to station across the far range (the car is drawn each frame)
  for (let i = 0; i <= 400; i++) { const p = quad(CABLE.a, CABLE.c, CABLE.b, i / 400); rect(x, p.x, p.y, 1, 1, pal.cable); }
  [CABLE.a, CABLE.b].forEach(p => { rect(x, p.x - 1, p.y, 3, 10, pal.steel); rect(x, p.x - 4, p.y + 9, 9, 4, pal.log[1]); rect(x, p.x - 5, p.y + 8, 11, 1, pal.roof[0]); });
  drawTerrain(x, ridgeNoise(r, W, 96, 6, 3, 50), H, pal.mid, pal, r, { specks: .03 });
  for (let i = 0; i < 12; i++) drawPine(x, 72 + r() * 104, 102 + r() * 5, 8 + Math.floor(r() * 7), pal);
  jungle(x, pal, r);
  town(x, pal, r);
  // the hill everyone stands on: a soft dome with a bright rim and dithered texture
  for (let i = 0; i < W; i++) {
    const top = Math.round(GROUND - 6 + ((i - W / 2) / (W / 2)) ** 2 * 6);
    for (let y = top; y < H; y++) {
      const d = y - top;
      rect(x, i, y, 1, 1, d === 0 ? mix(pal.near[0], '#ffffff', .35) : d < 3 ? pal.near[0] : bayer(i, y) > .82 ? pal.near[2] : d > 18 && bayer(i, y) > .5 ? pal.near[2] : pal.near[1]);
    }
  }
  const flowers = ['#f28cb1', '#f2d230', '#ffffff', '#8fb7ff', '#e8743b'];
  for (let i = 0; i < 40; i++) {
    const fx = r() * W, fy = GROUND + 2 + r() * (H - GROUND - 4);
    rect(x, fx, fy + 1, 1, 1, pal.near[2]); rect(x, fx, fy, 1, 1, mix(flowers[i % 5], pal.near[1], night ? .5 : 0));
  }
  // Mel's mossy log
  const bark = '#6b4a2a', barkD = '#4a321c', barkL = '#8a6238', moss = '#5fb84a', mossD = '#3c8a33';
  rect(x, LOG.x0, LOG.top, LOG.x1 - LOG.x0, 9, bark); rect(x, LOG.x0, LOG.top + 7, LOG.x1 - LOG.x0, 2, barkD);
  for (let i = LOG.x0 + 3; i < LOG.x1 - 4; i += 7) rect(x, i, LOG.top + 3 + (i % 3), 4, 1, barkD);
  for (let i = LOG.x0; i < LOG.x1; i++) if (bayer(i, LOG.top) < .7) rect(x, i, LOG.top - (i % 5 === 0 ? 1 : 0), 1, 2, i % 3 ? moss : mossD);
  disc(x, LOG.x1, LOG.top + 4, 4, barkL); disc(x, LOG.x1, LOG.top + 4, 2, '#c29462'); rect(x, LOG.x1, LOG.top + 4, 1, 1, barkD);
  rect(x, LOG.x0 + 6, LOG.top - 4, 1, 4, mossD); rect(x, LOG.x0 + 4, LOG.top - 6, 5, 2, '#f28cb1');
  // Skipper's boulder: lit on top, shaded on the right
  const rock = mix('#8a929c', pal.near[2], .15), rockL = mix('#c3c9d1', pal.near[0], .1), rockD = mix('#5b636d', '#000000', .1);
  for (let yy = 0; yy < 14; yy++) {
    const half = Math.round(30 * Math.sqrt(Math.max(0, 1 - ((13 - yy) / 15) ** 2)));
    for (let xx = -half; xx <= half; xx++) rect(x, ROCK.cx + xx, ROCK.top + yy, 1, 1, yy < 2 ? rockL : xx > half * .45 ? rockD : bayer(xx & 3, yy) > .85 ? rockD : rock);
  }
  rect(x, ROCK.cx - 12, ROCK.top + 6, 5, 1, rockD); rect(x, ROCK.cx + 6, ROCK.top + 9, 7, 1, rockD);
  // Polly's pedestals: little stone columns like her podium in the square
  POSTS.forEach(cx => {
    rect(x, cx - 8, POST_TOP, 16, 3, '#c9c4b8'); rect(x, cx - 6, POST_TOP + 3, 12, GROUND - POST_TOP - 1, '#a39e94');
    rect(x, cx + 3, POST_TOP + 3, 3, GROUND - POST_TOP - 1, '#8a857c'); rect(x, cx - 9, GROUND + 2, 18, 3, '#8a857c');
    for (let y = POST_TOP + 6; y < GROUND; y += 4) rect(x, cx - 4, y, 1, 2, '#8a857c');
  });
  // the fairy-light wire (the bulbs are drawn each frame so they twinkle)
  for (let i = 0; i <= 500; i++) { const p = quad(LIGHTS.a, LIGHTS.c, LIGHTS.b, i / 500); rect(x, p.x, p.y, 1, 1, '#1f1a17'); }
  return c;
}

/** A dark name plate with the name in the 3×5 font, centered on cx. */
function nameTag(x, name, cx, y) {
  const w = textWidth(name) + 8;
  const left = Math.round(Math.max(1, Math.min(W - w - 1, cx - w / 2)));
  rect(x, left + 1, y + 1, w, 10, '#000000');
  rect(x, left, y, w, 10, '#1f1a17'); rect(x, left + 1, y + 1, w - 2, 8, '#3a3128');
  drawText(x, name, left + 4, y + 3, '#fff4dc');
}

const flip = src => { const c = canvas(src.width, src.height), x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; };

/**
 * Mounts the scene in `host`. looks: { skipper, mel, polly }. Returns { canvas, setLooks, snapshot, destroy }.
 */
export function createPetsScene(host, looks, { tod = timeOfDay(), reduced = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H; cv.className = 'pets-canvas';
  cv.setAttribute('role', 'img');
  host.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const pal = palette(1, tod);
  const bg = backdrop(pal, 11);
  const r = Math.random;
  const clouds = Array.from({ length: 4 }, (_, i) => ({ s: cloudSprite(rng(i + 3), 24 + i * 6, 10, pal), x: i * 70 + r() * 30, y: 4 + (i % 3) * 9, v: .015 + r() * .02 }));
  const glow = tod === 'night' || tod === 'evening';
  const motes = Array.from({ length: glow ? 12 : 8 }, () => ({ x: r() * W, y: 50 + r() * 60, a: r() * 6 }));
  let L = looks;
  const label = () => cv.setAttribute('aria-label', `${L.skipper.name || 'Skipper'} the goat, ${L.mel.name || 'Mel'} the chameleon and ${L.polly.name || 'Polly'} the cockatoo, hanging out on a hill.`);
  label();

  const later = (a, b) => performance.now() + a + Math.random() * (b - a);
  const home = ROCK.cx - 26;
  const mel = { x: 30, tx: 30, face: 1, blink: 0, eye: { dx: 0, dy: 0 }, mood: 'smile', tongue: 0, nextBlink: later(1500, 4000), nextLook: later(800, 2000), nextWalk: later(5000, 10000), nextTongue: later(5000, 11000), moodUntil: 0 };
  const sk = { x: home, tx: home, blink: 0, ear: 0, mood: 'smile', hop: 0, tail: 0, step: 0, nextBlink: later(1200, 3500), nextEar: later(2000, 5000), nextWalk: later(7000, 14000), nextMood: later(6000, 12000), nextHop: later(9000, 16000), moodUntil: 0 };
  const po = { post: 0, x: POSTS[0], y: 0, hop: null, blink: 0, crest: 'half', tilt: false, pose: 'idle', face: 1, nextBlink: later(1000, 3500), nextHop: later(8000, 15000), nextFidget: later(2500, 6000), fidgetUntil: 0 };
  let car = .2, carDir = 1;

  function step(now) {
    // Mel: blinks, eyes wander, strolls along the log, flicks a tongue at the fireflies
    if (now > mel.nextBlink) { mel.blink = now + 140; mel.nextBlink = later(2000, 5000); }
    if (now > mel.nextLook) { mel.eye = { dx: Math.round(r() * 2 - 1), dy: Math.round(r() * 2 - 1) }; mel.nextLook = later(700, 2200); }
    if (now > mel.nextWalk) { mel.tx = LOG.x0 + 2 + Math.round(r() * (LOG.x1 - LOG.x0 - 52)); mel.nextWalk = later(8000, 16000); }
    if (mel.x !== mel.tx && Math.floor(now / 180) !== mel.lastStep) { mel.lastStep = Math.floor(now / 180); mel.face = mel.tx > mel.x ? 1 : -1; mel.x += mel.face; }
    if (mel.x === mel.tx && mel.face < 0 && now > mel.nextLook - 300) mel.face = 1;
    if (now > mel.nextTongue && mel.x === mel.tx) { mel.tongue = now; mel.nextTongue = later(7000, 14000); }
    if (mel.tongue && now - mel.tongue > 420) { mel.tongue = 0; mel.mood = 'happy'; mel.moodUntil = now + 1400; }
    if (mel.moodUntil && now > mel.moodUntil) { mel.mood = 'smile'; mel.moodUntil = 0; }
    // Skipper: blinks, flicks ears and tail, trots about on the boulder, and now and then a happy goat hop
    if (now > sk.nextBlink) { sk.blink = now + 150; sk.nextBlink = later(1800, 4500); }
    if (now > sk.nextEar) { sk.ear = 1; sk.tail = 1; sk.earUntil = now + 300; sk.nextEar = later(2500, 6000); }
    if (sk.earUntil && now > sk.earUntil) { sk.ear = 0; sk.tail = 0; sk.earUntil = 0; }
    if (now > sk.nextWalk) { sk.tx = home + Math.round(r() * 16 - 8); sk.nextWalk = later(9000, 18000); }
    if (sk.x !== sk.tx && Math.floor(now / 160) !== sk.lastStep) { sk.lastStep = Math.floor(now / 160); sk.x += sk.tx > sk.x ? 1 : -1; }
    sk.step = sk.x !== sk.tx ? Math.floor(now / 160) % 2 : 0;
    if (now > sk.nextHop && !sk.hopStart) { sk.hopStart = now; sk.mood = 'happy'; sk.moodUntil = now + 1100; sk.nextHop = later(10000, 20000); }
    if (sk.hopStart) { const p = (now - sk.hopStart) / 500; sk.hop = p >= 1 ? 0 : Math.round(Math.sin(p * Math.PI) * 8); if (p >= 1) sk.hopStart = 0; }
    if (now > sk.nextMood) { sk.mood = r() < .6 ? 'happy' : 'wow'; sk.moodUntil = now + 1500; sk.nextMood = later(7000, 14000); }
    if (sk.moodUntil && now > sk.moodUntil) { sk.mood = 'smile'; sk.moodUntil = 0; }
    // Polly: blinks, fidgets with her crest, hops from one pedestal to the other
    if (now > po.nextBlink) { po.blink = now + 130; po.nextBlink = later(1500, 4000); }
    if (now > po.nextFidget) {
      const k = r();
      po.crest = k < .3 ? 'high' : k < .5 ? 'fan' : 'half'; po.tilt = k > .6; po.pose = k < .2 ? 'happy' : 'idle';
      po.fidgetUntil = now + 1200; po.nextFidget = later(3000, 7000);
    }
    if (po.fidgetUntil && now > po.fidgetUntil) { po.crest = 'half'; po.tilt = false; po.pose = 'idle'; po.fidgetUntil = 0; }
    if (now > po.nextHop && !po.hop) { const to = 1 - po.post; po.hop = { from: POSTS[po.post], to: POSTS[to], start: now, dur: 650 }; po.post = to; po.face = to ? 1 : -1; po.crest = 'high'; po.nextHop = later(9000, 18000); }
    if (po.hop) {
      const p = Math.min(1, (now - po.hop.start) / po.hop.dur);
      po.x = po.hop.from + (po.hop.to - po.hop.from) * p; po.y = -Math.sin(p * Math.PI) * 14;
      if (p >= 1) { po.hop = null; po.y = 0; po.x = POSTS[po.post]; po.crest = 'half'; setTimeout(() => { po.face = 1; }, 1500); }
    }
    // the cable car glides back and forth; clouds drift; fireflies wander
    car += .0009 * carDir; if (car > .85 || car < .15) carDir *= -1;
    clouds.forEach(c => { c.x += c.v; if (c.x > W + 4) c.x = -c.s.width; });
    motes.forEach(m => { m.a += .03; m.x += Math.cos(m.a) * .25 + .05; m.y += Math.sin(m.a * 1.7) * .2; if (m.x > W) m.x = 0; });
  }

  function draw(now) {
    ctx.drawImage(bg, 0, 0);
    clouds.forEach(c => ctx.drawImage(c.s, Math.round(c.x), c.y));
    // Skipper's cable car, in Skipper's cabin color
    const cp = quad(CABLE.a, CABLE.c, CABLE.b, car), cab = outfit(L.skipper).cabin;
    rect(ctx, cp.x, cp.y, 1, 3, pal.steel);
    rect(ctx, cp.x - 3, cp.y + 3, 7, 6, '#1d1410'); rect(ctx, cp.x - 2, cp.y + 4, 5, 4, cab); rect(ctx, cp.x - 1, cp.y + 5, 3, 1, '#bfe3f5');
    // fairy lights: each bulb twinkles on its own beat
    for (let i = 1; i < 26; i++) {
      const p = quad(LIGHTS.a, LIGHTS.c, LIGHTS.b, i / 26), on = Math.sin(now / 700 + i * 1.7) > -.5;
      const col = BULBS[i % BULBS.length];
      rect(ctx, p.x, p.y + 1, 1, 1, '#1f1a17');
      rect(ctx, p.x - 1, p.y + 2, 3, 3, on ? col : mix(col, '#1f1a17', .55));
      if (on) { rect(ctx, p.x, p.y + 2, 1, 1, '#ffffff'); if (glow) { ctx.globalAlpha = .25; rect(ctx, p.x - 2, p.y + 1, 5, 5, col); ctx.globalAlpha = 1; } }
    }
    // Mel on the log
    const ms = melSprite(L.mel, { mood: mel.mood, blink: now < mel.blink, eye: mel.eye, mouthOpen: !!mel.tongue });
    const mx = Math.round(mel.x), my = LOG.top - ms.height + 3;
    ctx.drawImage(mel.face < 0 ? flip(ms) : ms, mx, my);
    if (mel.tongue) {
      const p = Math.sin(Math.min(1, (now - mel.tongue) / 420) * Math.PI), len = Math.round(p * 14);
      const ox = mel.face < 0 ? mx + ms.width - 1 - (MOUTH.x + 1) : mx + MOUTH.x + 1, oy = my + MOUTH.y + 1;
      for (let i = 0; i < len; i++) rect(ctx, ox + i * mel.face, oy - Math.floor(i / 4), 1, 1, '#e5708f');
      if (len > 1) rect(ctx, ox + len * mel.face - (mel.face < 0 ? 1 : 0), oy - Math.floor(len / 4) - 1, 2, 2, '#f28cb1');
    }
    nameTag(ctx, L.mel.name || 'Mel', (LOG.x0 + LOG.x1) / 2, TAG_Y);
    // Skipper standing on the boulder (the shadow stays put while he hops)
    const ss = skipperStanding(L.skipper, { mood: sk.mood, blink: now < sk.blink, ear: sk.ear, step: sk.step, tail: sk.tail });
    const sy = ROCK.top - ss.height + 4 - sk.hop;
    ctx.globalAlpha = .3; rect(ctx, sk.x + 12 + Math.floor(sk.hop / 3), ROCK.top + 1, 28 - Math.floor(sk.hop / 1.5), 2, '#000000'); ctx.globalAlpha = 1;
    ctx.drawImage(ss, sk.x, sy);
    nameTag(ctx, L.skipper.name || 'Skipper', ROCK.cx, TAG_Y);
    // Polly on a pedestal
    const ps = pollySprite(L.polly, { crest: po.crest, pose: po.pose, blink: now < po.blink, tilt: po.tilt });
    const pxx = Math.round(po.x - ps.width / 2), pyy = POST_TOP - POLLY_FEET + 1 + Math.round(po.y || 0);
    ctx.drawImage(po.face < 0 ? flip(ps) : ps, pxx, pyy);
    nameTag(ctx, L.polly.name || 'Polly', (POSTS[0] + POSTS[1]) / 2, TAG_Y);
    // fireflies by night, pollen by day
    motes.forEach((m, i) => {
      if (glow && Math.sin(now / 400 + i) <= -.2) return;
      rect(ctx, m.x, m.y, 1, 1, glow ? '#f6f39a' : '#fff8d8');
      if (glow) { ctx.globalAlpha = .35; rect(ctx, m.x - 1, m.y, 3, 1, '#f6f39a'); rect(ctx, m.x, m.y - 1, 1, 3, '#f6f39a'); ctx.globalAlpha = 1; }
    });
    S.hit = { mel: [mx, my, ms.width, ms.height], skipper: [sk.x, sy, ss.width, ss.height], polly: [pxx, pyy, ps.width, ps.height] };
  }

  const S = { hit: {} };
  let raf = 0, last = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (now - last < 66) return;            // about 15 frames a second: plenty for pixel art
    last = now;
    if (!reduced) step(now);
    draw(now);
  };
  draw(performance.now());
  raf = requestAnimationFrame(loop);

  // Tapping a pet gets a reaction.
  cv.addEventListener('click', e => {
    const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * W, y = (e.clientY - b.top) / b.height * H, now = performance.now();
    const inside = ([a, c, w, h]) => x >= a && x < a + w && y >= c && y < c + h;
    if (S.hit.polly && inside(S.hit.polly)) { po.crest = 'fan'; po.pose = 'happy'; po.fidgetUntil = now + 1400; }
    else if (S.hit.skipper && inside(S.hit.skipper)) { if (!sk.hopStart) sk.hopStart = now; sk.mood = 'happy'; sk.moodUntil = now + 1500; sk.ear = 1; sk.tail = 1; sk.earUntil = now + 400; }
    else if (S.hit.mel && inside(S.hit.mel)) { if (!mel.tongue) mel.tongue = now; }
    draw(now);
  });

  return {
    canvas: cv,
    setLooks(l) { L = l; label(); draw(performance.now()); },
    /** A bigger copy of the current frame for saving (pixel-perfect, `k`× scale). */
    snapshot(k = 6) { const c = canvas(W * k, H * k), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, W * k, H * k); return c; },
    destroy() { cancelAnimationFrame(raf); cv.remove(); }
  };
}
