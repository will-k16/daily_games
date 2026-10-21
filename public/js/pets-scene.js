// The pet corner: Skipper, Mel and Polly hanging out in one meadow, dressed in their wardrobes,
// each with a name tag. Pixel art on a 224×126 canvas (16:9, so it screenshots well), scaled up crisp.
// They blink, look around, wander now and then, and react when tapped.
import { canvas, mix, bayer, rng, palette, drawSky, ridgeNoise, drawTerrain, drawPine, cloudSprite, sunSprite, skipperPortrait } from './pixel.js';
import { melSprite, MOUTH } from './mel.js';
import { pollySprite, POLLY_FEET, drawText, textWidth } from './polly-sprites.js';

export const W = 224, H = 126;
const GROUND = 100;
const BRANCH_Y = 70, FENCE_Y = 88, POST_Y = 90;
const POSTS = [172, 202];

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
}

function rect(x, a, b, w, h, c) { x.fillStyle = c; x.fillRect(Math.floor(a), Math.floor(b), Math.round(w), Math.round(h)); }

/** Sky, hills, the tree, the fence and Polly's posts: everything that doesn't move. */
function backdrop(pal, seed) {
  const c = canvas(W, H), x = c.getContext('2d'), r = rng(seed);
  drawSky(x, W, H, pal);
  const night = pal.tod === 'night';
  if (night || pal.tod === 'evening') for (let i = 0; i < 40; i++) rect(x, r() * W, r() * 50, 1, 1, night ? '#ffffff' : '#ffe9d6');
  x.drawImage(sunSprite(pal, night), 150, 10);
  drawTerrain(x, ridgeNoise(r, W, 62, 12, 3, 70), H, pal.far, pal, r, { specks: 0 });
  drawTerrain(x, ridgeNoise(r, W, 80, 7, 3, 50), H, pal.hill, pal, r, { specks: .04 });
  for (let i = 0; i < 9; i++) { const px = 60 + r() * 160; drawPine(x, px, 84 + r() * 6, 9 + Math.floor(r() * 6), pal); }
  // the meadow
  for (let y = GROUND - 6; y < H; y++) for (let i = 0; i < W; i++) {
    const top = GROUND - 6 + Math.round(Math.sin(i / 17) * 1.5);
    if (y < top) continue;
    const d = y - top;
    rect(x, i, y, 1, 1, d < 2 ? pal.near[0] : d < 4 && bayer(i, y) > .5 ? pal.near[0] : bayer(i, y) > .85 ? pal.near[2] : pal.near[1]);
  }
  const flowers = ['#f28cb1', '#f2d230', '#ffffff', '#8fb7ff'];
  for (let i = 0; i < 26; i++) {
    const fx = r() * W, fy = GROUND + r() * (H - GROUND - 2);
    rect(x, fx, fy + 1, 1, 1, pal.near[2]); rect(x, fx, fy, 1, 1, mix(flowers[i % 4], pal.near[1], pal.tod === 'night' ? .55 : 0));
  }
  // Mel's tree: a trunk on the left and one long branch reaching right
  const bark = mix('#6b4a2a', pal.near[2], .15), barkD = mix('#4a321c', pal.near[2], .15), barkL = '#8a6238';
  rect(x, 8, 30, 9, GROUND - 28, bark); rect(x, 8, 30, 2, GROUND - 28, barkL); rect(x, 15, 30, 2, GROUND - 28, barkD);
  rect(x, 5, GROUND - 2, 15, 3, barkD);
  rect(x, 16, BRANCH_Y, 80, 4, bark); rect(x, 16, BRANCH_Y, 80, 1, barkL); rect(x, 16, BRANCH_Y + 3, 80, 1, barkD);
  for (let i = 22; i < 96; i += 9) rect(x, i, BRANCH_Y + 1, 1, 1, barkD);
  rect(x, 94, BRANCH_Y - 3, 3, 3, '#3c8a33'); rect(x, 96, BRANCH_Y - 4, 4, 2, '#5fb84a');
  const leaf = pal.pine;
  [[12, 22, 16, 11], [28, 16, 14, 9], [2, 30, 10, 8], [40, 26, 11, 7]].forEach(([cx, cy, rx, ry]) => {
    for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
      if ((xx / rx) ** 2 + (yy / ry) ** 2 > 1) continue;
      rect(x, cx + xx, cy + yy, 1, 1, yy < -ry / 3 ? leaf[0] : bayer(cx + xx, cy + yy) > .7 ? leaf[2] : leaf[1]);
    }
  });
  // Skipper's fence
  const wood = mix('#a86c42', pal.near[2], .1), woodD = mix('#6b4028', pal.near[2], .1);
  for (let fx = 98; fx <= 150; fx += 13) { rect(x, fx, FENCE_Y - 3, 4, GROUND - FENCE_Y + 5, wood); rect(x, fx + 3, FENCE_Y - 3, 1, GROUND - FENCE_Y + 5, woodD); }
  // Polly's posts: two stumps
  POSTS.forEach(cx => {
    rect(x, cx - 8, POST_Y, 16, GROUND - POST_Y + 4, wood); rect(x, cx - 8, POST_Y, 16, 2, '#d9b07a'); rect(x, cx - 5, POST_Y, 10, 1, '#c29462');
    rect(x, cx + 5, POST_Y + 2, 3, GROUND - POST_Y + 2, woodD); rect(x, cx - 10, GROUND + 2, 20, 2, woodD);
  });
  return c;
}

