// Summit: a pixel-art mountain with a cable car (and Skipper the goat) riding between two stations.
// Scenery is painted once onto low-res layer canvases, then scaled up crisp every frame with
// parallax. The cabin moves smoothly on top with pendulum physics.
import * as P from './pixel.js';

const LW = 320, LH = 166, M = 24;             // low-res size, parallax margin
const LEFT = { cx: 40, base: 88 }, RIGHT = { cx: 280, base: 58 }, LODGE = { cx: 160, base: 147 };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const STATION_T = 0.075;

let GEO = null;   // cable geometry, set when a scene is painted
export function cableAt(t) {
  const { P0, C, P2 } = GEO, u = 1 - t;
  return { x: u * u * P0.x + 2 * u * t * C.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * C.y + t * t * P2.y };
}
function cableAngle(t) {
  const { P0, C, P2 } = GEO;
  return Math.atan2(2 * (1 - t) * (C.y - P0.y) + 2 * t * (P2.y - C.y), 2 * (1 - t) * (C.x - P0.x) + 2 * t * (P2.x - C.x));
}

/* ───────────── painting the static layers ───────────── */
function nearRidge(r) {
  const out = [];
  for (let x = -M; x < LW + M; x++) {
    const l = LEFT.base + Math.max(0, Math.abs(x - LEFT.cx) - 9) * .62;
    const rr = RIGHT.base + Math.max(0, Math.abs(x - RIGHT.cx) - 9) * .78;
    const h = LODGE.base + Math.max(0, Math.abs(x - LODGE.cx) - 22) ** 2 * .013;
    let y = Math.min(l, rr, h);
    const flat = Math.abs(x - LEFT.cx) <= 9 || Math.abs(x - RIGHT.cx) <= 9 || Math.abs(x - LODGE.cx) <= 22;
    if (!flat) y += Math.sin(x * .9) * .8 + (r() - .5) * 1.4;
    out.push(y);
  }
  return out;
}

function fogCanvas() {
  const c = P.canvas(LW, LH), x = c.getContext('2d');
  for (let y = 40; y < 140; y++) for (let xx = 40; xx < 280; xx++) {
    const d = ((xx - 160) / 105) ** 2 + ((y - 96) / 34) ** 2;
    const d2 = ((xx - 120) / 60) ** 2 + ((y - 106) / 22) ** 2, d3 = ((xx - 205) / 62) ** 2 + ((y - 84) / 24) ** 2;
    const m = Math.min(d, d2 * 1.1, d3 * 1.1);
    if (m < 1 && P.bayer(xx, y) < (1 - m) * 1.9) { x.fillStyle = m < .45 ? '#f5f8fb' : '#dde6ef'; x.fillRect(xx, y, 1, 1); }
  }
  return c;
}

