// Venn's scene: a pixel jungle canopy with big hoops of woven vine hanging from a branch, overlapping
// in the middle, and Mel on a branch beside them. Layers are painted once onto low-res canvases and
// scaled up crisp; the canvas always matches the host's shape so answer labels (DOM) line up in %.
import * as P from './pixel.js';
import { melSprite, FLASH, MOUTH, EYE, SPRITE_H } from './mel.js';

export const COLORS = {
  A: '#f2c230', B: '#3b82d6', C: '#d9412b',
  AB: '#4cb956', AC: '#ef7f2a', BC: '#7b4fb8', ABC: '#6b3f22'
};
const KEYS = ['A', 'B', 'C'];
const LH = 200, M = 14;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const JUNGLE = {
  canopy: ['#0d2419', '#123222', '#17402b', '#1d4f35', '#245d3f'],
  far: ['#1a4535', '#1f5240', '#245c48'],
  trunk: ['#1d3a2c', '#24473a'],
  vine: ['#2f6b3a', '#3f8a46', '#245a2f'],
  leaf: ['#2e7d3e', '#4aa356', '#1f5c2e', '#62bb62'],
  moss: ['#6a8f4a', '#87a85c', '#4f7036'],
  branch: ['#7a5233', '#5b3b24', '#3e2817'],
  ring: ['#3c7d3a', '#2a5a29', '#5aa04a']
};

/* ───────────── geometry ───────────── */
export function geometry(LW, round) {
  const melW = 52;
  if (round === 2) {
    const R = Math.floor(Math.min(LH / 3.25, (LW - 24) / 3.25)), s = R * .62;
    const cx = Math.round(Math.max(LW / 2 + (LW > 300 ? 16 : 6), melW + R * 1.55 - 26)), cy = Math.round(18 + R + s * .5);
    return { R, rings: [{ x: Math.round(cx - s * .866), y: Math.round(cy - s * .5) }, { x: Math.round(cx + s * .866), y: Math.round(cy - s * .5) }, { x: cx, y: Math.round(cy + s) }], cx, cy };
  }
  const R = Math.floor(Math.min(LH * .36, (LW - 24) / 3.05)), d = R * .46;
  const cx = Math.round(Math.max(LW / 2 + (LW > 300 ? 16 : 6), melW + R * 1.46 - 26)), cy = Math.round(LH * .5 + 4);
  return { R, rings: [{ x: Math.round(cx - d), y: cy }, { x: Math.round(cx + d), y: cy }], cx, cy };
}

const inside = (g, i, x, y) => (x - g.rings[i].x) ** 2 + (y - g.rings[i].y) ** 2 < g.R * g.R;
/** Which rings a point is in, as a key like 'A', 'AB' or 'ABC' ('' = outside). */
export function regionAt(g, x, y) { return g.rings.map((_, i) => (inside(g, i, x, y) ? KEYS[i] : '')).join(''); }

/**
 * Spots inside one region (e.g. 'AB' or 'ABC') for answer labels, nearest the middle first. In low-res px.
 * sx/sy = spacing between spots (low-res px), so labels of about that size don't sit on each other.
 */
function regionSlots(g, LW, key, sx = 7, sy = 7, margin = 5) {
  const pts = [];
  for (let row = 0, y = 4; y < LH - 4; y += sy, row++) for (let x = 4 + (row % 2) * sx / 2; x < LW - 4; x += sx) {
    if (regionAt(g, x, y) !== key) continue;
    const ok = g.rings.every(r => Math.abs(Math.hypot(x - r.x, y - r.y) - g.R) > margin);
    if (ok) pts.push({ x, y });
  }
  if (!pts.length) return [];
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.sort((a, b) => Math.hypot(a.x - mx, (a.y - my) * 1.6) - Math.hypot(b.x - mx, (b.y - my) * 1.6));
}

/* ───────────── painting ───────────── */
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); }
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), Math.round(w), Math.round(h)); }

