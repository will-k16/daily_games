// The field notebook: middle finder, saved values, unit converter, calculator.
// Docked beside the puzzle on wide screens, a bottom sheet on phones. Saved in localStorage.
import { DIMS, propDim, convert, defaultUnit, parseNum, plain, nice } from './units.js';
import { propLabel } from './props.js';
import { icon } from './sprites.js';

const KEY = 'jr.pad';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

const P = Object.assign({
  tab: 'finder',
  finder: { a: '', au: '', b: '', bu: '', out: '' },
  notes: [],
  conv: { v: '', dim: 'mass', from: 'kg', to: 'lb' },
  hist: []
}, load());
let root = null, puzzle = null, units = 'imperial', onClose = () => {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private mode */ } };

export function mount(el, opts) {
  root = el; units = opts.units; onClose = opts.onClose;
  draw();
}
export function setUnits(u) { units = u; draw(); }
export function showTab(tab) { P.tab = tab; save(); draw(); }
export function setPuzzle(p, u) {
  const changed = !puzzle || puzzle.id !== p.id;
  puzzle = p; units = u;
  if (changed) {
    const { dim } = propDim(p.property);
    const du = defaultUnit(dim, units);
    // Point the finder at this puzzle's kind of unit (keep numbers if the kind matches).
    if (!unitIn(dim, P.finder.au)) P.finder.au = du;
    if (!unitIn(dim, P.finder.bu)) P.finder.bu = du;
    if (!unitIn(dim, P.finder.out)) P.finder.out = du;
    if (P.conv.dim !== dim) P.conv = { v: P.conv.v, dim, from: DIMS[dim].units[0][0], to: du };
    save();
  }
  draw();
}
const unitIn = (dim, id) => !!(DIMS[dim] && DIMS[dim].units.some(u => u[0] === id));
const curDim = () => puzzle ? propDim(puzzle.property).dim : 'mass';

function unitOptions(dim, sel) {
  return DIMS[dim].units.map(u => `<option value="${esc(u[0])}" ${u[0] === sel ? 'selected' : ''}>${esc(u[0])}${u[2] ? ' · ' + esc(u[2]) : ''}</option>`).join('');
}
function allUnitOptions(sel) {
  return Object.entries(DIMS).map(([k, d]) => `<optgroup label="${esc(d.name)}">${d.units.map(u => `<option value="${k}:${esc(u[0])}" ${k + ':' + u[0] === sel ? 'selected' : ''}>${esc(u[0])}</option>`).join('')}</optgroup>`).join('');
}

function draw() {
  if (!root) return;
  const sum = puzzle
    ? `<div class="pad-sum"><b>${esc(propLabel(puzzle.property))}</b>: between <b>${esc(puzzle.small)}</b> and <b>${esc(puzzle.big)}</b></div>` : '';
  const tabs = [['finder', 'Middle'], ['notes', 'Notes'], ['convert', 'Convert'], ['calc', 'Calc']];
  root.innerHTML = `
    <div class="pad-head"><h3>📓 Field notebook</h3><button class="x" id="padX" aria-label="Close notebook">${icon('close')}</button></div>
    ${sum}
    <div class="pad-tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${P.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="pad-body" id="padBody"></div>`;
  root.querySelector('#padX').onclick = onClose;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { P.tab = b.dataset.tab; save(); draw(); });
  ({ finder: drawFinder, notes: drawNotes, convert: drawConvert, calc: drawCalc })[P.tab]();
}

