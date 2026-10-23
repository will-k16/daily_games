// Lifeline's scene: a desert timeline at sunset with the two events as flags. Name someone and Race the
// jerboa hops to the day they were born, then leaps to the day they died, leaving a dashed trail along
// the arc. The timeline zooms out first if the life runs past either event.
// Pixel art on a 360×170 canvas, scaled up crisp. Times are day numbers (see lifeline-score.js).
import { canvas, mix, bayer, rng } from './pixel.js';
import { drawText, textWidth } from './polly-sprites.js';
import { raceSprite, trailColor, RACE_FEET } from './race.js';
import { yearOf, yearLabel, dayOfYear } from './lifeline-score.js';

export const W = 360, H = 170;
const TRACK = 140, MARGIN = 26;
export const FLAG_A = '#6b4fbb', FLAG_B = '#c2417a';
const FOOT_X = 31;                                   // Race's feet, across the sprite (after the outline)

function rect(x, a, b, w, h, c) { x.fillStyle = c; x.fillRect(Math.floor(a), Math.floor(b), Math.round(w), Math.round(h)); }
function disc(x, cx, cy, r, c) { for (let yy = -r; yy <= r; yy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - yy * yy))); rect(x, cx - w, cy + yy, w * 2 + 1, 1, c); } }
const ease = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const flip = src => { const c = canvas(src.width, src.height), x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; };

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
}

const SKY = {
  morning: ['#7d8fd0', '#b39ccc', '#e7a9a8', '#f6c39a', '#fbdcb4'],
  day: ['#4b9ad8', '#6fb2e6', '#97c9ef', '#c0def4', '#e4f0f6'],
  evening: ['#3a2f74', '#6e3f86', '#b5507a', '#ea7a5c', '#f7b36a'],
  night: ['#0a0f26', '#121a3c', '#1b2550', '#243063', '#2e3b72']
};
const DESERT = {
  morning: { far: '#c99a8a', mid: '#e0b07a', near: '#ebc489', sand: ['#f0d4a0', '#e2bd82', '#cfa66a'] },
  day: { far: '#d4a27a', mid: '#e6b673', near: '#efc785', sand: ['#f4dcaa', '#e8c58d', '#d6ad72'] },
  evening: { far: '#7e4a63', mid: '#c46a50', near: '#d98c5c', sand: ['#e9b57e', '#d49a66', '#b97e52'] },
  night: { far: '#2c2c4f', mid: '#46406a', near: '#5a4f72', sand: ['#7b6f8e', '#6a5f7e', '#574d6b'] }
};

