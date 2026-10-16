// Summit: an animated mountain scene with a cable car (and Gus the goat) riding between two stations.
// Everything moves with eased, physics-driven motion: the cabin swings like a pendulum, the camera
// parallaxes with the pointer, clouds and birds drift, smoke curls from the lodge, fog rolls in.

const W = 1000, H = 520;
const P0 = { x: 150, y: 240 }, C = { x: 500, y: 352 }, P2 = { x: 850, y: 146 };

export function cableAt(t) {
  const u = 1 - t;
  return { x: u * u * P0.x + 2 * u * t * C.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * C.y + t * t * P2.y };
}
function cableAngle(t) {
  const dx = 2 * (1 - t) * (C.x - P0.x) + 2 * t * (P2.x - C.x);
  const dy = 2 * (1 - t) * (C.y - P0.y) + 2 * t * (P2.y - C.y);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}
const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const rand = (a, b) => a + Math.random() * (b - a);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const STATION_T = 0.075;

function pine(x, y, s, cls = '') {
  const h = 70 * s, w = 34 * s;
  return `<g class="pine ${cls}" style="animation-delay:${rand(-4, 0).toFixed(2)}s">
    <rect x="${x - 3 * s}" y="${y - 10 * s}" width="${6 * s}" height="${10 * s}" fill="var(--trunk)"/>
    <path d="M${x} ${y - h} L${x + w * .55} ${y - h * .45} L${x - w * .55} ${y - h * .45}Z" fill="var(--pine)"/>
    <path d="M${x} ${y - h * .78} L${x + w * .75} ${y - h * .22} L${x - w * .75} ${y - h * .22}Z" fill="var(--pine)"/>
    <path d="M${x} ${y - h * .55} L${x + w} ${y - 8 * s} L${x - w} ${y - 8 * s}Z" fill="var(--pine2)"/>
  </g>`;
}

function cloud(y, scale, dur, delay, op) {
  return `<g transform="translate(0 ${y}) scale(${scale})"><g class="cloud" style="animation-duration:${dur}s;animation-delay:${delay}s;opacity:${op}">
    <ellipse cx="0" cy="0" rx="62" ry="20" fill="var(--cloud)"/><ellipse cx="-30" cy="-10" rx="34" ry="22" fill="var(--cloud)"/>
    <ellipse cx="22" cy="-16" rx="40" ry="28" fill="var(--cloud)"/><ellipse cx="55" cy="-4" rx="26" ry="16" fill="var(--cloud)"/>
  </g></g>`;
}

function bird(dx, dy, d) {
  return `<g transform="translate(${dx} ${dy})"><path class="wing" style="animation-delay:${d}s" d="M-9 0 Q-4.5 -6 0 0 Q4.5 -6 9 0" fill="none" stroke="var(--bird)" stroke-width="2.2" stroke-linecap="round"/></g>`;
}