/* ── Middle finder ── */
function drawFinder() {
  const dim = curDim(), f = P.finder;
  const body = root.querySelector('#padBody');
  body.innerHTML = `
    <h4>Middle finder</h4>
    <p class="help">Guess how big each end is, in any unit you like. If those guesses are about right, the juuust-right value is about
      <span class="formula">√(small × big)</span>. That's the middle <b>by ratio</b>, not the plain average.</p>
    <div class="prow"><div><label for="fa">Too small is about…</label><input class="pin" id="fa" inputmode="decimal" placeholder="e.g. 10" value="${esc(f.a)}"></div>
      <div><label for="fau">unit</label><select class="psel" id="fau">${unitOptions(dim, f.au)}</select></div></div>
    <div class="prow"><div><label for="fb">Too big is about…</label><input class="pin" id="fb" inputmode="decimal" placeholder="e.g. 300,000" value="${esc(f.b)}"></div>
      <div><label for="fbu">unit</label><select class="psel" id="fbu">${unitOptions(dim, f.bu)}</select></div></div>
    <div class="prow"><div><label>Show the middle in</label></div><div><select class="psel" id="fo">${unitOptions(dim, f.out)}</select></div></div>
    <div id="fres"></div>
    <p class="help" style="margin-top:10px">Tip: numbers like <b>1.5 million</b>, <b>3e6</b> and <b>12k</b> all work.</p>`;
  const upd = () => {
    f.a = body.querySelector('#fa').value; f.au = body.querySelector('#fau').value;
    f.b = body.querySelector('#fb').value; f.bu = body.querySelector('#fbu').value; f.out = body.querySelector('#fo').value;
    save();
    const a = parseNum(f.a), b = parseNum(f.b), res = body.querySelector('#fres');
    if (!f.a && !f.b) { res.innerHTML = ''; return; }
    if (!(a > 0) || !(b > 0)) { res.innerHTML = `<div class="pres err">Type a positive number for both ends.</div>`; return; }
    const aBase = convert(a, dim, f.au, DIMS[dim].units[0][0]);
    const bBase = convert(b, dim, f.bu, DIMS[dim].units[0][0]);
    const midBase = Math.sqrt(aBase * bBase);
    const out = convert(midBase, dim, DIMS[dim].units[0][0], f.out);
    const others = DIMS[dim].units.filter(u => u[0] !== f.out).map(u => [u[0], convert(midBase, dim, DIMS[dim].units[0][0], u[0])])
      .filter(([, v]) => v >= 0.01 && v < 1e7).slice(0, 4).map(([u, v]) => `${nice(v)} ${u}`).join(' · ');
    const ratio = Math.max(aBase, bBase) / Math.min(aBase, bBase);
    res.innerHTML = `<div class="pres"><div>Juuust right ≈</div><div class="big">${nice(out)} ${esc(f.out)}</div>
      ${others ? `<div class="also">= ${esc(others)}</div>` : ''}
      <div class="also">The big end is ${nice(ratio)}× the small end, so just right is about ${nice(Math.sqrt(ratio))}× each way.</div>
      <div class="row" style="margin-top:8px"><button class="pbtn" id="fsave">Save to notes</button></div></div>`;
    res.querySelector('#fsave').onclick = () => {
      P.notes.push({ name: 'middle guess', v: plain(out), dim, unit: f.out }); save(); toastLocal('Saved to notes');
    };
  };
  body.querySelectorAll('input,select').forEach(el => el.addEventListener('input', upd));
  upd();
}