function paint(stage, tod, seed) {
  const r = P.rng(seed), pal = P.palette(stage, tod), W = LW + 2 * M;
  const L = { pal };
  L.sky = P.canvas(LW, LH); P.drawSky(L.sky.getContext('2d'), LW, LH, pal);
  // far range
  L.far = P.canvas(W, LH);
  P.drawTerrain(L.far.getContext('2d'), P.ridgeNoise(r, W, 76, 26, 4, 70), LH, pal.far, pal, r, { snowline: pal.snowline, specks: 0 });
  // mid range with little pines
  L.mid = P.canvas(W, LH);
  const mctx = L.mid.getContext('2d'), mr = P.ridgeNoise(r, W, 106, 12, 3, 50);
  P.drawTerrain(mctx, mr, LH, pal.mid, pal, r, { snowline: stage === 3 ? 200 : -1, specks: .02, rocks: stage === 1 ? 4 : 10 });
  for (let i = 0; i < 26; i++) { const x = Math.floor(r() * W); P.drawPine(mctx, x, mr[x] + 3 + r() * 16, 5 + Math.floor(r() * 4), pal, stage === 3); }
  // near: the two station mountains, the lodge hill, buildings and the cable (drawn in screen coords + M)
  L.near = P.canvas(W, LH);
  const n = L.near.getContext('2d');
  const nr = nearRidge(r);
  P.drawTerrain(n, nr, LH, pal.near, pal, r, { snowline: pal.nearSnow, specks: .03, rocks: stage === 1 ? 6 : 16 });
  n.save(); n.translate(M, 0);
  for (let x = 120; x <= 200; x++) {
    const top = Math.round(nr[x + M]);
    if (top >= LODGE.base - 1) for (let y = top; y < top + 4; y++) { n.fillStyle = y === top ? pal.hill[0] : (P.bayer(x, y) > .5 ? pal.hill[1] : pal.hill[0]); n.fillRect(x, y, 1, 1); }
  }
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(r() * LW);
    if (Math.abs(x - LEFT.cx) < 14 || Math.abs(x - RIGHT.cx) < 14 || Math.abs(x - LODGE.cx) < 28) continue;
    const y = nr[x + M] + 4 + r() * 18;
    if (y > LH + 2) continue;
    P.drawPine(n, x, y, 7 + Math.floor(r() * 6), pal, stage >= 2);
  }
  const ls = P.drawStation(n, LEFT.cx, LEFT.base, 1, pal);
  const rs = P.drawStation(n, RIGHT.cx, RIGHT.base, -1, pal);
  const lodge = P.drawChalet(n, LODGE.cx, LODGE.base, { w: 34, wallH: 13, roofH: 10, windows: 2, door: true, chimney: true, balcony: true, flag: true }, pal);
  GEO = { P0: ls.wheel, P2: rs.wheel, C: { x: 160, y: 118 } };
  P.drawCable(n, { x: GEO.P0.x, y: GEO.P0.y - 2 }, { x: GEO.C.x, y: GEO.C.y - 3 }, { x: GEO.P2.x, y: GEO.P2.y - 2 }, P.mix(pal.cable, pal.sky[3], .45));
  P.drawCable(n, GEO.P0, GEO.C, GEO.P2, pal.cable);
  if (tod === 'night' || tod === 'evening') {
    [...ls.windows, ...rs.windows, ...lodge.windows].forEach(w => {
      for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) {
        const d = Math.hypot(dx, dy * 1.3) / 6;
        if (d < 1 && d > .35 && P.bayer(w.x + dx, w.y + dy) > d + .25) { n.fillStyle = 'rgba(255,207,106,.35)'; n.fillRect(w.x + dx, w.y + dy, 1, 1); }
      }
    });
  }
  n.restore();
  // front: big pines in the corners
  L.front = P.canvas(W, LH);
  const f = L.front.getContext('2d');
  [[M + 4, 38], [M + 15, 30], [M + 26, 24], [M + LW - 6, 40], [M + LW - 18, 31], [M + LW - 30, 22]].forEach(([x, h]) => P.drawPine(f, x, LH + 3, h, pal, stage >= 2));
  // sprites + spots
  L.clouds = [0, 1, 2, 3].map(() => ({ img: P.cloudSprite(r, 22 + Math.floor(r() * 22), 8 + Math.floor(r() * 5), pal), x: r() * LW, y: 8 + r() * 44, v: 1.2 + r() * 2.6 }));
  L.sun = P.sunSprite(pal, tod === 'night');
  L.sunPos = tod === 'evening' ? { x: 58, y: 54 } : tod === 'morning' ? { x: 48, y: 30 } : { x: 238, y: 8 };
  L.stars = tod === 'night' ? Array.from({ length: 70 }, () => ({ x: Math.floor(r() * LW), y: Math.floor(r() * 80), ph: r() * 6, sp: .8 + r() * 2 })) : [];
  L.fog = fogCanvas();
  L.chimney = lodge.chimneyTop;
  L.lodgeWins = lodge.windows;
  return L;
}