/** The fence rails, drawn over Skipper so the head peeks out above them. */
function fenceFront(x, pal) {
  const wood = mix('#a86c42', pal.near[2], .1), woodD = mix('#6b4028', pal.near[2], .1), woodL = '#c9915f';
  [FENCE_Y, FENCE_Y + 7].forEach(y => { rect(x, 94, y, 62, 3, wood); rect(x, 94, y, 62, 1, woodL); rect(x, 94, y + 2, 62, 1, woodD); });
}

/** A dark name plate with the name in the 3×5 font, centered on cx. */
function nameTag(x, name, cx, y) {
  const w = textWidth(name) + 6;
  const left = Math.round(Math.max(1, Math.min(W - w - 1, cx - w / 2)));
  rect(x, left, y, w, 9, '#1f1a17'); rect(x, left + 1, y + 1, w - 2, 7, '#3a3128');
  drawText(x, name, left + 3, y + 2, '#fff4dc');
}

const flip = src => { const c = canvas(src.width, src.height), x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; };

/**
 * Mounts the scene in `host`. looks: { skipper, mel, polly }. Returns { canvas, setLooks, destroy }.
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
  const clouds = Array.from({ length: 3 }, (_, i) => ({ s: cloudSprite(rng(i + 3), 26 + i * 6, 10, pal), x: i * 80 + r() * 30, y: 8 + i * 9, v: .02 + r() * .02 }));
  const bugs = Array.from({ length: tod === 'night' || tod === 'evening' ? 7 : 3 }, () => ({ x: r() * W, y: 40 + r() * 50, a: r() * 6, glow: tod === 'night' || tod === 'evening' }));
  let L = looks;
  const label = () => cv.setAttribute('aria-label', `${L.skipper.name || 'Skipper'} the goat, ${L.mel.name || 'Mel'} the chameleon and ${L.polly.name || 'Polly'} the cockatoo, hanging out in a meadow.`);
  label();

  const later = (a, b) => performance.now() + a + Math.random() * (b - a);
  const mel = { x: 40, tx: 40, face: 1, blink: 0, eye: { dx: 0, dy: 0 }, mood: 'smile', tongue: 0, nextBlink: later(1500, 4000), nextLook: later(800, 2000), nextWalk: later(5000, 10000), nextTongue: later(5000, 11000), moodUntil: 0 };
  const sk = { x: 108, tx: 108, bob: 0, blink: 0, ear: 0, mood: 'smile', nextBlink: later(1200, 3500), nextEar: later(2000, 5000), nextWalk: later(7000, 14000), nextMood: later(6000, 12000), moodUntil: 0, peek: 0 };
  const po = { post: 0, x: POSTS[0], hop: null, blink: 0, crest: 'half', tilt: false, pose: 'idle', face: 1, nextBlink: later(1000, 3500), nextHop: later(8000, 15000), nextFidget: later(2500, 6000), fidgetUntil: 0 };

  function step(now) {
    // Mel: blinks, eyes wander, strolls along the branch, flicks a tongue at the bugs
    if (now > mel.nextBlink) { mel.blink = now + 140; mel.nextBlink = later(2000, 5000); }
    if (now > mel.nextLook) { mel.eye = { dx: Math.round(r() * 2 - 1), dy: Math.round(r() * 2 - 1) }; mel.nextLook = later(700, 2200); }
    if (now > mel.nextWalk) { mel.tx = 22 + Math.round(r() * 26); mel.nextWalk = later(8000, 16000); }
    if (mel.x !== mel.tx && Math.floor(now / 180) !== mel.lastStep) { mel.lastStep = Math.floor(now / 180); mel.face = mel.tx > mel.x ? 1 : -1; mel.x += mel.face; }
    if (mel.x === mel.tx && mel.face < 0 && now > mel.nextLook - 300) mel.face = 1;
    if (now > mel.nextTongue && mel.x === mel.tx) { mel.tongue = now; mel.nextTongue = later(7000, 14000); }
    if (mel.tongue && now - mel.tongue > 420) { mel.tongue = 0; mel.mood = 'happy'; mel.moodUntil = now + 1400; }
    if (mel.moodUntil && now > mel.moodUntil) { mel.mood = 'smile'; mel.moodUntil = 0; }
    // Skipper: blinks, twitches an ear, changes spots along the fence, now and then looks delighted
    if (now > sk.nextBlink) { sk.blink = now + 150; sk.nextBlink = later(1800, 4500); }
    if (now > sk.nextEar) { sk.ear = 1; sk.earUntil = now + 300; sk.nextEar = later(2500, 6000); }
    if (sk.earUntil && now > sk.earUntil) { sk.ear = 0; sk.earUntil = 0; }
    if (now > sk.nextWalk) { sk.tx = 100 + Math.round(r() * 22); sk.nextWalk = later(9000, 18000); }
    if (sk.x !== sk.tx && Math.floor(now / 140) !== sk.lastStep) { sk.lastStep = Math.floor(now / 140); sk.x += sk.tx > sk.x ? 1 : -1; }
    sk.bob = sk.x !== sk.tx ? (Math.floor(now / 140) % 2) : 0;
    if (now > sk.nextMood) { sk.mood = r() < .6 ? 'happy' : 'wow'; sk.moodUntil = now + 1500; sk.nextMood = later(7000, 14000); }
    if (sk.moodUntil && now > sk.moodUntil) { sk.mood = 'smile'; sk.moodUntil = 0; }
    // Polly: blinks, fidgets with her crest, hops from one post to the other
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
    clouds.forEach(c => { c.x += c.v; if (c.x > W + 4) c.x = -c.s.width; });
    bugs.forEach(b => { b.a += .03; b.x += Math.cos(b.a) * .25 + .05; b.y += Math.sin(b.a * 1.7) * .2; if (b.x > W) b.x = 0; });
  }

  function draw(now) {
    ctx.drawImage(bg, 0, 0);
    clouds.forEach(c => ctx.drawImage(c.s, Math.round(c.x), c.y));
    // Mel on the branch
    const ms = melSprite(L.mel, { mood: mel.mood, blink: now < mel.blink, eye: mel.eye, mouthOpen: !!mel.tongue });
    const mx = Math.round(mel.x), my = BRANCH_Y - ms.height + 3;
    ctx.drawImage(mel.face < 0 ? flip(ms) : ms, mx, my);
    if (mel.tongue) {
      const p = Math.sin(Math.min(1, (now - mel.tongue) / 420) * Math.PI), len = Math.round(p * 14);
      const ox = mel.face < 0 ? mx + ms.width - 1 - (MOUTH.x + 1) : mx + MOUTH.x + 1, oy = my + MOUTH.y + 1;
      for (let i = 0; i < len; i++) rect(ctx, ox + i * mel.face, oy - Math.floor(i / 4), 1, 1, '#e5708f');
      if (len > 1) rect(ctx, ox + len * mel.face - (mel.face < 0 ? 1 : 0), oy - Math.floor(len / 4) - 1, 2, 2, '#f28cb1');
    }
    nameTag(ctx, L.mel.name || 'Mel', mx + ms.width / 2, BRANCH_Y + 7);
    // Skipper peeking over the fence
    const ss = skipperPortrait(sk.mood, now < sk.blink, sk.ear, L.skipper);
    ctx.drawImage(ss, sk.x, FENCE_Y - ss.height + 9 + sk.bob);
    fenceFront(ctx, pal);
    nameTag(ctx, L.skipper.name || 'Skipper', sk.x + ss.width / 2, GROUND + 6);
    // Polly on a post
    const ps = pollySprite(L.polly, { crest: po.crest, pose: po.pose, blink: now < po.blink, tilt: po.tilt });
    const pxx = Math.round(po.x - ps.width / 2), pyy = POST_Y - POLLY_FEET + 1 + Math.round(po.y || 0);
    ctx.drawImage(po.face < 0 ? flip(ps) : ps, pxx, pyy);
    nameTag(ctx, L.polly.name || 'Polly', po.x, GROUND + 6);
    // bugs / fireflies
    bugs.forEach((b, i) => {
      const on = !b.glow || (Math.sin(now / 400 + i) > -.2);
      if (on) rect(ctx, b.x, b.y, 1, 1, b.glow ? '#f6f39a' : (i % 2 ? '#ffffff' : '#f2d230'));
      if (b.glow && on) { ctx.globalAlpha = .35; rect(ctx, b.x - 1, b.y, 3, 1, '#f6f39a'); rect(ctx, b.x, b.y - 1, 1, 3, '#f6f39a'); ctx.globalAlpha = 1; }
    });
    S.hit = { mel: [mx, my, ms.width, ms.height], skipper: [sk.x, FENCE_Y - ss.height + 9, ss.width, ss.height - 6], polly: [pxx, pyy, ps.width, ps.height] };
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
    else if (S.hit.skipper && inside(S.hit.skipper)) { sk.mood = 'happy'; sk.moodUntil = now + 1500; sk.ear = 1; sk.earUntil = now + 400; }
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