/** Sky, sun or moon, mesas, dunes, cacti and the sand: everything that doesn't move. */
function backdrop(tod, seed) {
  const c = canvas(W, H), x = c.getContext('2d'), r = rng(seed);
  const sky = SKY[tod] || SKY.day, d = DESERT[tod] || DESERT.day, night = tod === 'night';
  const bands = sky.length, top = 118;
  for (let y = 0; y < top; y++) {
    const f = y / top * (bands - 1), i = Math.min(bands - 2, Math.floor(f)), t = f - i;
    for (let xx = 0; xx < W; xx++) rect(x, xx, y, 1, 1, bayer(xx, y) < t ? sky[i + 1] : sky[i]);
  }
  if (night || tod === 'evening') for (let i = 0; i < 70; i++) rect(x, r() * W, r() * 70, 1, 1, r() < .25 ? '#ffe9a8' : '#ffffff');
  // the sun sinking behind the mesas (or the moon)
  if (night) { disc(x, 290, 30, 9, '#f3ead8'); disc(x, 294, 27, 8, sky[0]); }
  else {
    const sy = tod === 'day' ? 34 : 76, col = tod === 'day' ? '#fff1b8' : '#ffd27a';
    for (let yy = -26; yy <= 26; yy++) for (let xx = -26; xx <= 26; xx++) { const dd = Math.hypot(xx, yy); if (dd > 15 && dd < 26 && bayer(xx & 3, yy & 3) < (26 - dd) / 22) rect(x, 270 + xx, sy + yy, 1, 1, mix(col, '#ffffff', .3)); }
    disc(x, 270, sy, 14, col);
    for (let k = 0; k < 4; k++) rect(x, 256, sy + 4 + k * 3, 29, 1, sky[Math.min(bands - 1, 3 + (k > 1 ? 1 : 0))]);
  }
  // mesas: flat-topped buttes far away
  [[40, 82, 54, 18], [128, 88, 30, 12], [214, 78, 70, 22], [330, 86, 46, 14]].forEach(([cx, ty, w, h]) => {
    for (let yy = 0; yy < 118 - ty; yy++) {
      const slope = yy < h ? 0 : Math.floor((yy - h) * .6);
      rect(x, cx - w / 2 - slope, ty + yy, w + slope * 2, 1, yy === 0 ? mix(d.far, '#ffffff', .15) : d.far);
    }
    for (let k = 3; k < h; k += 4) rect(x, cx - w / 2 + 3, ty + k, w - 6, 1, mix(d.far, '#000000', .08));
  });
  // dunes: two rolling layers
  const dune = (base, amp, len, ph, col, rim) => {
    for (let xx = 0; xx < W; xx++) {
      const t = Math.round(base + Math.sin(xx / len + ph) * amp + Math.sin(xx / (len * .37) + ph * 2) * amp * .35);
      for (let y = t; y < H; y++) rect(x, xx, y, 1, 1, y === t ? rim : col);
    }
  };
  dune(112, 4, 34, 1.3, d.mid, mix(d.mid, '#ffffff', .25));
  dune(124, 3, 22, .2, d.near, mix(d.near, '#ffffff', .3));
  // cacti and rocks
  const cactus = (cx, base, h) => {
    const g = night ? '#3c5b4a' : '#4f8a4a', gd = night ? '#2b4437' : '#3a6b38';
    rect(x, cx - 2, base - h, 4, h, g); rect(x, cx + 1, base - h, 1, h, gd);
    rect(x, cx - 6, base - h + 6, 4, 2, g); rect(x, cx - 6, base - h + 2, 2, 5, g);
    rect(x, cx + 2, base - h + 9, 4, 2, g); rect(x, cx + 4, base - h + 5, 2, 5, g);
    rect(x, cx - 1, base - h - 1, 2, 1, mix(g, '#ffffff', .3));
  };
  cactus(18, 126, 18); cactus(342, 128, 22); cactus(176, 118, 10);
  [[70, 128], [250, 129], [300, 126]].forEach(([rx, ry]) => { rect(x, rx, ry, 6, 3, mix(d.far, '#000000', .2)); rect(x, rx + 1, ry - 1, 4, 1, mix(d.far, '#ffffff', .1)); });
  // the sand floor under the timeline
  for (let y = 130; y < H; y++) for (let xx = 0; xx < W; xx++) rect(x, xx, y, 1, 1, bayer(xx, y) > .85 ? d.sand[2] : y > 156 && bayer(xx, y) > .5 ? d.sand[1] : d.sand[0]);
  return c;
}

/** A dark plate with text in the 3×5 font, centered on cx (kept inside the canvas). */
function plate(x, text, cx, y, bg = '#1f1a17', fg = '#fff4dc') {
  const w = textWidth(text) + 6;
  const left = Math.round(Math.max(1, Math.min(W - w - 1, cx - w / 2)));
  rect(x, left, y, w, 9, bg);
  drawText(x, text, left + 3, y + 2, fg);
  return left;
}

/** Year steps for the ticks: as few as gives about 5 labels. */
function tickStep(years) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find(s => years / s <= 5) || 2000;
}

/**
 * Mounts the scene in `host`. Returns { setEvents(a, b, showDates), play(life, { animate, onDone }), clear(), setLook(look), destroy }.
 * a, b: { lo, hi, label } (day numbers); life: { from, to, living }.
 */