function drawLeaf(ctx, x, y, len, ang, cols) {
  for (let i = 0; i < len; i++) {
    const t = i / len, w = Math.round(Math.sin(t * Math.PI) * len * .32);
    const cx = x + Math.cos(ang) * i, cy = y + Math.sin(ang) * i;
    for (let j = -w; j <= w; j++) px(ctx, cx - Math.sin(ang) * j, cy + Math.cos(ang) * j, j < 0 ? cols[0] : j === 0 ? cols[2] : cols[1]);
  }
}

function hangingVine(ctx, x, top, len, r, cols) {
  let cx = x;
  for (let y = top; y < top + len; y++) {
    cx += (r() - .5) * .6;
    px(ctx, cx, y, cols[y % 5 === 0 ? 2 : 0]);
    if (r() < .12) { px(ctx, cx + 1, y, cols[1]); px(ctx, cx + 2, y + 1, cols[1]); }
    if (r() < .1) { px(ctx, cx - 1, y, cols[1]); px(ctx, cx - 2, y + 1, cols[1]); }
  }
}

function paint(LW, round, seed) {
  const r = P.rng(seed), W = LW + 2 * M, L = {};
  // back: canopy light filtering down, light shafts, far trunks and foliage
  L.back = P.canvas(W, LH);
  const b = L.back.getContext('2d');
  const cols = JUNGLE.canopy, n = cols.length;
  for (let y = 0; y < LH; y++) for (let x = 0; x < W; x++) {
    const v = Math.min(n - 1, Math.max(0, (1 - Math.abs(y - LH * .45) / (LH * .55)) * (n - 1)));
    const i = Math.floor(v), f = v - i;
    px(b, x, y, cols[Math.min(n - 1, f > P.bayer(x, y) ? i + 1 : i)]);
  }
  for (let s = 0; s < 3; s++) {
    const sx = 40 + r() * (W - 80), sw = 10 + r() * 14;
    for (let y = 0; y < LH; y++) for (let x = 0; x < sw; x++) if (P.bayer(Math.round(sx + x + y * .35), y) < .14) px(b, sx + x + y * .35, y, '#2f6f4a');
  }
  for (let t = 0; t < 7; t++) {
    const tx = Math.floor(r() * W), tw = 4 + Math.floor(r() * 5);
    for (let y = 0; y < LH; y++) for (let x = 0; x < tw; x++) px(b, tx + x + Math.sin(y * .05 + t) * 2, y, x < 1 ? JUNGLE.trunk[1] : JUNGLE.trunk[0]);
  }
  for (let i = 0; i < 26; i++) {
    const fx = r() * W, fy = r() * LH * .9, rr = 8 + r() * 16;
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
      const d = (x * x + y * y) / (rr * rr);
      if (d < 1 && P.bayer(Math.round(fx + x), Math.round(fy + y)) > d * .9 + .15) px(b, fx + x, fy + y, JUNGLE.far[(i + (y > 0 ? 1 : 0)) % 3]);
    }
  }
  // mid: hanging vines and broad leaves
  L.mid = P.canvas(W, LH);
  const m = L.mid.getContext('2d');
  for (let i = 0; i < 9; i++) hangingVine(m, r() * W, 0, 30 + r() * 120, r, JUNGLE.vine);
  for (let i = 0; i < 10; i++) drawLeaf(m, r() * W, LH * (.25 + r() * .7), 10 + r() * 10, r() * Math.PI * 2, JUNGLE.leaf);

  // rings (static, no parallax): ropes, the top branch, region fills, braided hoops with flowers, Mel's branch
  const g = geometry(LW, round);
  L.g = g;
  L.rings = P.canvas(LW, LH);
  const k = L.rings.getContext('2d');
  // ropes from the branch to each hoop
  g.rings.forEach((c, i) => {
    const top = c.y - g.R;
    [-.45, .45].forEach(f => {
      const x0 = Math.round(c.x + f * g.R), y1 = Math.round(c.y - Math.sqrt(1 - f * f) * g.R);
      for (let y = 6; y < y1; y++) px(k, x0 + Math.round(Math.sin(y * .25 + i) * .6), y, y % 4 ? JUNGLE.vine[0] : JUNGLE.vine[2]);
      void top;
    });
  });
  // the branch they hang from
  for (let x = 0; x < LW; x++) {
    const y = 4 + Math.round(Math.sin(x * .03) * 1.5);
    rect(k, x, y - 2, 1, 5, JUNGLE.branch[1]); px(k, x, y - 2, JUNGLE.branch[0]); px(k, x, y + 2, JUNGLE.branch[2]);
    if (x % 9 === 0) px(k, x, y, JUNGLE.branch[2]);
  }
  for (let i = 0; i < 12; i++) drawLeaf(k, r() * LW, 6, 6 + r() * 6, Math.PI * (.3 + r() * .4), JUNGLE.leaf);
  // region fills: dithered, so the jungle shows through
  const density = key => (key.length === 1 ? .32 : key.length === 2 ? .62 : .82);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const key = regionAt(g, x, y);
    if (key && P.bayer(x, y) < density(key)) px(k, x, y, COLORS[key]);
  }
  L.ringBand = g.rings.map((c, i) => ringBand(g.R, KEYS[i], r));
  // Mel's branch, bottom left, coming in from the edge
  const by = LH - 12;
  for (let x = 0; x < 60; x++) {
    const y = by + Math.round(Math.sin(x * .08) * 1) + (x > 50 ? (x - 50) * .3 : 0);
    rect(k, x, y, 1, x > 54 ? 2 : 4, JUNGLE.branch[1]); px(k, x, y, JUNGLE.branch[0]); if (x < 54) px(k, x, y + 3, JUNGLE.branch[2]);
  }
  drawLeaf(k, 52, by - 1, 8, -Math.PI * .2, JUNGLE.leaf);
  drawLeaf(k, 44, by + 2, 7, Math.PI * .35, JUNGLE.leaf);
  L.melAt = { x: 2, y: by - SPRITE_H + 3 };
  // front: hanging moss along the top, big leaves in the bottom corners
  L.front = P.canvas(W, LH);
  const f = L.front.getContext('2d');
  for (let x = 0; x < W; x++) {
    const len = Math.max(0, Math.round(5 + Math.sin(x * .21) * 3 + Math.sin(x * .07) * 4 + (r() - .5) * 3));
    for (let y = 0; y < len; y++) if (y < len - 1 || P.bayer(x, y) > .4) px(f, x, y, JUNGLE.moss[(x + y) % 7 === 0 ? 1 : y === len - 1 ? 2 : 0]);
  }
  drawLeaf(f, W - 2, LH + 2, 30, -Math.PI * .78, JUNGLE.leaf);
  drawLeaf(f, W - 6, LH + 4, 22, -Math.PI * .62, JUNGLE.leaf);
  L.butterflies = Array.from({ length: 3 }, (_, i) => ({ x: r() * LW, y: 30 + r() * (LH - 80), ph: r() * 6, sp: 6 + r() * 6, c: ['#f2c230', '#ffffff', '#f28cb1'][i] }));
  return L;
}