function gondolaSVG() {
  return `<g id="gond">
    <g id="trolley">
      <rect x="-20" y="-10" width="40" height="12" rx="5" fill="var(--steel)"/>
      <g class="wheel" transform="translate(-10 -7)"><circle r="6" fill="var(--steel2)"/><path d="M-6 0H6M0 -6V6" stroke="var(--steel)" stroke-width="1.6"/></g>
      <g class="wheel" transform="translate(10 -7)"><circle r="6" fill="var(--steel2)"/><path d="M-6 0H6M0 -6V6" stroke="var(--steel)" stroke-width="1.6"/></g>
    </g>
    <g id="cabin">
      <path d="M0 2V20M-14 20H14M-14 20L-24 31M14 20L24 31" stroke="var(--steel)" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <rect x="-33" y="29" width="66" height="52" rx="13" fill="var(--cabin)"/>
      <rect x="-33" y="29" width="66" height="12" rx="10" fill="var(--cabin2)"/>
      <clipPath id="winClip"><rect x="-25" y="42" width="50" height="26" rx="7"/></clipPath>
      <rect x="-25" y="42" width="50" height="26" rx="7" fill="var(--glass)"/>
      <g clip-path="url(#winClip)">
        <g id="goat" transform="translate(0 58)">
          <path d="M-9 -10 Q-15 -20 -7 -21 M9 -10 Q15 -20 7 -21" stroke="#8a6b4e" stroke-width="3" fill="none" stroke-linecap="round"/>
          <ellipse cx="-13" cy="-3" rx="6" ry="3" fill="#e9e1d4" transform="rotate(-20 -13 -3)"/>
          <ellipse cx="13" cy="-3" rx="6" ry="3" fill="#e9e1d4" transform="rotate(20 13 -3)"/>
          <ellipse cx="0" cy="1" rx="11" ry="12" fill="#f7f2ea"/>
          <ellipse cx="0" cy="7" rx="7" ry="5" fill="#efe3d3"/>
          <g id="eyes"><circle class="eye" cx="-4.5" cy="-1" r="1.9" fill="#2b2b2b"/><circle class="eye" cx="4.5" cy="-1" r="1.9" fill="#2b2b2b"/></g>
          <path id="mouth" d="M-3 8 Q0 10.5 3 8" stroke="#6b4a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </g>
        <rect x="-25" y="42" width="18" height="26" fill="rgba(255,255,255,.28)" transform="skewX(-18)"/>
      </g>
      <rect x="-33" y="70" width="66" height="11" rx="6" fill="var(--cabin2)"/>
      <circle cx="-22" cy="75.5" r="2" fill="var(--gold)"/><circle cx="22" cy="75.5" r="2" fill="var(--gold)"/>
    </g>
  </g>`;
}

function stationSVG(x, y, flip, label) {
  const s = flip ? -1 : 1;
  return `<g class="station">
    <rect x="${x - 30}" y="${y + 6}" width="60" height="40" rx="5" fill="var(--house)"/>
    <path d="M${x - 38} ${y + 10} L${x} ${y - 14} L${x + 38} ${y + 10}Z" fill="var(--roof)"/>
    <path d="M${x - 38} ${y + 10} L${x} ${y - 14} L${x + 38} ${y + 10} L${x + 30} ${y + 10} L${x} ${y - 6} L${x - 30} ${y + 10}Z" fill="var(--snow)" opacity=".9"/>
    <rect x="${x - 20}" y="${y + 18}" width="14" height="12" rx="2" fill="var(--lamp)" class="glow-win"/>
    <rect x="${x + 6}" y="${y + 18}" width="14" height="12" rx="2" fill="var(--lamp)" class="glow-win"/>
    <circle cx="${x}" cy="${y}" r="7" fill="var(--steel2)" stroke="var(--steel)" stroke-width="2.5"/>
    <g transform="translate(${x} ${y - 30})">
      <rect x="-28" y="-9" width="56" height="18" rx="5" fill="var(--sign)"/>
      <text x="0" y="4.5" text-anchor="middle" class="sig">${label}</text>
    </g>
  </g>`;
}

function lodgeSVG() {
  const smoke = Array.from({ length: 7 }, (_, i) => `<circle class="smoke" cx="531" cy="356" r="${5 + i % 3}" style="animation-delay:${(i * .62).toFixed(2)}s"/>`).join('');
  return `<g id="lodge">
    ${smoke}
    <rect x="525" y="360" width="12" height="26" fill="var(--chimney)"/>
    <rect x="455" y="392" width="90" height="42" rx="3" fill="var(--house)"/>
    <path d="M444 396 L500 356 L556 396Z" fill="var(--roof)"/>
    <path d="M444 396 L500 356 L556 396 L548 396 L500 364 L452 396Z" fill="var(--snow)"/>
    <rect id="lw1" x="466" y="402" width="16" height="14" rx="2" fill="var(--lamp)" class="glow-win"/>
    <rect id="lw2" x="518" y="402" width="16" height="14" rx="2" fill="var(--lamp)" class="glow-win"/>
    <rect x="492" y="410" width="16" height="24" rx="2" fill="var(--door)"/>
    <path d="M500 356 V330" stroke="var(--steel)" stroke-width="2"/>
    <path class="flag" d="M500 330 L522 336 L500 342Z" fill="var(--gold)"/>
  </g>`;
}