export function createLifelineScene(host, look, { tod = timeOfDay(), reduced = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H; cv.className = 'life-canvas';
  cv.setAttribute('role', 'img');
  host.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const bg = backdrop(tod, 7);
  const ink = tod === 'night' ? '#f3ead8' : '#1f1a17';

  let L = look, ev = null, showDates = false;
  let view = { lo: 0, hi: 1 }, viewFrom = null, viewTo = null, zoomStart = 0;
  let life = null, jump = null, done = false;
  const race = { x: W / 2, y: TRACK, pose: 'sit', face: 1, blink: 0, ear: 0, mood: 'smile', nextBlink: 0, nextEar: 0, nextHop: 0, hop: null };
  const dust = [];

  const X = n => MARGIN + (n - view.lo) / (view.hi - view.lo) * (W - 2 * MARGIN);

  function frameFor(a, b, more) {
    const lo = Math.min(a.lo, more ? more.from : a.lo), hi = Math.max(b.hi, more ? more.to : b.hi);
    const pad = Math.max((hi - lo) * .08, 365 * 2);
    return { lo: lo - pad, hi: hi + pad };
  }

  function drawTimeline(now) {
    const y = TRACK;
    // the track
    rect(ctx, 0, y, W, 2, ink); rect(ctx, 0, y + 2, W, 1, mix(ink, '#ffffff', .5));
    // the gap between the events, lit up
    if (ev) {
      const xa = X(ev.a.hi), xb = X(ev.b.lo);
      rect(ctx, xa, y + 3, xb - xa, 3, '#f2c13d'); ctx.globalAlpha = .35; rect(ctx, xa, y - 2, xb - xa, 2, '#f2c13d'); ctx.globalAlpha = 1;
    }
    // ticks, and their years only when the dates are showing (otherwise the scale would give them away)
    const y0 = yearOf(view.lo), y1 = yearOf(view.hi), step = tickStep(y1 - y0);
    for (let yr = Math.ceil(y0 / step) * step; yr <= y1; yr += step) {
      const n = dayOfYear(yr), tx = Math.round(X(n));
      if (tx < 4 || tx > W - 4) continue;
      rect(ctx, tx, y + 3, 1, 3, ink);
      if (!showDates) continue;
      const label = yearLabel(yr === 0 ? 0.5 : yr);
      drawText(ctx, label, Math.round(Math.max(1, Math.min(W - textWidth(label) - 1, tx - textWidth(label) / 2))), y + 8, ink);
    }
    if (!ev) return;
    // the two event flags
    [[ev.a, FLAG_A, '1'], [ev.b, FLAG_B, '2']].forEach(([e, col, n], i) => {
      const fx = Math.round(X(i ? e.lo : e.hi));
      rect(ctx, fx, y - 34, 1, 34, ink);
      const wave = reduced ? 0 : Math.round(Math.sin(now / 300 + i) * .8);
      for (let k = 0; k < 7; k++) rect(ctx, fx + 1, y - 34 + k + (k > 2 ? wave : 0), 11 - Math.abs(k - 3), 1, col);
      drawText(ctx, n, fx + 3, y - 33, '#ffffff');
      if (showDates) plate(ctx, yearLabel(yearOf((e.lo + e.hi) / 2)), fx, y - 46, col, '#ffffff');
    });
  }

  function drawLife(now) {
    if (!life) return;
    const xb = X(life.from), xd = X(life.to);
    const pts = jump ? jump.path(view) : null;
    // the dashed trail along the arc (as far as Race has got)
    if (pts) {
      const upto = done ? pts.length : Math.floor(pts.length * Math.min(1, jump.t));
      for (let i = 0; i < upto; i++) if (i % 6 < 3) rect(ctx, pts[i].x, pts[i].y, 2, 2, trailColor(L, Math.floor(i / 6)));
    }
    // birth: a little sprout; death: a small stone, or a sparkle for someone alive today
    if (jump && jump.started) {
      rect(ctx, xb, TRACK - 4, 1, 4, '#4f8a4a'); rect(ctx, xb - 2, TRACK - 6, 2, 2, '#6fb85a'); rect(ctx, xb + 1, TRACK - 7, 2, 2, '#6fb85a');
    }
    if (done) {
      if (life.living) { const s = Math.floor(now / 250) % 2; rect(ctx, xd - 3, TRACK - 9 - s, 7, 1, '#fff1b8'); rect(ctx, xd, TRACK - 12 - s, 1, 7, '#fff1b8'); }
      else { rect(ctx, xd - 3, TRACK - 7, 7, 7, '#9a958c'); rect(ctx, xd - 2, TRACK - 8, 5, 1, '#9a958c'); rect(ctx, xd - 1, TRACK - 5, 3, 1, '#6b665e'); rect(ctx, xd, TRACK - 6, 1, 3, '#6b665e'); }
    }
  }

  /** The birth and death years, drawn last so Race never covers them. */
  function drawPlates() {
    if (!life || !jump || !jump.started || !life.labels || !showDates) return;
    const [bl, dl] = life.labels;
    plate(ctx, bl, X(life.from), TRACK - 20, '#3a6b38');
    if (done) plate(ctx, dl, X(life.to), TRACK - (life.living ? 26 : 20), life.living ? '#b8862e' : '#5d5850');
  }

  function drawRace(now) {
    const s = raceSprite(L, { pose: race.pose, blink: now < race.blink, mood: race.mood, ear: race.ear });
    const img = race.face < 0 ? flip(s) : s;
    const fx = race.face < 0 ? s.width - FOOT_X : FOOT_X;
    // a soft shadow on the track while airborne
    if (race.y < TRACK - 2) { ctx.globalAlpha = .25; rect(ctx, race.x - 8, TRACK - 1, 16, 2, '#000000'); ctx.globalAlpha = 1; }
    ctx.drawImage(img, Math.round(race.x - fx), Math.round(race.y - RACE_FEET));
    dust.forEach(p => { ctx.globalAlpha = Math.max(0, 1 - p.age / 400); rect(ctx, p.x, p.y, 2, 2, '#f4dcaa'); ctx.globalAlpha = 1; });
  }

  function step(now, dt) {
    // zooming the timeline
    if (viewTo) {
      const p = Math.min(1, (now - zoomStart) / 700), e = ease(p);
      view = { lo: viewFrom.lo + (viewTo.lo - viewFrom.lo) * e, hi: viewFrom.hi + (viewTo.hi - viewFrom.hi) * e };
      if (p >= 1) viewTo = null;
    }
    if (now > race.nextBlink) { race.blink = now + 140; race.nextBlink = now + 1800 + Math.random() * 3000; }
    if (now > race.nextEar) { race.ear = race.ear ? 0 : 1; race.nextEar = now + (race.ear ? 260 : 2200 + Math.random() * 3000); }
    dust.forEach(p => { p.age += dt; p.x += p.vx; p.y += p.vy; });
    for (let i = dust.length - 1; i >= 0; i--) if (dust[i].age > 400) dust.splice(i, 1);
    // little idle hops while waiting
    if (!life && !race.hop && now > race.nextHop && !reduced) {
      const to = Math.max(60, Math.min(W - 60, race.x + (Math.random() < .5 ? -14 : 14)));
      race.hop = { from: race.x, to, start: now, dur: 380, h: 9 };
      race.nextHop = now + 3500 + Math.random() * 4000;
    }
    if (race.hop) {
      const p = Math.max(0, Math.min(1, (now - race.hop.start) / race.hop.dur));
      race.face = race.hop.to >= race.hop.from ? 1 : -1;
      race.x = race.hop.from + (race.hop.to - race.hop.from) * p;
      race.y = TRACK - Math.sin(p * Math.PI) * race.hop.h;
      race.pose = p < .12 ? 'crouch' : p < .9 ? 'jump' : 'land';
      if (p >= 1) { const after = race.hop.after; race.hop = null; race.y = TRACK; race.pose = 'sit'; puff(race.x); if (after) after(now); }
    }
    if (jump && jump.started && !done) {
      jump.t = Math.min(1, (now - jump.start) / jump.dur);
      const pts = jump.path(view), i = Math.min(pts.length - 1, Math.floor(jump.t * (pts.length - 1)));
      race.x = pts[i].x; race.y = pts[i].y; race.face = 1;
      race.pose = jump.t < .06 ? 'crouch' : jump.t < .96 ? 'jump' : 'land';
      if (jump.t >= 1) {
        done = true; race.pose = 'sit'; race.y = TRACK; race.mood = jump.mood || 'happy'; puff(race.x);
        stepAside();
        setTimeout(() => { race.mood = 'smile'; }, 1600);
        if (jump.onDone) jump.onDone();
      }
    }
  }

  /** After landing, Race hops a step past the marker so it stays in view. */
  function stepAside() {
    const xd = X(life.to), dir = xd > W - 50 ? -1 : 1;
    race.hop = { from: race.x, to: xd + dir * 16, start: performance.now() + 300, dur: 260, h: 5 };
    race.face = dir;
  }

  function puff(px0) { for (let i = 0; i < 6; i++) dust.push({ x: px0 - 2 + (i - 3) * 2, y: TRACK - 2, vx: (i - 3) * .25, vy: -.15 - Math.random() * .2, age: 0 }); }

  function draw(now) {
    ctx.drawImage(bg, 0, 0);
    drawTimeline(now);
    drawLife(now);
    drawRace(now);
    drawPlates();
  }

  let raf = 0, last = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    const dt = last ? now - last : 33;
    last = now;
    step(now, dt);
    draw(now);
  };
  raf = requestAnimationFrame(loop);

  /** The arc from birth to death in screen space (recomputed while the view zooms). */
  function arcFor(view0) {
    return () => {
      const xb = X(life.from), xd = X(life.to), dist = Math.abs(xd - xb);
      const h = Math.max(16, Math.min(78, dist * .5));
      const n = Math.max(30, Math.round(dist * 1.6));
      return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return { x: xb + (xd - xb) * t, y: TRACK - 4 * h * t * (1 - t) }; });
    };
  }

  return {
    canvas: cv,
    setLook(l) { L = l; },
    /** The two events (and whether their years show on the flags). Resets any life on show. */
    setEvents(a, b, dates = false) {
      ev = { a, b }; showDates = dates; life = null; jump = null; done = false;
      view = frameFor(a, b); viewTo = null;
      race.x = Math.round((X(a.hi) + X(b.lo)) / 2); race.y = TRACK; race.pose = 'sit'; race.face = 1; race.hop = null;
      cv.setAttribute('aria-label', `A desert timeline from ${a.label} to ${b.label}, with Race the jerboa waiting.`);
    },
    setShowDates(v) { showDates = !!v; },
    /**
     * Shows a lifespan: zoom to fit, Race hops to the birth day, then leaps to the death day.
     * life: { from, to, living, labels: [born, died] }; opts: { animate, mood, onDone }.
     */
    play(l, { animate = true, mood = 'happy', onDone = null } = {}) {
      life = l; done = false;
      const target = frameFor(ev.a, ev.b, l);
      const path = arcFor();
      if (!animate || reduced) {
        view = target; viewTo = null;
        jump = { path, t: 1, started: true, start: 0, dur: 1 };
        done = true; race.x = X(l.to) + (X(l.to) > W - 50 ? -16 : 16); race.face = X(l.to) > W - 50 ? -1 : 1; race.y = TRACK; race.pose = 'sit'; race.mood = 'smile';
        if (onDone) onDone();
        return;
      }
      viewFrom = view; viewTo = target; zoomStart = performance.now();
      jump = { path, t: 0, started: false, mood, onDone };
      // after the zoom, hop over to the birthday, then the big leap
      setTimeout(() => {
        const toX = X(l.from);
        race.hop = { from: race.x, to: toX, start: performance.now(), dur: 320, h: 10, after: now => {
          setTimeout(() => { jump.started = true; jump.start = performance.now(); jump.dur = Math.min(1800, 800 + Math.abs(X(l.to) - X(l.from)) * 4); }, 260);
        } };
      }, 640);
      cv.setAttribute('aria-label', `Race jumps from ${l.labels[0]} to ${l.labels[1]}.`);
    },
    clear() { life = null; jump = null; done = false; if (ev) this.setEvents(ev.a, ev.b, showDates); },
    snapshot(k = 4) { const c = canvas(W * k, H * k), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, W * k, H * k); return c; },
    destroy() { cancelAnimationFrame(raf); cv.remove(); }
  };
}