/** A hoop of woven vine as its own sprite, so it can light up. Flowers in the circle's color. */
function ringBand(R, key, r) {
  const size = R * 2 + 9, c = P.canvas(size, size), x = c.getContext('2d'), o = R + 4;
  const tint = COLORS[key];
  const vine = [P.mix(JUNGLE.ring[0], tint, .28), P.mix(JUNGLE.ring[1], tint, .2), P.mix(JUNGLE.ring[2], tint, .3)];
  for (let yy = -R - 3; yy <= R + 3; yy++) for (let xx = -R - 3; xx <= R + 3; xx++) {
    const d = Math.hypot(xx, yy) - R;
    if (Math.abs(d) > 1.8) continue;
    const a = Math.atan2(yy, xx), braid = Math.floor(a * R / 2.2 + (d > 0 ? 1 : 0)) & 1;
    px(x, o + xx, o + yy, d < -1 ? vine[1] : braid ? vine[0] : vine[2]);
  }
  const flowers = Math.round(R * 2 * Math.PI / 16);
  for (let i = 0; i < flowers; i++) {
    const a = i / flowers * Math.PI * 2 + r() * .2, fx = o + Math.cos(a) * R, fy = o + Math.sin(a) * R;
    if (i % 3 === 2) { px(x, fx + 2, fy, '#62bb62'); px(x, fx + 3, fy - 1, '#62bb62'); continue; }
    px(x, fx, fy - 1, tint); px(x, fx - 1, fy, tint); px(x, fx + 1, fy, tint); px(x, fx, fy + 1, tint); px(x, fx, fy, '#fff6c8');
  }
  return c;
}