/**
 * Builds the scene inside `host`. stage: 1 foothills, 2 ridge, 3 peak.
 * Returns a controller: { travelTo, toStation, setFog, setMood, bump, celebrate, pins, destroy }.
 */
export function createScene(host, { stage = 1, smallLabel = 'SMALL', bigLabel = 'BIG' } = {}) {
  const night = document.documentElement.dataset.tod === 'night';
  const stars = night ? Array.from({ length: 46 }, () =>
    `<circle class="star" cx="${rand(0, W).toFixed(0)}" cy="${rand(0, 230).toFixed(0)}" r="${rand(.6, 1.8).toFixed(1)}" style="animation-delay:${rand(-4, 0).toFixed(2)}s;animation-duration:${rand(2.4, 5).toFixed(1)}s"/>`).join('') : '';
  const snow = stage === 3 ? Array.from({ length: 55 }, () =>
    `<circle class="flake" cx="${rand(0, W).toFixed(0)}" cy="-10" r="${rand(1.2, 3).toFixed(1)}" style="animation-delay:${rand(-12, 0).toFixed(2)}s;animation-duration:${rand(7, 14).toFixed(1)}s;--sx:${rand(-60, 60).toFixed(0)}px"/>`).join('') : '';
  const caps = stage >= 2 ? `<g fill="var(--snow)" opacity=".95">
      <path d="M650 200 L630 222 L642 219 L652 228 L662 218 L672 222Z"/><path d="M870 190 L850 214 L862 210 L873 220 L884 210 L894 214Z"/>
      <path d="M260 210 L242 230 L254 227 L262 236 L270 226 L280 230Z"/><path d="M460 220 L444 238 L455 235 L462 243 L470 234 L478 238Z"/></g>` : '';
  const bigCap = stage >= 2 ? `<path d="M850 160 L806 202 L826 198 L838 210 L852 196 L868 208 L880 196 L900 200Z" fill="var(--snow)"/>` : '';
  const sun = night
    ? `<g class="moon"><circle cx="820" cy="78" r="26" fill="#f4f1e6"/><circle cx="810" cy="70" r="5" fill="#e3dfd0"/><circle cx="830" cy="88" r="3.5" fill="#e3dfd0"/></g>`
    : `<g class="sun"><circle cx="${document.documentElement.dataset.tod === 'evening' ? 300 : 790}" cy="${document.documentElement.dataset.tod === 'evening' ? 210 : 82}" r="34" fill="var(--sun)"/></g>`;

  host.innerHTML = `
    <svg class="scene-svg stage-${stage}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A cable car between two mountain stations">
      <defs>
        <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
        <radialGradient id="sunGlow"><stop offset="0" stop-color="var(--sun)" stop-opacity=".55"/><stop offset="1" stop-color="var(--sun)" stop-opacity="0"/></radialGradient>
        <filter id="blur8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="farG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--far1)"/><stop offset="1" style="stop-color:var(--far2)"/></linearGradient>
        <linearGradient id="nearG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--near1)"/><stop offset="1" style="stop-color:var(--near2)"/></linearGradient>
        <linearGradient id="midG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--mid1)"/><stop offset="1" style="stop-color:var(--mid2)"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#skyG)"/>
      <g class="stars">${stars}</g>
      <circle cx="${night ? 820 : 790}" cy="${night ? 78 : 82}" r="110" fill="url(#sunGlow)" class="sunglow"/>
      ${sun}
      <g class="px" data-depth="6">${cloud(110, 1.1, 140, -40, .85)}${cloud(60, .8, 110, -90, .7)}${cloud(170, .7, 95, -10, .6)}</g>
      <g class="px birds-wrap" data-depth="10"><g class="birds">${bird(0, 0, 0)}${bird(26, 10, -.3)}${bird(-20, 14, -.6)}</g></g>
      <g class="px layer enter-far" data-depth="12">
        <path d="M-60 330 L80 250 L170 300 L260 210 L360 290 L460 220 L560 300 L650 200 L760 280 L870 190 L1060 270 L1060 560 L-60 560Z" fill="url(#farG)"/>
        ${caps}
      </g>
      <g class="px layer enter-mid" data-depth="22">
        <path d="M-60 380 C80 330 140 300 220 340 S380 300 470 350 S640 300 720 330 S900 290 1060 320 L1060 560 L-60 560Z" fill="url(#midG)"/>
        ${pine(240, 352, .45, 'far')}${pine(262, 356, .38, 'far')}${pine(690, 340, .42, 'far')}${pine(712, 344, .36, 'far')}
      </g>
      <g class="px layer enter-near" data-depth="34">
        <path d="M-60 560 L-60 330 L60 298 L150 258 L230 306 L330 376 L420 430 L470 560Z" fill="url(#nearG)"/>
        <path d="M520 560 L600 420 L700 300 L780 222 L850 162 L910 208 L1060 260 L1060 560Z" fill="url(#nearG)"/>
        ${bigCap}
        <path d="M290 560 C360 470 440 436 500 434 C560 436 640 470 710 560Z" fill="var(--hill)"/>
        ${lodgeSVG()}
        ${stationSVG(P0.x, P0.y, false, smallLabel)}
        ${stationSVG(P2.x, P2.y, true, bigLabel)}
        <path d="M${P0.x} ${P0.y - 3} Q${C.x} ${C.y - 3} ${P2.x} ${P2.y - 3}" stroke="var(--cable)" stroke-width="2.6" fill="none"/>
        <path d="M${P0.x} ${P0.y + 4} Q${C.x} ${C.y + 2} ${P2.x} ${P2.y + 4}" stroke="var(--cable)" stroke-width="1.4" fill="none" opacity=".55"/>
        <g id="pins"></g>
        ${gondolaSVG()}
        <g class="fog" id="fog" filter="url(#blur8)">
          <ellipse class="fogb" cx="500" cy="296" rx="240" ry="92" fill="var(--fog)"/>
          <ellipse class="fogb b2" cx="400" cy="320" rx="160" ry="64" fill="var(--fog)"/>
          <ellipse class="fogb b3" cx="610" cy="262" rx="170" ry="70" fill="var(--fog)"/>
        </g>
      </g>
      <g class="px layer enter-front" data-depth="52">
        ${pine(30, 540, 1.5)}${pine(92, 548, 1.05)}${pine(140, 556, .8)}${pine(905, 540, 1.35)}${pine(962, 550, 1)}${pine(860, 556, .75)}
      </g>
      <g class="snow">${snow}</g>
    </svg>
    <canvas class="fx"></canvas>`;

  const svg = host.querySelector('svg');
  const gond = svg.querySelector('#gond'), trolley = svg.querySelector('#trolley'), cabin = svg.querySelector('#cabin');
  const wheels = [...svg.querySelectorAll('.wheel')];
  const fog = svg.querySelector('#fog'), pins = svg.querySelector('#pins');
  const eyes = svg.querySelector('#eyes'), mouth = svg.querySelector('#mouth');
  const layers = [...svg.querySelectorAll('.px')];
  const canvas = host.querySelector('canvas.fx'), ctx = canvas.getContext('2d');

  const st = { t: STATION_T, v: 0, swing: 0, swingV: 0, wheel: 0, move: null, px: 0, py: 0, tx: 0, ty: 0, time: 0, idleAmp: 1.4 };
  const particles = [];
  let raf = 0, last = performance.now(), alive = true;

  function place() {
    const p = cableAt(st.t);
    gond.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    trolley.setAttribute('transform', `rotate(${cableAngle(st.t).toFixed(2)})`);
    const idle = reduced() ? 0 : Math.sin(st.time * 1.6) * st.idleAmp;
    cabin.setAttribute('transform', `rotate(${(st.swing + idle).toFixed(2)})`);
    wheels.forEach((w, i) => w.setAttribute('transform', `translate(${i ? 10 : -10} -7) rotate(${st.wheel.toFixed(1)})`));
  }

  function step(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; st.time += dt;
    let drive = 0;
    if (st.move) {
      const m = st.move, p = Math.min(1, (now - m.start) / m.dur);
      const prev = st.t;
      st.t = m.from + (m.to - m.from) * ease(p);
      const v = (st.t - prev) / Math.max(dt, 1e-3);
      drive = -((v - st.v) / Math.max(dt, 1e-3)) * 520;
      st.v = v;
      st.wheel += (st.t - prev) * 2600;
      if (p >= 1) { st.move = null; st.v = 0; m.done && m.done(); }
    }
    // Damped pendulum: the cabin leans back when it speeds up and swings when it stops.
    const K = 30, D = 2.1;
    st.swingV += (-K * st.swing - D * st.swingV + drive) * dt;
    st.swing += st.swingV * dt;
    st.swing = Math.max(-38, Math.min(38, st.swing));
    // Pointer parallax, smoothed.
    st.px += (st.tx - st.px) * Math.min(1, dt * 3);
    st.py += (st.ty - st.py) * Math.min(1, dt * 3);
    layers.forEach(l => { const d = Number(l.dataset.depth) / 52; l.style.transform = `translate(${(st.px * d * 18).toFixed(2)}px, ${(st.py * d * 8).toFixed(2)}px)`; });
    place();
    drawParticles(dt);
    raf = requestAnimationFrame(step);
  }

  function resize() {
    const r = host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  /** Converts viewBox coordinates to canvas CSS pixels (preserveAspectRatio slice). */
  function toPx(x, y) {
    const r = host.getBoundingClientRect(), s = Math.max(r.width / W, r.height / H);
    return { x: (r.width - W * s) / 2 + x * s, y: (r.height - H * s) / 2 + y * s, s };
  }
  function drawParticles(dt) {
    const r = host.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= (1 - 1.2 * dt); p.vy *= (1 - 1.2 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + a * .6), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * .25; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot += p.vr * dt); ctx.fillRect(-p.r, -p.r * .5, p.r * 2, p.r); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }
  function burst(x, y, n, colors, speed = 260, kind = 'spark', g = 120) {
    if (reduced()) return;
    const o = toPx(x, y);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * .75) * o.s;
      particles.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: g * o.s, life: rand(1.1, 2), max: 2, r: rand(2.4, 4.6) * Math.max(.8, o.s),
        c: colors[i % colors.length], kind, rot: Math.random() * 6, vr: rand(-8, 8) });
    }
  }

  const onMove = e => {
    const r = host.getBoundingClientRect();
    st.tx = ((e.clientX - r.left) / r.width - .5) * 2;
    st.ty = ((e.clientY - r.top) / r.height - .5) * 2;
  };
  const onLeave = () => { st.tx = 0; st.ty = 0; };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  const ro = new ResizeObserver(resize); ro.observe(host);
  resize(); place();
  raf = requestAnimationFrame(step);

  // Blink every few seconds.
  const blink = setInterval(() => { if (!reduced()) { eyes.classList.add('blink'); setTimeout(() => eyes.classList.remove('blink'), 160); } }, 3800);

  const MOUTHS = {
    happy: 'M-4 6.5 Q0 12 4 6.5', smile: 'M-3 8 Q0 10.5 3 8', neutral: 'M-3 8.5 L3 8.5',
    sad: 'M-3 10 Q0 7.5 3 10', wow: 'M-2 8 Q0 12.5 2 8 Q0 6 -2 8', dizzy: 'M-3 9 Q-1 7.5 0 9 Q1 10.5 3 9'
  };

  const api = {
    get t() { return st.t; },
    /** Glide to position t (0..1 along the cable). */
    travelTo(t, { dur, done } = {}) {
      t = Math.max(0.02, Math.min(0.98, t));
      if (reduced()) { st.t = t; place(); done && done(); return; }
      const dist = Math.abs(t - st.t);
      st.move = { from: st.t, to: t, start: performance.now(), dur: dur || 900 + dist * 2600, done };
    },
    toStation(opts) { api.travelTo(STATION_T, opts); },
    jumpTo(t) { st.t = Math.max(0.02, Math.min(0.98, t)); st.move = null; place(); },
    swing(amount) { st.swingV += amount; },
    setFog(on) { fog.classList.toggle('on', !!on); },
    setMood(m) {
      mouth.setAttribute('d', MOUTHS[m] || MOUTHS.smile);
      eyes.classList.toggle('happy', m === 'happy');
      eyes.classList.toggle('dizzy', m === 'dizzy');
    },
    /** A jolt at the station (rejected answer). */
    bump() { st.swingV += (Math.random() < .5 ? -1 : 1) * 160; host.classList.remove('jolt'); void host.offsetWidth; host.classList.add('jolt'); },
    /** Score-driven arrival: a gentle settle for great answers, wild swinging for bad ones. */
    settle(score) {
      st.swingV += (Math.random() < .5 ? -1 : 1) * (12 + (100 - score) * 1.9);
      st.idleAmp = score >= 90 ? .8 : score >= 50 ? 1.4 : 2.4;
    },
    celebrate(level) {
      const lodge = { x: 500, y: 330 };
      const gold = ['#ffd166', '#f4b942', '#ffffff', '#ff8c61', '#7bdff2', '#b8f2a6'];
      svg.querySelector('#lodge').classList.add('party');
      const n = level >= 100 ? 4 : 2;
      for (let i = 0; i < n; i++) setTimeout(() => alive && burst(lodge.x + rand(-180, 180), lodge.y - rand(90, 220), level >= 100 ? 90 : 60, gold, 340), i * 420);
      if (level >= 100) setTimeout(() => alive && burst(500, 0, 90, gold, 120, 'confetti', 160), 300);
    },
    /** Small numbered markers on the cable (previous guesses). */
    pins(list) {
      pins.innerHTML = list.map(p => {
        const q = cableAt(Math.max(0.02, Math.min(0.98, p.t)));
        return `<g class="pin" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})"><circle r="9" fill="var(--pin)" stroke="#fff" stroke-width="2"/><text y="4" text-anchor="middle" class="pin-t">${p.label}</text></g>`;
      }).join('');
    },
    destroy() {
      alive = false; cancelAnimationFrame(raf); clearInterval(blink); ro.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
    }
  };
  return api;
}