/** The home page card: Race leaping over a tiny timeline, on a 64×44 canvas. */
export function drawLifelinePreview(cv, n) {
  const w = 64, h = 44, x = cv.getContext('2d');
  if (cv.width !== w) { cv.width = w; cv.height = h; }
  x.imageSmoothingEnabled = false;
  const sky = ['#6e3f86', '#b5507a', '#ea7a5c', '#f7b36a'];
  for (let y = 0; y < 30; y++) for (let i = 0; i < w; i++) rect(x, i, y, 1, 1, bayer(i, y) < (y % 8) / 8 ? sky[Math.min(3, Math.floor(y / 8) + 1)] : sky[Math.min(3, Math.floor(y / 8))]);
  disc(x, 50, 22, 6, '#ffd27a');
  rect(x, 0, 26, 64, 18, '#e9b57e'); rect(x, 6, 22, 14, 4, '#7e4a63'); rect(x, 8, 20, 10, 2, '#7e4a63');
  rect(x, 0, 36, 64, 1, '#1f1a17');
  rect(x, 8, 27, 1, 9, '#1f1a17'); rect(x, 9, 27, 5, 3, FLAG_A);
  rect(x, 56, 27, 1, 9, '#1f1a17'); rect(x, 57, 27, 5, 3, FLAG_B);
  const t = (n % 24) / 24, px = 14 + t * 38, py = 35 - Math.sin(t * Math.PI) * 18;
  for (let i = 0; i < 24; i++) { const tt = i / 24; if (tt > t) break; if (i % 3 < 2) rect(x, 14 + tt * 38, 35 - Math.sin(tt * Math.PI) * 18, 1, 1, '#ffffff'); }
  // a tiny jerboa: body, big ear, tail
  rect(x, px - 2, py - 3, 4, 3, '#d9b07a'); rect(x, px + 1, py - 5, 3, 3, '#d9b07a'); rect(x, px + 1, py - 9, 1, 4, '#d9b07a'); rect(x, px + 2, py - 8, 1, 3, '#f2a7b4');
  rect(x, px + 3, py - 4, 1, 1, '#15110e'); rect(x, px - 6, py - 2, 4, 1, '#b48654'); rect(x, px - 7, py - 3, 1, 1, '#1d1a18');
}