/* ───────────── the live scene ───────────── */
export function createVennScene(host, { round = 1, look = {}, onMelClick } = {}) {
  host.innerHTML = '<canvas class="venn-canvas" aria-label="A pixel jungle with vine rings and Mel the chameleon on a branch."></canvas>';
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  let LW = 320, L = null, k = 1, raf = 0, alive = true, last = performance.now();
  const st = { time: 0, px: 0, tx: 0, eye: { dx: 0, dy: 0 }, mood: 'smile', blink: false, flash: 0, flashColor: FLASH, tongue: null, lit: [0, 0, 0], look };
  const sprites = new Map();
  const sprite = (mood, blink, ex, ey, flash, open) => {
    const key = [mood, blink, ex, ey, flash ? 1 : 0, open ? 1 : 0].join('|');
    if (!sprites.has(key)) sprites.set(key, melSprite(st.look, { mood, blink, eye: { dx: ex, dy: ey }, flash: flash ? st.flashColor : null, mouthOpen: open }));
    return sprites.get(key);
  };

  function resize() {
    const rr = host.getBoundingClientRect(), dpr = Math.min(2.5, devicePixelRatio || 1);
    if (!rr.width || !rr.height) return;
    const want = Math.max(200, Math.min(380, Math.round(LH * rr.width / rr.height)));
    if (!L || want !== LW) { LW = want; L = paint(LW, round, 4242 + round); api.onLayout && api.onLayout(); }
    cv.width = Math.round(rr.width * dpr); cv.height = Math.round(rr.height * dpr);
    k = cv.width / LW;
    ctx.imageSmoothingEnabled = false;
  }
  const blit = (img, lx, ly) => ctx.drawImage(img, Math.round(lx * k), Math.round(ly * k), Math.ceil(img.width * k), Math.ceil(img.height * k));
  const dot = (lx, ly, c, s = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(lx * k), Math.round(ly * k), Math.ceil(k * s), Math.ceil(k * s)); };

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; st.time += dt;
    st.px += (st.tx - st.px) * Math.min(1, dt * 2);
    if (st.flash > 0) st.flash -= dt;
    st.lit = st.lit.map(v => Math.max(0, v - dt));
    if (st.tongue) {
      const t = st.tongue, p = (now - t.start) / t.dur;
      if (p >= 1 && !t.caught) { t.caught = true; t.hold = now; t.cb && t.cb(); }
      if (t.caught && now - t.hold > t.dur + 60) st.tongue = null;
    }
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function draw(now) {
    if (!L) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const drift = reduced() ? 0 : Math.sin(st.time * .15) * 3;
    blit(L.back, -M + st.px * 3 + drift * .5, 0);
    blit(L.mid, -M + st.px * 6 + drift, 0);
    blit(L.rings, 0, 0);
    L.g.rings.forEach((c, i) => {
      const band = L.ringBand[i];
      blit(band, c.x - L.g.R - 4, c.y - L.g.R - 4);
      if (st.lit[i] > 0 && Math.floor(st.lit[i] * 8) % 2 === 0) {
        for (let a = 0; a < 90; a++) { const an = a / 90 * Math.PI * 2; dot(c.x + Math.cos(an) * (L.g.R + 2), c.y + Math.sin(an) * (L.g.R + 2), '#fff6c8'); }
      }
    });
    // butterflies
    L.butterflies.forEach((bf, i) => {
      const t = reduced() ? 0 : st.time;
      const x = (bf.x + t * bf.sp) % (LW + 20) - 10, y = bf.y + Math.sin(t * 1.3 + bf.ph) * 10, flap = Math.floor(t * 8 + i) % 2;
      dot(x, y, '#1b1712');
      if (flap) { dot(x - 1, y - 1, bf.c); dot(x + 1, y - 1, bf.c); dot(x - 2, y - 1, bf.c); dot(x + 2, y - 1, bf.c); }
      else { dot(x - 1, y, bf.c); dot(x + 1, y, bf.c); }
    });
    // Mel
    const flashing = st.flash > 0 && (reduced() || Math.floor(st.flash * 10) % 2 === 0);
    const open = !!st.tongue;
    const img = sprite(st.mood, st.blink, st.eye.dx, st.eye.dy, flashing, open);
    blit(img, L.melAt.x, L.melAt.y);
    // tongue
    if (st.tongue) {
      const t = st.tongue, p = t.caught ? Math.max(0, 1 - (now - t.hold) / t.dur) : Math.min(1, (now - t.start) / t.dur);
      const sx = L.melAt.x + MOUTH.x + 1, sy = L.melAt.y + MOUTH.y + 1;
      const ex = sx + (t.x - sx) * p, ey = sy + (t.y - sy) * p;
      const steps = Math.max(1, Math.round(Math.hypot(ex - sx, ey - sy)));
      for (let s = 0; s <= steps; s++) dot(sx + (ex - sx) * s / steps, sy + (ey - sy) * s / steps, '#e7798c');
      dot(ex - 1, ey - 1, '#d4566e', 3);
    }
    blit(L.front, -M + st.px * 10, 0);
  }

  const toLow = (clientX, clientY) => { const r = cv.getBoundingClientRect(); return { x: (clientX - r.left) / r.width * LW, y: (clientY - r.top) / r.height * LH }; };
  const melBox = () => L && { x: L.melAt.x, y: L.melAt.y, w: 50, h: SPRITE_H + 2 };
  const overMel = e => { const p = toLow(e.clientX, e.clientY), b = melBox(); return b && p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h; };
  const onMove = e => { const p = toLow(e.clientX, e.clientY); st.tx = (p.x / LW - .5) * 2; api.lookAt(e.clientX, e.clientY); cv.style.cursor = overMel(e) ? 'pointer' : ''; };
  const onClick = e => { if (overMel(e) && onMelClick) onMelClick(); };
  cv.addEventListener('pointermove', onMove); cv.addEventListener('click', onClick);
  const ro = new ResizeObserver(resize); ro.observe(host);
  const blinkT = setInterval(() => { st.blink = true; setTimeout(() => { st.blink = false; }, 160); }, 3200);

  const api = {
    onLayout: null,
    get size() { return { LW, LH }; },
    /** Anchor points for the category tags, in % of the host. */
    anchors() {
      if (!L) return [];
      const g = L.g;
      return g.rings.map((c, i) => {
        if (i === 2) return { key: 'C', x: Math.min(LW - 4, c.x + g.R * .74) / LW * 100, y: (c.y + g.R * .62) / LH * 100, align: 'cright' };
        const left = i === 0;
        return { key: KEYS[i], x: (left ? c.x - g.R * .35 : c.x + g.R * .35) / LW * 100, y: (c.y - g.R) / LH * 100, align: left ? 'left' : 'right' };
      });
    },
    /** Label spots in a region ('AB', 'ABC', 'AC', 'BC'), in % of the host, nearest the middle first. */
    slots(key) {
      if (!L) return [];
      // About one label (≈64×20 CSS px) apart, measured on screen.
      const r = host.getBoundingClientRect(), kx = (r.width || LW) / LW, ky = (r.height || LH) / LH;
      const pick = (sx, sy) => regionSlots(L.g, LW, key, sx, sy);
      let pts = pick(64 / kx, 20 / ky);
      if (pts.length < 4) pts = pick(40 / kx, 16 / ky);
      if (!pts.length) pts = pick(4, 4);
      return pts.map(p => ({ x: p.x / LW * 100, y: p.y / LH * 100 }));
    },
    /** Where wrong answers bounce off: just outside the rings, on the right. */
    bouncePoint() { if (!L) return { x: 80, y: 50 }; const g = L.g; return { x: Math.min(94, (g.cx + g.R * 1.6) / LW * 100), y: (g.cy - g.R * .3) / LH * 100 }; },
    lookAt(clientX, clientY) {
      if (!L) return;
      const p = toLow(clientX, clientY), ex = L.melAt.x + EYE.x + 1, ey = L.melAt.y + EYE.y + 1;
      const dx = p.x - ex, dy = p.y - ey;
      st.eye = { dx: Math.abs(dx) < 8 ? 0 : Math.sign(dx), dy: Math.abs(dy) < 10 ? 0 : Math.sign(dy) };
    },
    setMood(m) { st.mood = m || 'smile'; },
    setLook(lk) { st.look = lk; sprites.clear(); },
    flash(color = FLASH, secs = .7) { st.flashColor = color; sprites.clear(); st.flash = secs; },
    /** Mel's tongue zaps out to (x%, y%), calls cb when it grabs, then pulls back. */
    catchAt(xPct, yPct, cb) {
      if (!L || reduced()) { cb && cb(); return; }
      const t = st.tongue = { x: xPct / 100 * LW, y: yPct / 100 * LH, start: performance.now(), dur: 130, cb, caught: false };
      // If frames aren't running (a background tab), still deliver the catch.
      setTimeout(() => { if (!t.caught) { t.caught = true; t.hold = performance.now(); if (st.tongue === t) st.tongue = null; cb && cb(); } }, 500);
    },
    /** Flashes the rings an answer fits (e.g. [true, true, false]). */
    lightRings(fits) { st.lit = [0, 1, 2].map(i => (fits[i] ? 1.1 : 0)); },
    destroy() { alive = false; cancelAnimationFrame(raf); clearInterval(blinkT); ro.disconnect(); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('click', onClick); }
  };
  resize();
  raf = requestAnimationFrame(frame);
  return api;
}