/* ───────────── The climb: daily total as altitude on a little mountain ───────────── */

const TRAIL = 'M10 92 C40 88 52 76 74 74 S104 60 122 58 S150 44 168 40 S196 22 214 14';
export function climbSVG(cls = 'climb') {
  return `<svg class="${cls}" viewBox="0 0 230 100" aria-hidden="true">
    <path d="M0 100 L40 78 L70 84 L118 50 L140 58 L214 8 L230 18 L230 100Z" fill="var(--climb-mtn)"/>
    <path d="M214 8 L200 20 L208 19 L214 26 L221 18 L228 20Z" fill="var(--snow)"/>
    <path class="trail-bg" d="${TRAIL}" fill="none"/>
    <path class="trail-fill" d="${TRAIL}" fill="none"/>
    <path d="M214 14 V-2" stroke="var(--steel)" stroke-width="1.5"/><path class="summit-flag" d="M214 -2 L226 2 L214 6Z" fill="var(--accent)"/>
    <g class="climber"><circle r="6" fill="var(--accent)" stroke="#fff" stroke-width="2"/></g>
  </svg>`;
}

/** Animates a climb widget from its current progress to `pct` (0..1). */
export function animateClimb(svgEl, pct, { dur = 1400, onTick } = {}) {
  if (!svgEl) return;
  const fill = svgEl.querySelector('.trail-fill'), climber = svgEl.querySelector('.climber');
  const len = fill.getTotalLength();
  fill.style.strokeDasharray = `${len}`;
  const from = Number(svgEl.dataset.pct || 0);
  const start = performance.now();
  const go = now => {
    const p = reduced() ? 1 : Math.min(1, (now - start) / dur);
    const cur = from + (pct - from) * ease(p);
    fill.style.strokeDashoffset = `${len * (1 - cur)}`;
    const pt = fill.getPointAtLength(len * cur);
    climber.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
    onTick && onTick(cur);
    if (p < 1) requestAnimationFrame(go); else svgEl.dataset.pct = String(pct);
  };
  requestAnimationFrame(go);
}