/* ───────────── the live scene ───────────── */
export function createScene(host, { stage = 1, seed = 1, onGondolaClick } = {}) {
  const tod = document.documentElement.dataset.tod || 'day';
  const L = paint(stage, tod, seed * 7919 + stage * 131);
  host.innerHTML = '<canvas class="scene-canvas" aria-label="A pixel-art cable car between two mountain stations. Click the cabin to meet Skipper."></canvas>';
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  const sprites = {}; const gsprite = (mood, blink) => sprites[mood + blink] || (sprites[mood + blink] = P.gondolaSprite(mood, blink));
  const trolley = P.trolleySprite();

  const st = { t: STATION_T, v: 0, swing: 0, swingV: 0, move: null, px: 0, py: 0, tx: 0, ty: 0, time: 0, idleAmp: 1.2,
    mood: 'smile', blink: false, hover: false, fog: 0, fogTarget: 0, enter: 0, party: 0, pins: [] };
  const parts = [];
  let k = 1, raf = 0, last = performance.now(), alive = true, smokeT = 0;

  function resize() {
    const r = host.getBoundingClientRect(), dpr = Math.min(2.5, devicePixelRatio || 1);
    cv.width = Math.max(LW, Math.round(r.width * dpr)); cv.height = Math.max(LH, Math.round(r.height * dpr));
    k = Math.max(cv.width / LW, cv.height / LH);
    ctx.imageSmoothingEnabled = false;
  }
  const oy = () => (cv.height - LH * k) / 2, ox = () => (cv.width - LW * k) / 2;
  const blit = (img, lx, ly, off = 0, offY = 0) => ctx.drawImage(img, Math.round(ox() + lx * k + off), Math.round(oy() + ly * k + offY), Math.ceil(img.width * k), Math.ceil(img.height * k));
  const dot = (lx, ly, c, size = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox() + Math.round(lx) * k), Math.round(oy() + Math.round(ly) * k), Math.ceil(k * size), Math.ceil(k * size)); };
  const enterOff = layer => (1 - ease(Math.min(1, st.enter))) * [20, 40, 70, 120][layer];
  const offsets = () => [st.px * 3 + enterOff(0), st.px * 6 + enterOff(1), st.px * 10 + enterOff(2), st.px * 18 + enterOff(3)].map(v => v * (k / 3));

  function gondolaBox() {
    const p = cableAt(st.t), off = offsets()[2];
    return { x: ox() + p.x * k + off - 11 * k, y: oy() + p.y * k, w: 22 * k, h: 28 * k };
  }

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; st.time += dt;
    if (st.enter < 1) st.enter += dt / 1.2;
    let drive = 0;
    if (st.move) {
      const m = st.move, p = Math.min(1, (now - m.start) / m.dur), prev = st.t;
      st.t = m.from + (m.to - m.from) * ease(p);
      const v = (st.t - prev) / Math.max(dt, 1e-3);
      drive = -((v - st.v) / Math.max(dt, 1e-3)) * 520; st.v = v;
      if (p >= 1) { st.move = null; st.v = 0; m.done && m.done(); }
    }
    st.swingV += (-30 * st.swing - 2.1 * st.swingV + drive) * dt;
    st.swing = Math.max(-38, Math.min(38, st.swing + st.swingV * dt));
    st.px += (st.tx - st.px) * Math.min(1, dt * 3); st.py += (st.ty - st.py) * Math.min(1, dt * 3);
    st.fog += (st.fogTarget - st.fog) * Math.min(1, dt * 1.8);
    if (st.party > 0) st.party -= dt;
    L.clouds.forEach(c => { c.x += c.v * dt; if (c.x > LW + 10) c.x = -c.img.width - 10; });
    if (!reduced()) {
      smokeT -= dt;
      if (smokeT <= 0) { smokeT = .38; parts.push({ kind: 'smoke', x: L.chimney.x + Math.random(), y: L.chimney.y, vx: 2 + Math.random() * 2, vy: -5 - Math.random() * 2, life: 4, max: 4 }); }
      if (stage === 3 && Math.random() < dt * 22) parts.push({ kind: 'snow', x: Math.random() * LW, y: -2, vx: -2 + Math.random() * 4, vy: 9 + Math.random() * 8, life: 30, max: 30 });
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt;
      if (q.life <= 0 || q.y > LH + 4) { parts.splice(i, 1); continue; }
      if (q.kind === 'spark') { q.vy += 30 * dt; q.vx *= 1 - dt; q.vy *= 1 - dt * .8; }
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    blit(L.sky, 0, 0);
    L.stars.forEach(s => { const b = Math.sin(st.time * s.sp + s.ph); if (b > -.3) dot(s.x, s.y, b > .6 ? '#ffffff' : '#9fb0d8'); });
    blit(L.sun, L.sunPos.x, L.sunPos.y, st.px * 2);
    L.clouds.forEach(c => blit(c.img, Math.round(c.x), Math.round(c.y), st.px * 3));
    const bx = ((st.time * 13) % (LW + 120)) - 60, by = 46 + Math.sin(st.time * .8) * 5, flap = Math.floor(st.time * 5) % 2;
    const bc = document.documentElement.dataset.tod === 'night' ? '#c9d3e6' : '#33404f';
    [[0, 0], [7, 3], [-6, 4]].forEach(([dx, dy]) => {
      const x = bx + dx, y = by + dy;
      if (flap) { dot(x - 2, y, bc); dot(x - 1, y - 1, bc); dot(x, y, bc); dot(x + 1, y - 1, bc); dot(x + 2, y, bc); }
      else { dot(x - 2, y - 1, bc); dot(x - 1, y, bc); dot(x, y, bc); dot(x + 1, y, bc); dot(x + 2, y - 1, bc); }
    });
    const offs = offsets();
    blit(L.far, -M, 0, offs[0], st.py * 1.5);
    blit(L.mid, -M, 0, offs[1], st.py * 2.5);
    blit(L.near, -M, 0, offs[2], st.py * 3.5);
    const nx = offs[2] / k, ny = st.py * 3.5 / k;
    if (st.party > 0 && Math.floor(st.time * 8) % 2) L.lodgeWins.forEach(w => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) dot(w.x + dx + nx, w.y + dy + ny, '#fff6c2'); });
    parts.forEach(q => {
      if (q.kind !== 'smoke') return;
      ctx.globalAlpha = Math.min(1, q.life / q.max * 1.4) * .8;
      dot(q.x + nx, q.y + ny, document.documentElement.dataset.tod === 'night' ? '#aeb8cc' : '#eef1f4', q.life > 2.6 ? 1 : q.life > 1.2 ? 2 : 3);
    });
    ctx.globalAlpha = 1;
    st.pins.forEach(pn => {
      const p = cableAt(Math.max(.02, Math.min(.98, pn.t)));
      dot(p.x + nx - 1, p.y + ny - 1, '#ffffff', 3); dot(p.x + nx, p.y + ny, '#5b7cfa');
    });
    drawGondola(offs[2], st.py * 3.5);
    if (st.fog > .01) { ctx.globalAlpha = Math.min(1, st.fog); blit(L.fog, Math.round(Math.sin(st.time * .6) * 4), 0, offs[2] * .5); ctx.globalAlpha = 1; }
    blit(L.front, -M, 0, offs[3], st.py * 6);
    parts.forEach(q => {
      if (q.kind === 'snow') dot(q.x, q.y, '#ffffff');
      else if (q.kind === 'spark') { ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); dot(q.x, q.y, q.c, q.life > q.max * .6 ? 2 : 1); }
    });
    ctx.globalAlpha = 1;
  }

  function drawGondola(offX, offY) {
    const p = cableAt(st.t), a = cableAngle(st.t);
    const x = ox() + p.x * k + offX, y = oy() + p.y * k + offY;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.drawImage(trolley, Math.round(-trolley.width / 2 * k), Math.round(-trolley.height * k + 2 * k), Math.ceil(trolley.width * k), Math.ceil(trolley.height * k));
    ctx.restore();
    const idle = reduced() ? 0 : Math.sin(st.time * 1.6) * st.idleAmp + (st.hover ? Math.sin(st.time * 9) * 2 : 0);
    const g = gsprite(st.hover ? 'wow' : st.mood, st.blink);
    ctx.save(); ctx.translate(x, y + k); ctx.rotate((st.swing + idle) * Math.PI / 180);
    ctx.drawImage(g, Math.round(-g.width / 2 * k), 0, Math.ceil(g.width * k), Math.ceil(g.height * k));
    ctx.restore();
  }

  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  const inCabin = e => { const p = toCanvas(e), b = gondolaBox(); return p.x > b.x && p.x < b.x + b.w && p.y > b.y - 4 * k && p.y < b.y + b.h; };
  const onMove = e => {
    const p = toCanvas(e);
    st.tx = (p.x / cv.width - .5) * 2; st.ty = (p.y / cv.height - .5) * 2;
    st.hover = inCabin(e); cv.style.cursor = st.hover ? 'pointer' : '';
  };
  const onLeave = () => { st.tx = 0; st.ty = 0; st.hover = false; };
  const onClick = e => { if (inCabin(e) && onGondolaClick) { st.swingV += 90; onGondolaClick(); } };
  cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', onLeave); cv.addEventListener('click', onClick);
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  const blinkT = setInterval(() => { st.blink = true; setTimeout(() => { st.blink = false; }, 170); }, 3400);
  if (reduced()) st.enter = 1;
  raf = requestAnimationFrame(frame);

  const api = {
    get t() { return st.t; },
    travelTo(t, { dur, done } = {}) {
      t = Math.max(.02, Math.min(.98, t));
      if (reduced()) { st.t = t; done && done(); return; }
      st.move = { from: st.t, to: t, start: performance.now(), dur: dur || 900 + Math.abs(t - st.t) * 2600, done };
    },
    toStation(o) { api.travelTo(STATION_T, o); },
    jumpTo(t) { st.t = Math.max(.02, Math.min(.98, t)); st.move = null; },
    setFog(on) { st.fogTarget = on ? 1 : 0; },
    setMood(m) { st.mood = m || 'smile'; },
    bump() { st.swingV += (Math.random() < .5 ? -1 : 1) * 160; host.classList.remove('jolt'); void host.offsetWidth; host.classList.add('jolt'); },
    /** score: 0..1000 */
    settle(score) { const s = score / 10; st.swingV += (Math.random() < .5 ? -1 : 1) * (12 + (100 - s) * 1.9); st.idleAmp = s >= 90 ? .7 : s >= 50 ? 1.2 : 2.2; },
    celebrate(level) {
      if (reduced()) return;
      st.party = 3;
      const colors = ['#ffd166', '#ff8c61', '#ffffff', '#7bdff2', '#b8f2a6', '#f28cb1'];
      const n = level >= 1000 ? 5 : 3;
      for (let b = 0; b < n; b++) setTimeout(() => {
        if (!alive) return;
        const cx = 90 + Math.random() * 140, cy = 18 + Math.random() * 40, c = colors[b % colors.length], c2 = colors[(b + 2) % colors.length];
        for (let i = 0; i < 46; i++) {
          const ang = (i / 46) * Math.PI * 2, sp = 16 + Math.random() * 30;
          parts.push({ kind: 'spark', x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.3 + Math.random() * .7, max: 2, c: i % 3 ? c : c2 });
        }
      }, b * 380);
    },
    pins(list) { st.pins = list || []; },
    destroy() {
      alive = false; cancelAnimationFrame(raf); clearInterval(blinkT); ro.disconnect();
      cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave); cv.removeEventListener('click', onClick);
    }
  };
  return api;
}