/* ───────────── tiny preview for the suite home page ───────────── */
/** Draws a small looping Venn picture (two vine rings, Mel blinking) into a 64×44 canvas. `n` = frame number. */
export function drawVennPreview(cv, n, look = {}) {
  const W = 64, H = 44;
  if (cv.width !== W) { cv.width = W; cv.height = H; }
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#17402b'; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (P.bayer(xx, y) < .25 * (1 - y / H)) { x.fillStyle = '#245d3f'; x.fillRect(xx, y, 1, 1); }
  x.fillStyle = JUNGLE.branch[1]; x.fillRect(0, 2, W, 2);
  const g = { R: 13, rings: [{ x: 33, y: 21 }, { x: 45, y: 21 }] };
  const sway = Math.round(Math.sin(n / 6) * 1);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const key = regionAt({ ...g, rings: g.rings.map(r => ({ x: r.x + sway, y: r.y })) }, xx, y);
    if (key && P.bayer(xx, y) < (key.length > 1 ? .7 : .35)) { x.fillStyle = COLORS[key]; x.fillRect(xx, y, 1, 1); }
  }
  g.rings.forEach((r, i) => {
    for (let a = 0; a < 80; a++) {
      const an = a / 80 * Math.PI * 2;
      x.fillStyle = a % 10 === 0 ? COLORS[KEYS[i]] : (a & 1 ? JUNGLE.ring[0] : JUNGLE.ring[2]);
      x.fillRect(Math.round(r.x + sway + Math.cos(an) * g.R), Math.round(r.y + Math.sin(an) * g.R), 1, 1);
    }
    x.fillStyle = JUNGLE.vine[0]; x.fillRect(r.x + sway, 4, 1, r.y - g.R - 4);
  });
  x.fillStyle = JUNGLE.branch[1]; x.fillRect(0, 40, 26, 2);
  const blink = n % 16 === 0;
  const mel = melSprite(look, { blink, mood: 'smile' });
  x.drawImage(mel, 0, 0, mel.width, mel.height, -2, 40 - 17, Math.round(mel.width * .55), Math.round(mel.height * .55));
}