/* ── Notes ── */
function drawNotes() {
  const body = root.querySelector('#padBody');
  const rows = P.notes.map((n, i) => `<div class="nrow"><div><b>${esc(n.name)}</b><span>${esc(n.v)} ${esc(n.unit)}</span></div>
      <div class="acts"><button data-small="${i}" title="Use as the small end">→ small</button><button data-big="${i}" title="Use as the big end">→ big</button><button data-del="${i}" aria-label="Delete">✕</button></div></div>`).join('');
  const dim = curDim();
  body.innerHTML = `
    <h4>Notes</h4>
    <p class="help">Jot down things you know, like “a horse ≈ 1,000 lb”. Send any of them to the middle finder.</p>
    <div class="notes">${rows || '<p class="help">Nothing yet.</p>'}</div>
    <form class="addform" id="addf" autocomplete="off">
      <b style="font-family:var(--font-px)">+ Add a value</b>
      <input class="pin" name="name" placeholder="What is it? (e.g. a horse)" maxlength="40">
      <div class="two"><input class="pin" name="v" inputmode="decimal" placeholder="How much?">
        <select class="psel" name="u">${allUnitOptions(dim + ':' + defaultUnit(dim, units))}</select></div>
      <button class="pbtn go" type="submit">Add</button>
    </form>
    <label class="help" style="display:block;margin-top:12px" for="ntext"><b>Scribbles</b></label>
    <textarea class="pin" id="ntext" style="height:90px;padding:8px" placeholder="Anything else…">${esc(P.text || '')}</textarea>`;
  body.querySelector('#ntext').oninput = e => { P.text = e.target.value; save(); };
  body.querySelector('#addf').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const v = parseNum(fd.get('v'));
    if (!String(fd.get('name')).trim()) return toastLocal('Give it a name');
    if (!(v > 0)) return toastLocal('Type a positive number');
    const [d, u] = String(fd.get('u')).split(':');
    P.notes.push({ name: String(fd.get('name')).trim().slice(0, 40), v: plain(v), dim: d, unit: u }); save(); draw();
  };
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { P.notes.splice(Number(b.dataset.del), 1); save(); draw(); });
  const send = (i, which) => {
    const n = P.notes[i], d = curDim();
    if (n.dim !== d) return toastLocal(`That's a ${DIMS[n.dim].name.toLowerCase()}, but this puzzle is about ${DIMS[d].name.toLowerCase()}.`);
    P.finder[which] = n.v; P.finder[which + 'u'] = n.unit; P.tab = 'finder'; save(); draw();
  };
  body.querySelectorAll('[data-small]').forEach(b => b.onclick = () => send(Number(b.dataset.small), 'a'));
  body.querySelectorAll('[data-big]').forEach(b => b.onclick = () => send(Number(b.dataset.big), 'b'));
}

/* ── Converter ── */
function drawConvert() {
  const c = P.conv, body = root.querySelector('#padBody');
  body.innerHTML = `
    <h4>Unit converter</h4>
    <p class="help">Measure things however you like (grams, pounds, feet, meters…) and convert here.</p>
    <div class="prow" style="grid-template-columns:1fr"><div><label for="cd">Kind of unit</label>
      <select class="psel" id="cd">${Object.entries(DIMS).map(([k, d]) => `<option value="${k}" ${k === c.dim ? 'selected' : ''}>${d.name}</option>`).join('')}</select></div></div>
    <div class="prow"><div><label for="cv">Amount</label><input class="pin" id="cv" inputmode="decimal" placeholder="e.g. 250" value="${esc(c.v)}"></div>
      <div><label for="cf">from</label><select class="psel" id="cf">${unitOptions(c.dim, c.from)}</select></div></div>
    <div class="prow"><div><button class="pbtn" id="cswap" type="button">⇅ swap</button></div>
      <div><label for="ct">to</label><select class="psel" id="ct">${unitOptions(c.dim, c.to)}</select></div></div>
    <div id="cres"></div>`;
  body.querySelector('#cd').onchange = e => { const d = e.target.value; P.conv = { v: c.v, dim: d, from: DIMS[d].units[0][0], to: defaultUnit(d, units) }; save(); draw(); };
  body.querySelector('#cswap').onclick = () => { [c.from, c.to] = [c.to, c.from]; save(); draw(); };
  const upd = () => {
    c.v = body.querySelector('#cv').value; c.from = body.querySelector('#cf').value; c.to = body.querySelector('#ct').value; save();
    const v = parseNum(c.v), res = body.querySelector('#cres');
    if (!c.v) { res.innerHTML = ''; return; }
    if (!isFinite(v)) { res.innerHTML = '<div class="pres err">That isn\'t a number I can read.</div>'; return; }
    const out = convert(v, c.dim, c.from, c.to);
    res.innerHTML = `<div class="pres"><div>${esc(nice(v))} ${esc(c.from)} =</div><div class="big">${esc(nice(out))} ${esc(c.to)}</div>
      <div class="row" style="margin-top:8px"><button class="pbtn" id="csave">Save to notes</button></div></div>`;
    res.querySelector('#csave').onclick = () => { P.notes.push({ name: 'converted', v: plain(out), dim: c.dim, unit: c.to }); save(); toastLocal('Saved to notes'); };
  };
  body.querySelectorAll('#cv,#cf,#ct').forEach(el => el.addEventListener('input', upd));
  upd();
}