/* ───────────── the climb: daily total as a climber on a pixel mountain ───────────── */
export function createClimb(host, { w = 72, h = 34, big = false } = {}) {
  const tod = document.documentElement.dataset.tod || 'day';
  const pal = P.palette(3, tod === 'night' ? 'night' : 'day');
  const base = P.canvas(w, h), b = base.getContext('2d'), r = P.rng(4242);
  const ridge = [];
  for (let x = 0; x < w; x++) ridge.push(h - 2 - (x / (w - 1)) * (h - 6) + Math.sin(x * .7) * .8 + (x > w * .86 ? (x - w * .86) * 1.4 : 0));
  P.drawTerrain(b, ridge, h, pal.mid, pal, r, { snowline: h * .45, specks: .03 });
  if (big) { const gp = P.palette(1, tod); for (let i = 0; i < 9; i++) { const x = 4 + Math.floor(r() * w * .5); P.drawPine(b, x, ridge[x] + 3 + r() * 6, 5 + Math.floor(r() * 3), gp); } }
  const pts = [], sx = 3, sy = h - 3, ex = Math.round(w * .86), ey = Math.round(ridge[Math.round(w * .86)]) - 1;
  const legs = big ? 6 : 4;
  let lx = sx, ly = sy;
  for (let i = 1; i <= legs; i++) {
    const tx = Math.round(sx + (ex - sx) * i / legs + (i < legs ? (i % 2 ? 3 : -3) : 0)), ty = Math.round(sy + (ey - sy) * i / legs);
    const steps = Math.max(1, Math.abs(tx - lx), Math.abs(ty - ly));
    for (let s = 1; s <= steps; s++) pts.push({ x: Math.round(lx + (tx - lx) * s / steps), y: Math.round(ly + (ty - ly) * s / steps) });
    lx = tx; ly = ty;
  }
  const cv = P.canvas(w, h); cv.className = big ? 'pano-canvas' : 'climb-canvas';
  host.innerHTML = ''; host.appendChild(cv);
  const ctx = cv.getContext('2d');
  let cur = 0, anim = 0, idle = 0;
  function draw(p) {
    ctx.clearRect(0, 0, w, h); ctx.drawImage(base, 0, 0);
    const upto = Math.round(p * (pts.length - 1));
    pts.forEach((q, i) => { if (i <= upto || i % 2 === 0) { ctx.fillStyle = i <= upto ? '#d9482b' : 'rgba(255,255,255,.8)'; ctx.fillRect(q.x, q.y, 1, 1); } });
    const wave = Math.floor(performance.now() / 300) % 2;
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(ex, ey - 7, 1, 7);
    ctx.fillStyle = '#d9482b'; ctx.fillRect(ex + 1, ey - 7, 3 + wave, 2); ctx.fillRect(ex + 1, ey - 5, 2, 1);
    const c = pts[upto] || pts[0];
    ctx.fillStyle = '#1d1410'; ctx.fillRect(c.x - 2, c.y - 3, 5, 5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(c.x - 1, c.y - 2, 3, 3);
    ctx.fillStyle = '#d9482b'; ctx.fillRect(c.x, c.y - 1, 1, 1);
  }
  const loop = () => { if (!cv.isConnected) return; draw(cur); idle = requestAnimationFrame(loop); };
  idle = requestAnimationFrame(loop);
  return {
    get value() { return cur; },
    set(p, { dur = 1400, onTick } = {}) {
      cancelAnimationFrame(anim);
      const from = cur, start = performance.now();
      const go = now => {
        const t = reduced() ? 1 : Math.min(1, (now - start) / dur);
        cur = from + (p - from) * ease(t); onTick && onTick(cur);
        if (t < 1) anim = requestAnimationFrame(go);
      };
      anim = requestAnimationFrame(go);
    },
    stop() { cancelAnimationFrame(anim); cancelAnimationFrame(idle); }
  };
}