/* ── Calculator ── */
function drawCalc() {
  const body = root.querySelector('#padBody');
  const KEYS = ['7', '8', '9', '÷', '√', '4', '5', '6', '×', '^', '1', '2', '3', '−', '(', '0', '.', 'E', '+', ')', 'C', '⌫', '='];
  body.innerHTML = `
    <h4>Calculator</h4>
    <p class="help">Plain numbers only, no units. <b>√</b> = square root, <b>^</b> = power, <b>E</b> = ×10 to the power (2E6 = 2,000,000).</p>
    <input class="calc-in" id="cx" autocomplete="off" spellcheck="false" placeholder="e.g. √(10 × 300000)">
    <div class="calc-prev" id="cp"></div>
    <div class="keys">${KEYS.map(k => `<button type="button" class="${'÷×−+^√()'.includes(k) ? 'op' : ''} ${k === '=' ? 'eq' : ''}" data-k="${k}">${k}</button>`).join('')}</div>
    <div class="hist" id="ch">${P.hist.slice().reverse().map(h => `<div data-v="${esc(h.v)}">${esc(h.e)} = <b>${esc(nice(Number(h.v)))}</b></div>`).join('') || '<div style="cursor:default;color:#8a6a52">History shows up here.</div>'}</div>`;
  const x = body.querySelector('#cx'), pv = body.querySelector('#cp');
  const prev = () => {
    pv.classList.remove('bad');
    if (!x.value.trim()) { pv.textContent = ''; return; }
    try { pv.textContent = '= ' + nice(calc(x.value)); } catch (e) { pv.textContent = e.message; pv.classList.add('bad'); }
  };
  const commit = () => {
    try { const v = calc(x.value); P.hist.push({ e: x.value.trim(), v: plain(v) }); P.hist = P.hist.slice(-30); save(); drawCalc(); root.querySelector('#cx').value = plain(v); }
    catch (e) { pv.textContent = e.message; pv.classList.add('bad'); }
  };
  x.addEventListener('input', prev);
  x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  body.querySelector('.keys').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.k;
    if (k === '=') return commit();
    if (k === 'C') { x.value = ''; prev(); return; }
    if (k === '⌫') { x.value = x.value.slice(0, -1); prev(); return; }
    x.value += k === '√' ? '√(' : k; prev(); x.focus();
  };
  body.querySelector('#ch').onclick = e => { const d = e.target.closest('[data-v]'); if (d) { x.value += d.dataset.v; prev(); } };
}

/** Small safe expression parser: + − × ÷ ^ √ ( ) and E-notation. */
function calc(src) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/sqrt/gi, '√');
  const toks = [];
  for (let i = 0; i < s.length;) {
    const c = s[i], rest = s.slice(i); let m;
    if (/\s/.test(c)) { i++; continue; }
    if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest))) { toks.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ('+-*/^()√'.includes(c)) { toks.push({ t: c }); i++; continue; }
    throw new Error(`Can't read “${c}”`);
  }
  const out = [];
  toks.forEach(tk => {
    const p = out[out.length - 1];
    if (p && (p.t === 'n' || p.t === ')') && (tk.t === 'n' || tk.t === '(' || tk.t === '√')) out.push({ t: '*' });
    out.push(tk);
  });
  let k = 0;
  const eat = t => (out[k] && out[k].t === t) ? (k++, true) : false;
  const expr = () => { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; } };
  const term = () => { let v = unary(); for (;;) { if (eat('*')) v *= unary(); else if (eat('/')) v /= unary(); else return v; } };
  const unary = () => eat('-') ? -unary() : eat('+') ? unary() : power();
  const power = () => { const b = primary(); return eat('^') ? Math.pow(b, unary()) : b; };
  const primary = () => {
    const tk = out[k]; if (!tk) throw new Error('Keep going…');
    if (tk.t === 'n') { k++; return tk.v; }
    if (tk.t === '√') { k++; return Math.sqrt(primary()); }
    if (tk.t === '(') { k++; const v = expr(); if (!eat(')')) throw new Error('Missing )'); return v; }
    throw new Error('Unexpected ' + tk.t);
  };
  const v = expr();
  if (k < out.length) throw new Error('Unexpected ' + out[k].t);
  if (!isFinite(v)) throw new Error('Not a number');
  return v;
}

function toastLocal(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
}
