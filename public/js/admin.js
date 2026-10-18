// WK Game Suite admin: one page with a tab per game. Suite = players, WK Bucks, AI health;
// Summit = today, calendar, complaints, answers; Venn = calendar, complaints, judgments;
// Polly = dashboard, add (URL / pasted text / by hand), bank, calendar, reports, sources.
import { fmt, nice } from './units.js';
import { PROPS, ROOMS, propLabel } from './props.js';
import { bucksIcon } from './bucks.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const units = (() => { try { return JSON.parse(localStorage.getItem('jr.units')) || 'imperial'; } catch { return 'imperial'; } })();
const show = (prop, v, u) => fmt(prop, v, u, units);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const room = slot => ROOMS.find(r => r.slot === slot) || ROOMS[0];

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch('/api/' + path, opt);
  const data = await res.json().catch(() => ({ error: 'Bad response' }));
  if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800); }
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modalX').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ═══════════ Tabs ═══════════ */
const SUBTABS = {
  suite: [],
  summit: [['summit', 'Today'], ['summit/cal', 'Calendar'], ['summit/comp', 'Complaints'], ['summit/ans', 'Answers']],
  venn: [['venn', 'Calendar'], ['venn/comp', 'Complaints'], ['venn/judg', 'Judgments']],
  polly: [['polly', 'Dashboard'], ['polly/auto', 'Auto-find'], ['polly/add', 'Add'], ['polly/bank', 'Bank'], ['polly/cal', 'Calendar'], ['polly/rep', 'Reports'], ['polly/src', 'Sources']]
};
const VIEWS = {
  suite: box => suiteTab(box),
  summit: box => summitToday(box),
  'summit/cal': box => cal(box),
  'summit/comp': box => comp(box),
  'summit/ans': box => ans(box),
  venn: box => vennCal(box),
  'venn/comp': box => vennComp(box),
  'venn/judg': box => vennJudg(box),
  polly: box => pollyDash(box),
  'polly/auto': box => pollyAutoTab(box),
  'polly/add': box => pollyAdd(box),
  'polly/bank': box => pollyBank(box),
  'polly/cal': box => pollyCal(box),
  'polly/rep': box => pollyRep(box),
  'polly/src': box => pollySrc(box)
};
let tab = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'suite';
document.querySelectorAll('#atabs [data-t]').forEach(b => b.onclick = () => go(b.dataset.t));
function go(t) {
  if (!VIEWS[t]) t = 'suite';
  tab = t; history.replaceState(null, '', '#' + t);
  const top = t.split('/')[0];
  document.querySelectorAll('#atabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === top));
  const subs = SUBTABS[top];
  $('#subtabs').innerHTML = subs.map(([k, n]) => `<button class="tbtn ${k === t ? 'on' : ''}" data-s="${k}">${n}</button>`).join('')
    + (top === 'summit' ? '<a class="tbtn" href="/summit#/unlimited">∞ Summit unlimited</a>' : top === 'venn' ? '<a class="tbtn" href="/venn#/unlimited">∞ Venn unlimited</a>'
      : top === 'polly' ? '<a class="tbtn" href="/polly#/unlimited">∞ Polly unlimited</a>' : '');
  $('#subtabs').hidden = !subs.length;
  $('#subtabs').querySelectorAll('[data-s]').forEach(b => b.onclick = () => go(b.dataset.s));
  const box = $('#admin');
  box.innerHTML = '<div class="loading">Loading…</div>';
  VIEWS[t](box).catch(e => {
    box.innerHTML = `<div class="card"><div class="note bad">${esc(e.message)}</div>
      ${/Admins only/.test(e.message) ? `<p class="sub">Sign in with your admin Google account, then come back to this page.</p>
        <div class="row"><a class="btn" href="/api/auth/login?return=/" style="display:inline-flex;align-items:center;text-decoration:none">Sign in with Google</a></div>` : ''}</div>`;
  });
}

/* ═══════════ Suite ═══════════ */
async function suiteTab(box) {
  const d = await api('admin/suite');
  const g = Object.fromEntries(d.games.map(x => [x.key, x]));
  $('#sumN').textContent = g.summit.openComplaints ? `(${g.summit.openComplaints})` : '';
  $('#vennN').textContent = g.venn.openComplaints ? `(${g.venn.openComplaints})` : '';
  $('#pollyN').textContent = g.polly.openComplaints ? `(${g.polly.openComplaints})` : '';
  box.innerHTML = `
    <section class="card"><div class="kicker"><span>Today · ${d.date} (UTC)</span></div>
      <div class="section-title">Real players</div>
      <div class="tbl"><table><thead><tr><th>Game</th><th>Today</th><th>Ever</th><th>Open complaints / reports</th></tr></thead>
        <tbody>${d.games.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${x.today}</td><td>${x.ever}</td><td>${x.openComplaints}</td></tr>`).join('')}
        <tr><td><b>Any game</b></td><td>–</td><td>${d.players}</td><td></td></tr></tbody></table></div>
      ${d.pollyBank && d.pollyBank.low ? `<div class="note warn" style="margin-top:10px">Polly's bank is low: ${d.pollyBank.fresh} approved, never-run questions left (${d.pollyBank.days} ${d.pollyBank.days === 1 ? 'day' : 'days'}). <a href="#polly/add">Add more</a>.</div>` : ''}
      <p class="sub">“Players” only counts people who started at least one stage, round or Polly question. Another ${d.visitsOnly} ${d.visitsOnly === 1 ? 'visit' : 'visits'} never played: mostly bots, link previews, and new guest IDs after signing out. ${d.signedIn} ${d.signedIn === 1 ? 'account' : 'accounts'}.</p>
      <div class="section-title">${bucksIcon()} Your WK Bucks</div>
      <form class="cgrant" id="cgrant"><span>You have <b id="myBucks">${d.myBucks}</b>.</span>
        <input class="box" name="n" type="number" step="1" value="500" aria-label="How many WK Bucks">
        <button class="mini-btn ok" type="submit">Give me these</button><button class="mini-btn danger" type="button" id="ctake">Take away</button></form>
    </section>
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">AI calls (last 24h)</h2>
      <div class="tbl"><table><thead><tr><th>Provider</th><th>Kind</th><th>OK</th><th>Failed</th><th>Avg ms</th></tr></thead>
      <tbody>${d.ai.map(a => `<tr><td>${esc(a.provider)}</td><td>${esc(a.kind)}</td><td>${a.ok}</td><td>${a.fail}</td><td>${Math.round(a.ms)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No AI calls yet.</td></tr>'}</tbody></table></div>
      <p class="sub">Rate-limit hits (last 24h): <b>${d.rateLimited}</b>. Each one just moved the call on to the backup provider.</p>
      ${d.errors.length ? `<div class="section-title">Recent errors (last 3 days)</div>${d.errors.map(e => `<p class="sub"><b>${esc(e.provider)}/${esc(e.kind)}</b> ${esc(e.created_at)}: ${esc(e.error)}</p>`).join('')}` : ''}
    </section>`;
  const f = $('#cgrant');
  const grant = async sign => {
    const n = Math.trunc(Number(f.n.value));
    if (!(n > 0)) return toast('Type a positive whole number.');
    try {
      const r = await api('admin/bucks', { amount: sign * n });
      $('#myBucks').textContent = r.bucks.balance;
      toast(sign > 0 ? `Added ${n} WK Bucks.` : `Took away ${n} WK Bucks.`);
    } catch (e) { toast(e.message); }
  };
  f.onsubmit = e => { e.preventDefault(); grant(1); };
  $('#ctake').onclick = () => grant(-1);
}

/* ═══════════ Summit: today ═══════════ */
async function summitToday(box) {
  const d = await api('admin/dashboard');
  $('#sumN').textContent = d.openComplaints ? `(${d.openComplaints})` : '';
  const day = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const spread = d.hist.map((n, i) => ({ n, label: i === 10 ? '1000' : String(i * 100), tip: i === 10 ? 'a perfect 1000' : `${i * 100}–${i * 100 + 99}` }));
  const week = d.week.map(w => ({ n: w.n, label: day(w.date), tip: day(w.date) }));
  box.innerHTML = `
    <section class="card"><div class="kicker"><span>Summit · ${d.date} (UTC)</span></div>
      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><b>${d.todayPlayers}</b><span>Players today</span></div>
        <div class="kpi"><b>${d.players}</b><span>Players ever</span></div>
        <div class="kpi"><b>${d.openComplaints}</b><span>Open complaints</span></div>
      </div>
      <div class="section-title">Today's stages</div>
      <div class="tbl"><table><thead><tr><th>Stage</th><th>Puzzle</th><th>Status</th><th>Finished</th><th>Avg</th><th>2nd guess</th></tr></thead>
      <tbody>${d.rooms.map(r => `<tr><td>${room(r.slot).emoji} ${room(r.slot).name}</td><td>${esc(r.small_item)} ↔ ${esc(r.big_item)}<br><span class="sub">${esc(propLabel(r.property))}</span></td>
        <td><span class="st ${r.status}">${r.status}</span></td><td>${r.plays}</td><td>${r.avg == null ? '–' : Math.round(r.avg)}</td><td>${r.plays ? Math.round(100 * (r.seconds || 0) / r.plays) + '%' : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Not generated yet. It will be created on the first visit.</td></tr>'}</tbody></table></div>
      <div class="crowd" style="margin-top:6px">
        <div><div class="section-title">Score spread today</div>${bars(spread, 'finished stage', 'finished stages')}
          <p class="sub">How many finished stages scored in each range (each player counts up to 3 times).</p></div>
        <div><div class="section-title">Daily players (14 days)</div>${bars(week, 'player', 'players', 2)}
          <p class="sub">People who played that day's puzzles on the day.</p></div>
      </div>
    </section>`;
}


/** A bar chart with the count on top of every bar and a label underneath. `every` thins the labels out. */
function bars(items, one, many, every = 1) {
  const max = Math.max(1, ...items.map(x => x.n));
  return `<div class="abars">${items.map((x, i) => `<div class="ab" title="${esc(x.tip)}: ${x.n} ${x.n === 1 ? one : many}">
      <span class="abn">${x.n}</span><i style="height:${x.n ? Math.max(6, x.n / max * 100) : 0}%"></i>
      <span class="abl">${i % every === every - 1 || i === items.length - 1 ? esc(x.label) : ''}</span></div>`).join('')}</div>`;
}

/* ═══════════ Summit: calendar ═══════════ */
async function cal(box) {
  const d = await api(`admin/calendar?from=${addDays(today(), -14)}&to=${addDays(today(), 30)}`);
  const byDate = {};
  d.puzzles.forEach(p => { (byDate[p.date] = byDate[p.date] || []).push(p); });
  const dates = [];
  for (let i = -14; i <= 30; i++) dates.push(addDays(d.today, i));
  const cell = (date, slot) => {
    const list = (byDate[date] || []).filter(p => p.slot === slot);
    const live = list.find(p => p.status === 'approved' || p.status === 'auto');
    const drafts = list.filter(p => p.status === 'draft');
    const show1 = live || drafts[drafts.length - 1];
    const genBtn = `<button class="mini-btn" data-gen="${date}|${slot}" title="Ask the AI for a new draft for this stage">✨ Generate</button>`;
    if (!show1) {
      const rejected = list.filter(p => p.status === 'rejected').length;
      return `<td><span class="st empty">empty</span>${rejected ? ` <span class="sub">${rejected} rejected</span>` : ''}
        <div class="row" style="margin-top:6px;gap:4px">${genBtn}<button class="mini-btn" data-new="${date}|${slot}">+ Write one</button>
        ${rejected ? `<button class="mini-btn" data-all="${date}|${slot}">All (${list.length})</button>` : ''}</div></td>`;
    }
    const mid = Math.sqrt(show1.smallValue * show1.bigValue);
    return `<td><span class="st ${show1.status}">${show1.status}</span>${drafts.length > (live ? 0 : 1) ? ` <span class="sub">+${drafts.length - (live ? 0 : 1)} draft</span>` : ''}
      <div style="margin-top:4px"><b>${esc(show1.smallItem)}</b> ↔ <b>${esc(show1.bigItem)}</b></div>
      <div class="sub">${esc(propLabel(show1.property))} · middle ≈ ${esc(show(show1.property, mid, show1.unitLabel))} · ${nice(show1.bigValue / show1.smallValue)}×${show1.plays ? ` · <b>${show1.plays} plays</b>` : ''}</div>
      <div class="row" style="margin-top:6px;gap:4px">
        ${show1.status === 'draft' ? `<button class="mini-btn ok" data-approve="${show1.id}">Approve</button>` : ''}
        <button class="mini-btn" data-edit="${show1.id}">Edit</button>
        ${!show1.plays ? genBtn : ''}
        ${list.length > 1 ? `<button class="mini-btn" data-all="${date}|${slot}">All (${list.length})</button>` : ''}
        ${!show1.plays && show1.status !== 'rejected' ? `<button class="mini-btn danger" data-reject="${show1.id}">Reject</button>` : ''}
      </div></td>`;
  };
  box.innerHTML = `
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Generate drafts</h2>
      <p class="sub">The AI writes a tiered set (easy Foothills, medium Ridge, hard Peak) for each day that has an empty stage. Approve or edit them below. Days with nothing approved use their draft automatically, or the AI makes one on the spot.</p>
      <div class="row"><label class="sub">From <input type="date" id="gFrom" class="box" style="width:auto" value="${addDays(d.today, 1)}"></label>
        <label class="sub">Days <select id="gDays" class="box" style="width:auto">${[1, 3, 5, 7].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn sm" id="gGo">Generate</button></div>
    </section>
    <section class="card"><div class="tbl"><table>
      <thead><tr><th>Date</th>${ROOMS.map(r => `<th>${r.emoji} ${r.name} · ${r.tier}</th>`).join('')}</tr></thead>
      <tbody>${dates.map(dt => `<tr class="${dt === d.today ? 'today' : ''}"><td><b>${dt.slice(5)}</b>${dt === d.today ? '<br><span class="badge">today</span>' : ''}</td>${[1, 2, 3].map(s => cell(dt, s)).join('')}</tr>`).join('')}</tbody>
    </table></div></section>`;

  const all = d.puzzles;
  $('#gGo').onclick = async () => {
    $('#gGo').disabled = true; $('#gGo').textContent = 'Thinking…';
    try { const r = await api('admin/generate', { from: $('#gFrom').value, days: Number($('#gDays').value) }); toast(r.failed ? `Made ${r.made} drafts. ${r.failed} rooms are still empty because the AI was busy. Wait a minute, then use ✨ Generate on them.` : `Made ${r.made} drafts`); go('summit/cal'); }
    catch (e) { toast(e.message); $('#gGo').disabled = false; $('#gGo').textContent = 'Generate'; }
  };
  box.querySelectorAll('[data-gen]').forEach(b => b.onclick = async () => {
    const [date, slot] = b.dataset.gen.split('|');
    b.disabled = true; b.textContent = 'Thinking…';
    try {
      const r = await api('admin/generate-slot', { date, slot: Number(slot) });
      toast(`New ${room(Number(slot)).name} draft: ${r.puzzle.smallItem} ↔ ${r.puzzle.bigItem}`); go('summit/cal');
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = '✨ Generate'; }
  });
  box.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => setStatus(Number(b.dataset.approve), 'approved'));
  box.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => { if (confirm('Reject this puzzle?')) setStatus(Number(b.dataset.reject), 'rejected'); });
  box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editor(all.find(p => p.id === Number(b.dataset.edit))));
  box.querySelectorAll('[data-new]').forEach(b => { const [date, slot] = b.dataset.new.split('|'); b.onclick = () => editor({ date, slot: Number(slot), status: 'approved' }); });
  box.querySelectorAll('[data-all]').forEach(b => {
    const [date, slot] = b.dataset.all.split('|');
    b.onclick = () => {
      const list = all.filter(p => p.date === date && p.slot === Number(slot));
      openModal(`<h2>${date} · ${room(Number(slot)).name}</h2>${list.map(p => `<div class="fact" style="grid-template-columns:auto 1fr auto">
        <span class="st ${p.status}">${p.status}</span><div class="w"><b>${esc(p.smallItem)} ↔ ${esc(p.bigItem)}</b><small>${esc(propLabel(p.property))} · ${p.plays} plays · ${esc(p.note)}</small></div>
        <div style="display:flex;gap:4px;flex-direction:column">${p.status === 'draft' ? `<button class="mini-btn ok" data-ap="${p.id}">Approve</button>` : ''}<button class="mini-btn" data-ed="${p.id}">Edit</button>
        ${!p.plays ? `<button class="mini-btn danger" data-del="${p.id}">Delete</button>` : ''}</div></div>`).join('')}`);
      $('#modalBody').querySelectorAll('[data-ap]').forEach(x => x.onclick = () => { closeModal(); setStatus(Number(x.dataset.ap), 'approved'); });
      $('#modalBody').querySelectorAll('[data-ed]').forEach(x => x.onclick = () => editor(all.find(p => p.id === Number(x.dataset.ed))));
      $('#modalBody').querySelectorAll('[data-del]').forEach(x => x.onclick = async () => {
        if (!confirm('Delete this puzzle for good?')) return;
        try { await api('admin/puzzle/delete', { id: Number(x.dataset.del) }); closeModal(); toast('Deleted'); go('summit/cal'); } catch (e) { toast(e.message); }
      });
    };
  });
}

async function setStatus(id, status) {
  try { await api('admin/puzzle/status', { id, status }); toast(status === 'approved' ? 'Approved' : 'Updated'); go('summit/cal'); }
  catch (e) { toast(e.message); }
}

function editor(p) {
  const known = !p.property || PROPS[p.property];
  const props = Object.keys(PROPS);
  openModal(`<h2>${p.id ? 'Edit puzzle' : 'New puzzle'}</h2>
    <div class="form">
      <label>Date (UTC)<input type="date" class="box" id="eDate" value="${esc(p.date || '')}"></label>
      <label>Stage<select class="box" id="eSlot">${ROOMS.map(r => `<option value="${r.slot}" ${r.slot === p.slot ? 'selected' : ''}>${r.emoji} ${r.name} (${r.tier})</option>`).join('')}</select></label>
      <label>Status<select class="box" id="eStatus">${['approved', 'draft', 'rejected'].concat(p.status === 'auto' ? ['auto'] : []).map(s => `<option ${s === (p.status || 'approved') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Property<select class="box" id="eProp">${props.map(k => `<option value="${k}" ${k === p.property ? 'selected' : ''}>${esc(PROPS[k].label)} (${esc(PROPS[k].unit)})</option>`).join('')}<option value="__custom" ${known ? '' : 'selected'}>custom…</option></select></label>
      <label class="cust" ${known ? 'hidden' : ''}>Custom property<input class="box" id="eCustom" value="${known ? '' : esc(p.property)}" placeholder="e.g. number of moons"></label>
      <label class="cust" ${known ? 'hidden' : ''}>Unit<input class="box" id="eUnit" value="${esc(p.unitLabel || '')}" placeholder="e.g. moons"></label>
      <label>Too small item<input class="box" id="eSmall" value="${esc(p.smallItem || '')}" placeholder="an adult house cat"></label>
      <label>Value <span class="bu"></span><input class="box" id="eSV" type="number" step="any" value="${p.smallValue ?? ''}"></label>
      <label>Too big item<input class="box" id="eBig" value="${esc(p.bigItem || '')}" placeholder="a blue whale"></label>
      <label>Value <span class="bu"></span><input class="box" id="eBV" type="number" step="any" value="${p.bigValue ?? ''}"></label>
      <label class="full">Note (admin only)<input class="box" id="eNote" value="${esc(p.note || '')}"></label>
    </div>
    <p class="sub" id="ePrev"></p>
    ${p.plays ? `<div class="note warn">${p.plays} people already played this. Changing values rescores them.</div>` : ''}
    <div class="row"><button class="btn" id="eSave">Save</button><button class="btn alt" id="eCancel">Cancel</button></div>`);
  const custom = () => $('#eProp').value === '__custom';
  const prop = () => custom() ? $('#eCustom').value.trim().toLowerCase() : $('#eProp').value;
  const upd = () => {
    document.querySelectorAll('#modalBody .cust').forEach(x => x.hidden = !custom());
    document.querySelectorAll('#modalBody .bu').forEach(x => x.textContent = `(${custom() ? ($('#eUnit').value || 'unit') : PROPS[$('#eProp').value].unit})`);
    const a = Number($('#eSV').value), b = Number($('#eBV').value), u = $('#eUnit').value;
    $('#ePrev').textContent = a > 0 && b > 0
      ? `Too small ≈ ${show(prop(), Math.min(a, b), u)} · too big ≈ ${show(prop(), Math.max(a, b), u)} · just right ≈ ${show(prop(), Math.sqrt(a * b), u)} · ratio ${nice(Math.max(a, b) / Math.min(a, b))}×`
      : 'Values go in the base unit shown. Ratio must be at least 20×.';
  };
  document.querySelectorAll('#modalBody input, #modalBody select').forEach(x => x.addEventListener('input', upd));
  upd();
  $('#eCancel').onclick = closeModal;
  $('#eSave').onclick = async () => {
    const body = {
      id: p.id, date: $('#eDate').value, slot: Number($('#eSlot').value), status: $('#eStatus').value, property: prop(),
      unitLabel: custom() ? $('#eUnit').value.trim() : '', smallItem: $('#eSmall').value, smallValue: Number($('#eSV').value),
      bigItem: $('#eBig').value, bigValue: Number($('#eBV').value), note: $('#eNote').value
    };
    $('#eSave').disabled = true;
    try { await api('admin/puzzle', body); closeModal(); toast('Saved'); go('summit/cal'); }
    catch (e) { toast(e.message); $('#eSave').disabled = false; }
  };
}

/* ═══════════ Summit: complaints ═══════════ */
async function comp(box, status = 'open') {
  const d = await api('admin/complaints?status=' + status);
  if (status === 'open') $('#sumN').textContent = d.complaints.length ? `(${d.complaints.length})` : '';
  box.innerHTML = `<div class="row" style="margin:0 0 12px">${['open', 'accepted', 'rejected'].map(s => `<button class="tbtn ${s === status ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
    ${d.complaints.map(c => `<section class="card" style="margin-bottom:14px">
      <div class="kicker"><span>${room(c.slot).emoji} ${esc(c.date)} · ${esc(propLabel(c.property))}</span><span>${esc(c.created_at.slice(0, 16).replace('T', ' '))}</span></div>
      <p style="margin:8px 0 4px">Puzzle: <b>${esc(c.small_item)}</b> (${esc(show(c.property, c.small_value, c.unit_label))}) ↔ <b>${esc(c.big_item)}</b> (${esc(show(c.property, c.big_value, c.unit_label))})</p>
      <p style="margin:4px 0">Player said <b>“${esc(c.input)}”</b> → judged as <b>${esc(c.name)}</b> = ${esc(show(c.property, c.value, c.unit_label))} <span class="sub">(${c.value} base · guess #${c.attempt} · scored ${c.score} · used ${c.uses}× total)</span></p>
      ${c.note ? `<div class="note warn" style="margin:8px 0">“${esc(c.note)}”</div>` : '<p class="sub">No note.</p>'}
      ${status === 'open' ? `<div class="form" style="margin-top:10px">
        <label>Corrected name<input class="box" data-n="${c.id}" value="${esc(c.name)}"></label>
        <label>Corrected value (${esc(PROPS[c.property] ? PROPS[c.property].unit : c.unit_label)})<input class="box" type="number" step="any" data-v="${c.id}" value="${c.value}"></label>
        <label class="full">Note to player (optional)<input class="box" data-a="${c.id}"></label></div>
        <div class="row"><button class="btn sm green" data-accept="${c.id}">Accept, fix &amp; rescore</button><button class="btn sm alt" data-reject="${c.id}">Reject</button></div>`
        : `<p class="sub">Resolved ${esc((c.resolved_at || '').slice(0, 16).replace('T', ' '))}${c.admin_note ? ' · ' + esc(c.admin_note) : ''}</p>`}
    </section>`).join('') || '<div class="card"><p class="empty">Nothing here. The judge is doing great.</p></div>'}`;
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => comp(box, b.dataset.s));
  const resolve = async (id, accept) => {
    try {
      const r = await api('admin/complaints/resolve', {
        id, accept,
        name: accept ? box.querySelector(`[data-n="${id}"]`).value : '',
        value: accept ? box.querySelector(`[data-v="${id}"]`).value : '',
        adminNote: box.querySelector(`[data-a="${id}"]`).value
      });
      toast(accept ? `Accepted · ${r.rescored} guesses rescored` : 'Rejected'); comp(box, 'open');
    } catch (e) { toast(e.message); }
  };
  box.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => resolve(Number(b.dataset.accept), true));
  box.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => resolve(Number(b.dataset.reject), false));
}

/* ═══════════ Summit: answers ═══════════ */
async function ans(box, q = '', pending = false) {
  const d = await api(`admin/answers?q=${encodeURIComponent(q)}${pending ? '&pending=1' : ''}`);
  box.innerHTML = `<section class="card">
    <p class="sub" style="margin-top:0">Every answer the judge has seen. Fix a value and every guess that used it is rescored. Only answers given by 2+ players, or <b>approved</b> here, show up in public top answers.</p>
    <div class="row" style="margin-top:8px"><input class="box" id="aq" style="flex:1;min-width:160px" placeholder="Search (e.g. horse)" value="${esc(q)}">
      <button class="btn sm alt" id="ago">Search</button>
      <button class="tbtn ${pending ? 'on' : ''}" id="apend">Needs approval</button></div>
    <div class="tbl" style="margin-top:12px"><table><thead><tr><th>Answer</th><th>Property</th><th>Status</th><th>Judged as</th><th>Value (base)</th><th>Shows as</th><th>Public</th><th>Flag</th><th>Uses</th><th></th></tr></thead>
    <tbody>${d.answers.map((a, i) => `<tr>
      <td>${esc(a.norm)}${a.key.endsWith('|avg') ? ' <span class="sub">avg</span>' : ''}</td><td>${esc(propLabel(a.property))}</td>
      <td><select data-s="${i}">${['ok', 'vague', 'invalid'].map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><input data-n="${i}" value="${esc(a.name)}"></td><td><input data-v="${i}" type="number" step="any" value="${a.value}" style="width:120px"></td>
      <td class="sub">${a.value > 0 ? esc(show(a.property, a.value, '')) : '–'}</td>
      <td><input type="checkbox" data-p="${i}" ${a.approved ? 'checked' : ''}></td><td><input type="checkbox" data-f="${i}" ${a.flagged ? 'checked' : ''}></td>
      <td>${a.uses ?? a.players ?? 0}</td>
      <td style="white-space:nowrap"><button class="mini-btn" data-save="${i}">Save</button> <button class="mini-btn danger" data-del="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">Nothing found.</td></tr>'}</tbody></table></div></section>`;
  $('#ago').onclick = () => ans(box, $('#aq').value, false);
  $('#aq').onkeydown = e => { if (e.key === 'Enter') ans(box, $('#aq').value, false); };
  $('#apend').onclick = () => ans(box, '', !pending);
  box.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const i = b.dataset.save, a = d.answers[i];
    try {
      const r = await api('admin/answers', {
        key: a.key, status: box.querySelector(`[data-s="${i}"]`).value, name: box.querySelector(`[data-n="${i}"]`).value,
        value: Number(box.querySelector(`[data-v="${i}"]`).value), approved: box.querySelector(`[data-p="${i}"]`).checked,
        flagged: box.querySelector(`[data-f="${i}"]`).checked
      });
      toast(r.rescored ? `Saved · ${r.rescored} guesses rescored` : 'Saved'); ans(box, q, pending);
    } catch (e) { toast(e.message); }
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const a = d.answers[b.dataset.del];
    if (!confirm(`Delete the cached value for “${a.norm}”? The judge will rethink it next time.`)) return;
    try { await api('admin/answers/delete', { key: a.key }); toast('Deleted'); ans(box, q, pending); } catch (e) { toast(e.message); }
  });
}


/* ═══════════ Venn: calendar ═══════════ */
const VENN_COLORS = ['#f2c230', '#3b82d6', '#d9412b'];
const circlesHTML = cs => cs.map((c, i) => `<span class="vc"><i style="background:${VENN_COLORS[i]}"></i>${esc(c)}</span>`).join('');
let vennAll = [];

async function vennCal(box) {
  const d = await api(`admin/venn/calendar?from=${addDays(today(), -14)}&to=${addDays(today(), 30)}`);
  vennAll = d.puzzles;
  const dates = [];
  for (let i = -14; i <= 30; i++) dates.push(addDays(d.today, i));
  const cell = (date, round) => {
    const list = d.puzzles.filter(p => p.date === date && p.round === round);
    const live = list.find(p => p.status === 'approved' || p.status === 'auto');
    const drafts = list.filter(p => p.status === 'draft');
    const p = live || drafts[drafts.length - 1];
    const genBtn = `<button class="mini-btn" data-vgen="${date}|${round}" title="Ask the AI for a new draft for this round">Generate</button>`;
    if (!p) {
      const rejected = list.filter(x => x.status === 'rejected').length;
      return `<td><span class="st empty">empty</span>${rejected ? ` <span class="sub">${rejected} rejected</span>` : ''}
        <div class="row" style="margin-top:6px;gap:4px">${genBtn}<button class="mini-btn" data-vnew="${date}|${round}">+ Write one</button>
        ${list.length ? `<button class="mini-btn" data-vall="${date}|${round}">All (${list.length})</button>` : ''}</div></td>`;
    }
    return `<td><span class="st ${p.status}">${p.status}</span>${drafts.length > (live ? 0 : 1) ? ` <span class="sub">+${drafts.length - (live ? 0 : 1)} draft</span>` : ''}
      <div class="vcs">${circlesHTML(p.circles)}</div>
      <div class="sub">Par <b>${p.par}</b> · typical ${p.typical} · ${p.answers.length} answers${p.plays ? ` · <b>${p.plays} plays</b>` : ''}</div>
      <div class="row" style="margin-top:6px;gap:4px">
        ${p.status === 'draft' ? `<button class="mini-btn ok" data-vapprove="${p.id}">Approve</button>` : ''}
        <button class="mini-btn" data-vedit="${p.id}">Edit</button>
        <button class="mini-btn" data-vjudg="${p.id}">Judgments</button>
        ${!p.plays ? genBtn : ''}
        ${list.length > 1 ? `<button class="mini-btn" data-vall="${date}|${round}">All (${list.length})</button>` : ''}
        ${!p.plays && p.status !== 'rejected' ? `<button class="mini-btn danger" data-vreject="${p.id}">Reject</button>` : ''}
      </div></td>`;
  };
  box.innerHTML = `
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Generate Venn drafts</h2>
      <p class="sub">The AI writes a two-circle round 1 and a three-circle round 2 for each day with an empty round, one at a time (about 5–10 seconds each). Every draft has to keep at least 25 well-known answers (8 for round 2) after a strict review; if the AI is busy or nothing passes, the draft comes from the built-in bank instead. Par = 60% of the AI's “typical” count (min 3 / 2). Days with nothing approved use their draft; with no draft the AI makes one on the spot, then the built-in bank.</p>
      <div class="row"><label class="sub">From <input type="date" id="vgFrom" class="box" style="width:auto" value="${addDays(d.today, 1)}"></label>
        <label class="sub">Days <select id="vgDays" class="box" style="width:auto">${[1, 3, 5, 7].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn sm" id="vgGo">Generate</button></div>
    </section>
    <section class="card"><div class="tbl"><table>
      <thead><tr><th>Date</th><th>Round 1 · two circles</th><th>Round 2 · three circles</th></tr></thead>
      <tbody>${dates.map(dt => `<tr class="${dt === d.today ? 'today' : ''}"><td><b>${dt.slice(5)}</b>${dt === d.today ? '<br><span class="badge">today</span>' : ''}</td>${[1, 2].map(r => cell(dt, r)).join('')}</tr>`).join('')}</tbody>
    </table></div></section>`;

  // One round per request, so each wait is short and progress shows as it goes.
  $('#vgGo').onclick = async () => {
    const from = $('#vgFrom').value, days = Number($('#vgDays').value), b = $('#vgGo');
    const jobs = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      [1, 2].forEach(round => { if (!vennAll.some(p => p.date === date && p.round === round && ['approved', 'auto', 'draft'].includes(p.status))) jobs.push({ date, round }); });
    }
    if (!jobs.length) return toast('Those days already have puzzles.');
    b.disabled = true;
    let made = 0, bank = 0, failed = 0;
    for (const [i, j] of jobs.entries()) {
      b.textContent = `Writing ${i + 1} of ${jobs.length}…`;
      try { const r = await api('admin/venn/generate', j); made++; bank += r.fromBank; } catch (e) { failed++; toast(e.message); }
    }
    toast(`Made ${made} ${made === 1 ? 'draft' : 'drafts'}${bank ? ` (${bank} from the built-in bank because the AI was busy)` : ''}${failed ? `. ${failed} failed.` : ''}`);
    go('venn');
  };
  box.querySelectorAll('[data-vgen]').forEach(b => b.onclick = async () => {
    const [date, round] = b.dataset.vgen.split('|');
    b.disabled = true; b.textContent = 'Writing…';
    try { const r = await api('admin/venn/generate', { date, round: Number(round) }); toast(`${r.fromBank ? 'AI busy, used the bank: ' : 'New draft: '}${r.puzzle.circles.join(' + ')}`); go('venn'); }
    catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Generate'; }
  });
  box.querySelectorAll('[data-vapprove]').forEach(b => b.onclick = () => vennStatus(Number(b.dataset.vapprove), 'approved'));
  box.querySelectorAll('[data-vreject]').forEach(b => b.onclick = () => { if (confirm('Reject this puzzle?')) vennStatus(Number(b.dataset.vreject), 'rejected'); });
  box.querySelectorAll('[data-vedit]').forEach(b => b.onclick = () => vennEditor(vennAll.find(p => p.id === Number(b.dataset.vedit))));
  box.querySelectorAll('[data-vjudg]').forEach(b => b.onclick = () => { vennJudgPuzzle = Number(b.dataset.vjudg); go('venn/judg'); });
  box.querySelectorAll('[data-vnew]').forEach(b => { const [date, round] = b.dataset.vnew.split('|'); b.onclick = () => vennEditor({ date, round: Number(round), status: 'approved', circles: [], answers: [], par: '', typical: '' }); });
  box.querySelectorAll('[data-vall]').forEach(b => {
    const [date, round] = b.dataset.vall.split('|');
    b.onclick = () => {
      const list = vennAll.filter(p => p.date === date && p.round === Number(round));
      openModal(`<h2>${date} · Round ${round}</h2>${list.map(p => `<div class="fact" style="grid-template-columns:auto 1fr auto">
        <span class="st ${p.status}">${p.status}</span><div class="w"><div class="vcs">${circlesHTML(p.circles)}</div><small>Par ${p.par} · ${p.plays} plays · ${esc(p.note)}</small></div>
        <div style="display:flex;gap:4px;flex-direction:column">${p.status === 'draft' ? `<button class="mini-btn ok" data-ap="${p.id}">Approve</button>` : ''}<button class="mini-btn" data-ed="${p.id}">Edit</button>
        ${!p.plays ? `<button class="mini-btn danger" data-del="${p.id}">Delete</button>` : ''}</div></div>`).join('')}`);
      $('#modalBody').querySelectorAll('[data-ap]').forEach(x => x.onclick = () => { closeModal(); vennStatus(Number(x.dataset.ap), 'approved'); });
      $('#modalBody').querySelectorAll('[data-ed]').forEach(x => x.onclick = () => vennEditor(vennAll.find(p => p.id === Number(x.dataset.ed))));
      $('#modalBody').querySelectorAll('[data-del]').forEach(x => x.onclick = async () => {
        if (!confirm('Delete this puzzle for good?')) return;
        try { await api('admin/venn/puzzle/delete', { id: Number(x.dataset.del) }); closeModal(); toast('Deleted'); go('venn'); } catch (e) { toast(e.message); }
      });
    };
  });
}

async function vennStatus(id, status) {
  const p = vennAll.find(x => x.id === id);
  try { await api('admin/venn/puzzle', { ...p, status }); toast(status === 'approved' ? 'Approved' : 'Updated'); go('venn'); }
  catch (e) { toast(e.message); }
}

function vennEditor(p) {
  const n = () => (Number($('#veRound').value) === 2 ? 3 : 2);
  openModal(`<h2>${p.id ? 'Edit Venn puzzle' : 'New Venn puzzle'}</h2>
    <div class="form">
      <label>Date (UTC)<input type="date" class="box" id="veDate" value="${esc(p.date || '')}"></label>
      <label>Round<select class="box" id="veRound">${[1, 2].map(r => `<option value="${r}" ${r === p.round ? 'selected' : ''}>Round ${r} (${r === 2 ? 'three' : 'two'} circles)</option>`).join('')}</select></label>
      <label>Status<select class="box" id="veStatus">${['approved', 'draft', 'rejected'].concat(p.status === 'auto' ? ['auto'] : []).map(s => `<option ${s === (p.status || 'approved') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Par (shown to players)<input class="box" id="vePar" type="number" min="1" step="1" value="${esc(p.par)}"></label>
      <div class="full" id="veCircles"></div>
      <label>Typical (AI's 90-second estimate)<input class="box" id="veTyp" type="number" min="0" step="1" value="${esc(p.typical)}"></label>
      <label class="full">Known answers, one per line (never shown before the round ends)<textarea class="box" id="veAns" style="min-height:140px">${esc((p.answers || []).join('\n'))}</textarea></label>
      <label class="full">Note (admin only)<input class="box" id="veNote" value="${esc(p.note || '')}"></label>
    </div>
    ${p.plays ? `<div class="note warn">${p.plays} people already played this. Its categories are locked; changing par rescores them.</div>` : ''}
    <div class="row"><button class="btn" id="veSave">Save</button><button class="btn alt" id="veCancel">Cancel</button></div>`);
  const drawCircles = () => {
    const have = [...document.querySelectorAll('#veCircles input')].map(i => i.value);
    const cs = have.length ? have : (p.circles || []);
    $('#veCircles').innerHTML = Array.from({ length: n() }, (_, i) => `<label>Circle ${'ABC'[i]} (${['yellow', 'blue', 'red'][i]})<input class="box" data-c="${i}" value="${esc(cs[i] || '')}" placeholder="${['Things colored orange', 'Foods people eat', 'Grown in Spain'][i]}" ${p.plays ? 'disabled' : ''}></label>`).join('');
  };
  drawCircles();
  $('#veRound').onchange = drawCircles;
  $('#veTyp').oninput = () => { if (!p.par) $('#vePar').value = Math.max(Number($('#veRound').value) === 2 ? 2 : 3, Math.floor(.6 * Number($('#veTyp').value || 0))); };
  $('#veCancel').onclick = closeModal;
  $('#veSave').onclick = async () => {
    const body = {
      id: p.id, date: $('#veDate').value, round: Number($('#veRound').value), status: $('#veStatus').value,
      circles: [...document.querySelectorAll('#veCircles input')].map(i => i.value), par: Number($('#vePar').value), typical: Number($('#veTyp').value),
      answers: $('#veAns').value.split('\n').map(s => s.trim()).filter(Boolean), note: $('#veNote').value
    };
    $('#veSave').disabled = true;
    try { const r = await api('admin/venn/puzzle', body); closeModal(); toast(r.warning ? 'Saved. ' + r.warning : 'Saved'); go('venn'); }
    catch (e) { toast(e.message); $('#veSave').disabled = false; }
  };
}

/* ═══════════ Venn: complaints ═══════════ */
async function vennComp(box, status = 'open') {
  const d = await api('admin/venn/complaints?status=' + status);
  if (status === 'open') $('#vennN').textContent = d.complaints.length ? `(${d.complaints.length})` : '';
  box.innerHTML = `<div class="row" style="margin:0 0 12px">${['open', 'accepted', 'rejected'].map(s => `<button class="tbtn ${s === status ? 'on' : ''}" data-st="${s}">${s}</button>`).join('')}</div>
    ${d.complaints.map(c => `<section class="card" style="margin-bottom:14px">
      <div class="kicker"><span>${esc(c.date || 'unlimited')} · Round ${c.round}</span><span>${esc(c.created_at.slice(0, 16).replace('T', ' '))}</span></div>
      <div class="vcs" style="margin:8px 0">${circlesHTML(c.circles)}</div>
      <p style="margin:4px 0">Player said <b>“${esc(c.input)}”</b> → ${c.canonical ? `judged as <b>${esc(c.canonical)}</b>` : 'not recognized'} · fits ${c.fits.map((f, i) => `${'ABC'[i]} ${f ? '✓' : '✗'}`).join(' ') || '–'}
        <span class="sub">(${esc(c.reason || 'no reason')} · given ${c.uses}× on this puzzle)</span></p>
      ${c.note ? `<div class="note warn" style="margin:8px 0">“${esc(c.note)}”</div>` : '<p class="sub">No note.</p>'}
      ${status === 'open' ? `<div class="form" style="margin-top:10px">
        <label>Count it as<input class="box" data-n="${c.id}" value="${esc(c.canonical || c.input)}"></label>
        <label>Note to player (optional)<input class="box" data-a="${c.id}"></label></div>
        <div class="row"><button class="btn sm green" data-accept="${c.id}">Accept: count it &amp; rescore</button><button class="btn sm alt" data-reject="${c.id}">Reject</button></div>`
        : `<p class="sub">Resolved ${esc((c.resolved_at || '').slice(0, 16).replace('T', ' '))}${c.admin_note ? ' · ' + esc(c.admin_note) : ''}</p>`}
    </section>`).join('') || '<div class="card"><p class="empty">Nothing here.</p></div>'}`;
  box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => vennComp(box, b.dataset.st));
  const resolve = async (id, accept) => {
    try {
      const r = await api('admin/venn/complaints/resolve', { id, accept, canonical: accept ? box.querySelector(`[data-n="${id}"]`).value : '', adminNote: box.querySelector(`[data-a="${id}"]`).value });
      toast(accept ? `Accepted · ${r.rescored} plays rescored` : 'Rejected'); vennComp(box, 'open');
    } catch (e) { toast(e.message); }
  };
  box.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => resolve(Number(b.dataset.accept), true));
  box.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => resolve(Number(b.dataset.reject), false));
}

/* ═══════════ Venn: judgment cache ═══════════ */
let vennJudgPuzzle = null;
async function vennJudg(box, q = '') {
  const d = await api(`admin/venn/judgments?q=${encodeURIComponent(q)}${vennJudgPuzzle ? '&puzzle=' + vennJudgPuzzle : ''}`);
  box.innerHTML = `<section class="card">
    <p class="sub" style="margin-top:0">Every answer the judge has seen, per puzzle. The same answer always gets the same verdict, and your edits always win over the AI. Saving rescores every play that used it.</p>
    <div class="row" style="margin-top:8px"><input class="box" id="jq" style="flex:1;min-width:160px" placeholder="Search answers" value="${esc(q)}">
      <input class="box" id="jp" type="number" style="width:130px" placeholder="Puzzle id" value="${vennJudgPuzzle || ''}">
      <button class="btn sm alt" id="jgo">Search</button></div>
    ${vennJudgPuzzle ? `<form class="row" id="jadd" style="margin-top:8px"><input class="box" name="input" style="flex:1;min-width:140px" placeholder="Add an answer for puzzle ${vennJudgPuzzle}">
      <label class="sub"><input type="checkbox" name="all" checked> fits every circle</label><button class="mini-btn ok" type="submit">Add</button></form>` : ''}
    <div class="tbl" style="margin-top:12px"><table><thead><tr><th>Puzzle</th><th>Answer</th><th>Counts as</th><th>Fits</th><th>Reason</th><th>Flags</th><th>By</th><th>Uses</th><th></th></tr></thead>
    <tbody>${d.judgments.map((j, i) => `<tr>
      <td class="sub">#${j.puzzle_id} · ${esc(j.date || '∞')} · R${j.round}</td><td>${esc(j.norm)}${j.suggestion ? `<br><span class="sub">→ ${esc(j.suggestion)}?</span>` : ''}</td>
      <td><input data-c="${i}" value="${esc(j.canonical)}" placeholder="(not recognized)"></td>
      <td style="white-space:nowrap">${j.circles.map((c, k) => `<label title="${esc(c)}" class="fitbox"><i style="background:${VENN_COLORS[k]}"></i><input type="checkbox" data-f="${i}|${k}" ${j.fits[k] ? 'checked' : ''}></label>`).join('')}</td>
      <td><input data-r="${i}" value="${esc(j.reason)}"></td>
      <td style="white-space:nowrap"><label class="sub"><input type="checkbox" data-o="${i}" ${j.offensive ? 'checked' : ''}> rude</label><br><label class="sub"><input type="checkbox" data-x="${i}" ${j.fictional ? 'checked' : ''}> fictional</label></td>
      <td class="sub">${esc(j.source)}</td><td>${j.uses}</td>
      <td style="white-space:nowrap"><button class="mini-btn" data-save="${i}">Save</button> ${j.uses ? '' : `<button class="mini-btn danger" data-del="${i}">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nothing yet.</td></tr>'}</tbody></table></div></section>`;
  const run = () => { vennJudgPuzzle = Number($('#jp').value) || null; vennJudg(box, $('#jq').value); };
  $('#jgo').onclick = run;
  $('#jq').onkeydown = e => { if (e.key === 'Enter') run(); };
  const add = $('#jadd');
  if (add) add.onsubmit = async e => {
    e.preventDefault();
    const z = vennAll.find(p => p.id === vennJudgPuzzle);
    const n = z ? z.circles.length : 3;
    try {
      const r = await api('admin/venn/judgments', { puzzleId: vennJudgPuzzle, input: add.input.value, canonical: add.input.value, fits: Array.from({ length: n }, () => add.all.checked) });
      toast(r.rescored ? `Added · ${r.rescored} plays rescored` : 'Added'); vennJudg(box, q);
    } catch (err) { toast(err.message); }
  };
  box.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const i = b.dataset.save, j = d.judgments[i];
    try {
      const r = await api('admin/venn/judgments', {
        puzzleId: j.puzzle_id, norm: j.norm, canonical: box.querySelector(`[data-c="${i}"]`).value, reason: box.querySelector(`[data-r="${i}"]`).value,
        fits: j.circles.map((_, k) => box.querySelector(`[data-f="${i}|${k}"]`).checked),
        offensive: box.querySelector(`[data-o="${i}"]`).checked, fictional: box.querySelector(`[data-x="${i}"]`).checked, suggestion: j.suggestion
      });
      toast(r.rescored ? `Saved · ${r.rescored} plays rescored` : 'Saved'); vennJudg(box, q);
    } catch (e) { toast(e.message); }
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const j = d.judgments[b.dataset.del];
    if (!confirm(`Forget the verdict for “${j.norm}”? The judge will decide again next time.`)) return;
    try { await api('admin/venn/judgments/delete', { puzzleId: j.puzzle_id, norm: j.norm }); toast('Deleted'); vennJudg(box, q); } catch (e) { toast(e.message); }
  });
}

/* ═══════════ Polly ═══════════ */
const TOPICS = ['life', 'beliefs', 'money', 'politics'];
const TOPIC_NAMES = { life: 'Everyday life', beliefs: 'Beliefs and society', money: 'Money and work', politics: 'Politics' };
const ENTRY_NAMES = { 'auto-checked': 'auto-checked', 'admin-pasted': 'admin-pasted', 'admin-entered': 'admin-entered' };
const pSplit = q => q.real == null ? '–' : `${q.real}/${100 - q.real}`;
const niceDay = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const rescaleNow = (l, r) => (Number(l) + Number(r) > 0 && l !== '' && r !== '' ? Math.round(100 * Number(l) / (Number(l) + Number(r))) : '');
let pollySources = [];

async function loadPollySources() {
  if (!pollySources.length) pollySources = (await api('admin/polly/sources')).sources;
  return pollySources;
}
const badge = (t, cls = '') => `<span class="st ${cls}">${esc(t)}</span>`;
const entryBadge = e => badge(ENTRY_NAMES[e] || e, e === 'auto-checked' ? 'approved' : e === 'admin-pasted' ? 'auto' : 'draft');

function bankLowNote(b) {
  return b.low ? `<div class="note warn" style="margin-top:10px">Bank low: ${b.fresh} approved, never-run ${b.fresh === 1 ? 'question' : 'questions'} left (${b.days} ${b.days === 1 ? 'day' : 'days'}). Add more, or let <a href="#polly/auto">Auto-find</a> fetch them.</div>` : '';
}

/** Every editable field of a question. Fields are read back with readQ(). */
function qFields(q, sources, { compact = false } = {}) {
  const v = k => esc(q[k] == null ? '' : q[k]);
  const need = (k, extra = '') => (q[k] == null || q[k] === '' ? ' style="border-color:var(--bad)"' : extra);
  return `<div class="form pq">
    <label class="full">Short question (≤ 90, shown big)<input class="box" data-f="short" maxlength="90" value="${v('short')}"></label>
    <label>Left label (orange, ≤ 14)<input class="box" data-f="left_label" maxlength="14" value="${v('left_label')}"></label>
    <label>Right label (teal, ≤ 14)<input class="box" data-f="right_label" maxlength="14" value="${v('right_label')}"></label>
    <label>Left raw %<input class="box" data-f="left_raw" type="number" step="0.1" value="${v('left_raw')}"></label>
    <label>Right raw %<input class="box" data-f="right_raw" type="number" step="0.1" value="${v('right_raw')}"></label>
    <label>Unsure raw % (optional)<input class="box" data-f="unsure_raw" type="number" step="0.1" value="${v('unsure_raw')}"></label>
    <label>Real (left share, rescaled)<input class="box" data-real disabled value="${esc(rescaleNow(q.left_raw ?? '', q.right_raw ?? ''))}"></label>
    <label class="full">Exact poll wording<textarea class="box" data-f="original_wording" style="min-height:60px">${v('original_wording')}</textarea></label>
    <label>Source<select class="box" data-f="source_id">${sources.map(s => `<option value="${s.id}" ${s.id === Number(q.source_id) ? 'selected' : ''}>${esc(s.name)}${s.active ? '' : ' (off)'}</option>`).join('')}</select></label>
    <label>URL<input class="box" data-f="url" value="${v('url')}"></label>
    <label>Poll end date (exact day)<input class="box" data-f="poll_end_date" type="date" value="${v('poll_end_date')}"${need('poll_end_date')}></label>
    <label>Sample size<input class="box" data-f="sample_size" type="number" step="1" min="1" value="${v('sample_size')}"${need('sample_size')}></label>
    <label>Topic (not shown to players)<select class="box" data-f="topic">${TOPICS.map(t => `<option value="${t}" ${t === q.topic ? 'selected' : ''}>${TOPIC_NAMES[t]}</option>`).join('')}</select></label>
    <label>Time-sensitive<span style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-f="time_sensitive" ${q.time_sensitive ? 'checked' : ''}><input class="box" data-f="ts_reason" placeholder="why (one line)" value="${v('ts_reason')}"></span></label>
    ${compact ? '' : `<label class="full">Evidence (the exact text with the numbers)<textarea class="box" data-f="evidence" style="min-height:50px">${v('evidence')}</textarea></label>`}
  </div>`;
}
function readQ(el) {
  const out = {};
  el.querySelectorAll('[data-f]').forEach(i => {
    const k = i.dataset.f;
    if (i.type === 'checkbox') out[k] = i.checked;
    else if (['left_raw', 'right_raw', 'unsure_raw', 'sample_size', 'source_id'].includes(k)) out[k] = i.value === '' ? null : Number(i.value);
    else out[k] = i.value.trim();
  });
  return out;
}
function wireReal(el) {
  const upd = () => { const f = readQ(el); const r = el.querySelector('[data-real]'); if (r) r.value = rescaleNow(f.left_raw ?? '', f.right_raw ?? ''); };
  el.querySelectorAll('[data-f="left_raw"], [data-f="right_raw"]').forEach(i => { i.oninput = upd; });
}

/* ── Dashboard ── */
async function pollyDash(box) {
  const d = await api('admin/polly/dashboard');
  $('#pollyN').textContent = d.openReports ? `(${d.openReports})` : '';
  box.innerHTML = `<section class="card"><div class="kicker"><span>Polly #${d.number} · ${d.date} (UTC)</span></div>
      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><b>${d.players}</b><span>Players today</span></div>
        <div class="kpi"><b>${d.bank.fresh}</b><span>Never-run approved (${d.bank.days} days)</span></div>
        <div class="kpi"><b>${d.bank.unscheduled}</b><span>In the bank, unscheduled</span></div>
        <div class="kpi"><b>${d.openReports}</b><span>Open reports</span></div>
      </div>
      ${bankLowNote(d.bank)}
      <div class="section-title">Today's questions</div>
      <div class="tbl"><table><thead><tr><th>#</th><th>Question</th><th>Real</th><th>Answers</th><th>Avg score</th><th>Avg miss</th></tr></thead>
      <tbody>${d.slots.map(s => `<tr><td>${s.slot}</td><td>${esc(s.short)}<br><span class="sub">${esc(s.left_label)} / ${esc(s.right_label)}</span></td><td>${s.real}%</td>
        <td>${s.plays}</td><td>${s.avg == null ? '–' : Math.round(s.avg)}</td><td>${s.miss == null ? '–' : (Math.round(s.miss * 10) / 10)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No poll today. Approve questions and the calendar fills itself.</td></tr>'}</tbody></table></div>
      ${d.stale.length ? `<div class="section-title">STALE warnings</div>${d.stale.map(s => `<p class="sub">${badge('STALE', 'rejected')} ${esc(s.date)} · Q${s.slot}: ${esc(s.short)} <i>(${esc(s.why)})</i></p>`).join('')}` : ''}
    </section>`;
}

/* ── Auto-find ── */
const ago = s => { if (!s) return 'never'; const m = Math.round((Date.now() - Date.parse(s)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
async function pollyAutoTab(box, data) {
  const d = data || await api('admin/polly/auto');
  const c = d.counts || {};
  const pageRow = p => `<tr><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title || p.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70))}</a><br><span class="sub">${esc(p.published || '')}${p.note ? ' · ' + esc(p.note) : ''}</span></td>
    <td><span class="st ${p.status === 'done' ? 'approved' : p.status === 'queued' ? 'auto' : p.status === 'failed' ? 'rejected' : 'draft'}">${esc(p.status)}</span></td>
    <td>${p.added || 0}</td><td>${p.drafted || 0}</td><td>${p.failed || 0}</td></tr>`;
  box.innerHTML = `<section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Find polls automatically</h2>
      <p class="sub">Polly reads the pollsters' feeds below, queues their new report pages, and runs each page through the same check as a pasted URL (the AI reads only that page; the server finds every number on it). It does this on its own every few hours while the bank is low, whenever someone opens Polly, or right now with the button.</p>
      <label class="row" style="gap:8px"><input type="checkbox" id="auAuto" ${d.autoApprove ? 'checked' : ''}>
        <span><b>Approve the sure ones on their own.</b> <span class="sub">Only when the numbers, the poll date and the sample size were all found on the page, it fits the length limits, and it isn't time-sensitive. Everything else waits in the bank as a draft.</span></span></label>
      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><b>${d.bank.fresh}</b><span>Never-run approved (${d.bank.days} ${d.bank.days === 1 ? 'day' : 'days'})</span></div>
        <div class="kpi"><b>${c.queued || 0}</b><span>Pages waiting</span></div>
        <div class="kpi"><b>${c.done || 0}</b><span>Pages read</span></div>
        <div class="kpi"><b>${ago(d.lastRun)}</b><span>Last run</span></div>
      </div>
      <div class="row"><button class="btn" id="auRun">Find polls now</button><label class="sub"><input type="checkbox" id="auForce"> re-read the feeds too</label></div>
      <div id="auOut"></div>
    </section>
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Paste many links</h2>
      <p class="sub">One or more poll page URLs (one per line). They're queued and read by "Find polls now" or the next automatic run.</p>
      <textarea class="box" id="auUrls" style="min-height:90px" placeholder="https://www.pewresearch.org/…&#10;https://news.gallup.com/poll/…"></textarea>
      <div class="row"><button class="btn sm" id="auQueue">Queue them</button></div>
    </section>
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Feeds</h2>
      <p class="sub">RSS / Atom feeds or sitemaps that list each pollster's new reports. Only pages on the source's own site are taken.</p>
      <div class="tbl"><table><thead><tr><th>Source</th><th>Feed</th><th>On</th><th>Last read</th><th></th></tr></thead>
      <tbody>${d.feeds.map(f => `<tr><td>${esc(f.source || '?')}</td><td><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.url)}</a> <span class="sub">${esc(f.kind)}</span>${f.last_error ? `<br><span class="sub" style="color:var(--bad)">${esc(f.last_error)}</span>` : ''}</td>
        <td><input type="checkbox" data-fon="${f.id}" ${f.active ? 'checked' : ''}></td><td class="sub">${ago(f.last_checked)}</td><td><button class="mini-btn danger" data-fdel="${f.id}">✕</button></td></tr>`).join('')}
        <tr><td><select class="box" id="nfSrc" style="height:32px">${d.sources.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></td>
          <td><input id="nfUrl" placeholder="https://…/feed/ or …/sitemap.xml" style="max-width:340px"></td><td></td><td></td><td><button class="mini-btn ok" id="nfAdd">Add</button></td></tr></tbody></table></div>
    </section>
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Recent pages</h2>
      <div class="tbl"><table><thead><tr><th>Page</th><th>Status</th><th>Approved</th><th>Drafts</th><th>Failed check</th></tr></thead>
      <tbody>${d.pages.map(pageRow).join('') || '<tr><td colspan="5" class="empty">Nothing read yet. Press "Find polls now".</td></tr>'}</tbody></table></div>
    </section>`;
  const again = async (path, body, msg) => { try { const r = await api(path, body); if (msg) toast(msg(r)); pollyAutoTab(box, r); } catch (e) { toast(e.message); } };
  $('#auAuto').onchange = e => again('admin/polly/auto/settings', { autoApprove: e.target.checked }, r => r.autoApprove ? 'Sure ones will be approved on their own' : 'Everything will wait as a draft');
  $('#auRun').onclick = async () => {
    const b = $('#auRun'); b.disabled = true; b.textContent = 'Reading pages… (up to a minute)';
    try {
      const r = await api('admin/polly/auto/run', { maxPages: 3, forceFeeds: $('#auForce').checked });
      toast(`Read ${r.read} ${r.read === 1 ? 'page' : 'pages'}: ${r.added} approved, ${r.drafted} drafts${r.queued ? `, ${r.queued} new pages found` : ''}. ${r.left} waiting.`);
      pollyAutoTab(box, r);
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Find polls now'; }
  };
  $('#auQueue').onclick = () => again('admin/polly/auto/queue', { urls: $('#auUrls').value }, r => `Queued ${r.queued}${r.refused.length ? `. Not on the allowlist: ${r.refused.length}` : ''}`);
  box.querySelectorAll('[data-fon]').forEach(i => i.onchange = () => again('admin/polly/feeds', { id: Number(i.dataset.fon), active: i.checked }));
  box.querySelectorAll('[data-fdel]').forEach(b => b.onclick = () => { if (confirm('Remove this feed?')) again('admin/polly/feeds', { id: Number(b.dataset.fdel), remove: true }); });
  $('#nfAdd').onclick = () => again('admin/polly/feeds', { sourceId: Number($('#nfSrc').value), url: $('#nfUrl').value }, () => 'Feed added');
}

/* ── Add ── */
let pollyAddMode = 'url';
async function pollyAdd(box) {
  const sources = (await loadPollySources());
  const active = sources.filter(s => s.active);
  const modes = [['url', 'Paste a URL'], ['text', 'Paste text instead'], ['hand', 'Enter by hand']];
  box.innerHTML = `<section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">Add questions</h2>
      <p class="sub">Every number comes from a real poll page and is checked against it. The AI only reads the page you give it (it never searches or remembers numbers), and the server then checks each number against the page text. Allowed sites: ${active.map(s => esc(s.name)).join(', ')}.</p>
      <div class="row">${modes.map(([k, n]) => `<button class="tbtn ${k === pollyAddMode ? 'on' : ''}" data-mode="${k}">${n}</button>`).join('')}</div>
      <div id="addForm" style="margin-top:12px"></div></section>
    <div id="addOut"></div>`;
  box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { pollyAddMode = b.dataset.mode; pollyAdd(box); });
  const f = $('#addForm');
  if (pollyAddMode === 'url') {
    f.innerHTML = `<div class="row" style="margin-top:0"><input class="box" id="aUrl" style="flex:1;min-width:220px" placeholder="https://www.pewresearch.org/…"><button class="btn sm" id="aGo">Read the page</button></div>
      <p class="sub">The server fetches the page (10 s, HTML only), keeps the first 60,000 characters of text, and sends that to the AI. If the fetch fails (login, PDF, chart image), paste the text instead.</p>`;
    $('#aGo').onclick = () => runExtract({ url: $('#aUrl').value });
  } else if (pollyAddMode === 'text') {
    f.innerHTML = `<div class="form"><label>Source<select class="box" id="aSrc">${active.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Source URL (must be on that site)<input class="box" id="aUrl" placeholder="https://…"></label>
      <label class="full">Page text<textarea class="box" id="aText" style="min-height:180px" placeholder="Paste the report text here"></textarea></label></div>
      <div class="row"><button class="btn sm" id="aGo">Read the text</button></div>`;
    $('#aGo').onclick = () => runExtract({ url: $('#aUrl').value, text: $('#aText').value, sourceId: Number($('#aSrc').value) });
  } else {
    f.innerHTML = `${qFields({ topic: 'life', source_id: active[0] && active[0].id }, sources)}
      <div class="row"><button class="btn sm" id="hSave">Save as draft</button><button class="btn sm alt" id="hApprove">Save and approve</button></div>`;
    wireReal(f);
    const save = async action => {
      try { const r = await api('admin/polly/question', { ...readQ(f), action }); toast(action === 'approve' ? 'Approved and scheduled' : 'Saved as a draft'); if (r.warnings && r.warnings.length) toast(r.warnings.join(' ')); pollyAdd(box); }
      catch (e) { toast(e.message); }
    };
    $('#hSave').onclick = () => save('save');
    $('#hApprove').onclick = () => save('approve');
  }

  async function runExtract(body) {
    const b = $('#aGo'); b.disabled = true; b.textContent = 'Reading…';
    try { showCandidates(await api('admin/polly/extract', body)); }
    catch (e) { $('#addOut').innerHTML = `<section class="card"><div class="note bad">${esc(e.message)}</div></section>`; }
    finally { b.disabled = false; b.textContent = pollyAddMode === 'url' ? 'Read the page' : 'Read the text'; }
  }
  function showCandidates(d) {
    const out = $('#addOut');
    out.innerHTML = `<section class="card"><div class="kicker"><span>${esc(d.source.name)} · ${d.chars.toLocaleString('en-US')} characters read</span><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a></div>
        <div class="section-title">Passed the check (${d.candidates.length})</div>
        ${d.candidates.length ? '<p class="sub">Tick the ones to keep, fix anything, then save them as drafts. Blank date / sample size fields weren\'t on the page: type them from the source.</p>' : '<p class="empty">None passed.</p>'}
        ${d.candidates.map((c, i) => `<div class="pcand" data-i="${i}">
          <label class="pick"><input type="checkbox" data-keep="${i}"> Keep</label> ${entryBadge(c.entry)} ${c.time_sensitive ? badge('time-sensitive', 'auto') : ''} ${c.already ? badge('already in the bank', 'rejected') : ''}
          <span class="sub">${c.dateChecked ? 'date checked' : 'date not on page'} · ${c.sampleChecked ? 'sample checked' : 'sample not on page'}${c.population ? ` · ${esc(c.population)}` : ''}</span>
          ${c.tooLong && c.tooLong.length ? `<div class="sub" style="color:var(--bad)">Trim before approving: ${esc(c.tooLong.join(', '))}</div>` : ''}
          ${qFields(c, sources)}</div>`).join('')}
        ${d.candidates.length ? '<div class="row"><button class="btn" id="saveDrafts">Save as drafts</button></div>' : ''}
      </section>
      ${d.failed.length ? `<section class="card"><div class="section-title" style="margin-top:0">Failed the check (${d.failed.length})</div>
        ${d.failed.map(c => `<div class="pfail"><b>${esc(c.short || c.original_wording || '(no wording)')}</b> <span class="sub">${esc(c.left_label)} ${c.left_raw ?? '?'} / ${esc(c.right_label)} ${c.right_raw ?? '?'}${c.unsure_raw != null ? ` / unsure ${c.unsure_raw}` : ''}</span>
          <ul>${c.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>${c.evidence ? `<p class="sub">Evidence: “${esc(c.evidence)}”</p>` : ''}</div>`).join('')}</section>` : ''}`;
    out.querySelectorAll('.pcand').forEach(wireReal);
    const sd = $('#saveDrafts');
    if (sd) sd.onclick = async () => {
      const picked = [...out.querySelectorAll('.pcand')].filter(el => el.querySelector('[data-keep]').checked)
        .map(el => ({ ...d.candidates[Number(el.dataset.i)], ...readQ(el) }));
      if (!picked.length) return toast('Tick at least one.');
      sd.disabled = true;
      try { const r = await api('admin/polly/drafts', { candidates: picked }); toast(`Saved ${r.saved} ${r.saved === 1 ? 'draft' : 'drafts'}. Approve them in the bank.`); go('polly/bank'); }
      catch (e) { toast(e.message); sd.disabled = false; }
    };
  }
}

/* ── Bank ── */
let pollyBankFilter = { status: 'draft', topic: '', ts: '', entry: '', q: '' };
async function pollyBank(box) {
  const f = pollyBankFilter;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '')).toString();
  const d = await api('admin/polly/bank?' + qs);
  pollySources = d.sources;
  const sel = (k, opts) => `<select class="box" data-flt="${k}" style="width:auto">${opts.map(([v, n]) => `<option value="${v}" ${f[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  box.innerHTML = `<section class="card">
      <div class="row" style="margin-top:0">
        ${sel('status', [['', 'Any status'], ['draft', 'Drafts'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['retired', 'Retired']])}
        ${sel('topic', [['', 'Any topic'], ...TOPICS.map(t => [t, TOPIC_NAMES[t]])])}
        ${sel('ts', [['', 'Time-sensitive or not'], ['1', 'Time-sensitive'], ['0', 'Not time-sensitive']])}
        ${sel('entry', [['', 'Any entry'], ['auto-checked', 'auto-checked'], ['admin-pasted', 'admin-pasted'], ['admin-entered', 'admin-entered']])}
        <input class="box" data-flt="q" style="flex:1;min-width:160px" placeholder="Search wording or URL" value="${esc(f.q)}"><button class="btn sm alt" id="bGo">Search</button></div>
      ${bankLowNote(d.bank)}
    </section>
    <section class="card"><div class="tbl"><table><thead><tr><th>#</th><th>Status</th><th>Question</th><th>Split</th><th>Poll</th><th>Entry</th><th>Next run</th><th></th></tr></thead>
      <tbody>${d.questions.map((q, i) => `<tr>
        <td class="sub">${q.id}</td><td><span class="st ${q.status === 'retired' ? 'rejected' : q.status}">${q.status}</span></td>
        <td><b>${esc(q.short)}</b><br><span class="sub">${esc(q.left_label)} / ${esc(q.right_label)} · ${esc(TOPIC_NAMES[q.topic] || q.topic)}${q.time_sensitive ? ' · time-sensitive' : ''} · ${esc(q.source)}</span>
          ${q.status === 'draft' && q.problems.length ? `<br><span class="sub" style="color:var(--bad)">Needs: ${esc(q.problems.join(', '))}</span>` : ''}</td>
        <td>${pSplit(q)}</td><td class="sub">${esc(niceDay(q.poll_end_date)) || '–'}<br>${q.sample_size ? Number(q.sample_size).toLocaleString('en-US') : '–'}</td>
        <td>${entryBadge(q.entry)}</td><td class="sub">${esc(q.next_date || '')}${q.stale ? `<br>${badge('STALE', 'rejected')}` : ''}${q.runs ? `<br>ran ${q.runs}×` : ''}</td>
        <td style="white-space:nowrap"><button class="mini-btn" data-edit="${i}">Edit</button>
          ${q.status === 'draft' ? `<button class="mini-btn ok" data-approve="${i}" ${q.problems.length ? 'disabled title="' + esc(q.problems.join(', ')) + '"' : ''}>Approve</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nothing here.</td></tr>'}</tbody></table></div></section>`;
  const read = () => { box.querySelectorAll('[data-flt]').forEach(i => { pollyBankFilter[i.dataset.flt] = i.value; }); pollyBank(box); };
  box.querySelectorAll('select[data-flt]').forEach(s => { s.onchange = read; });
  $('#bGo').onclick = read;
  box.querySelector('[data-flt="q"]').onkeydown = e => { if (e.key === 'Enter') read(); };
  box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => pollyEditor(d.questions[Number(b.dataset.edit)], () => pollyBank(box)));
  box.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    try { await api('admin/polly/question', { id: d.questions[Number(b.dataset.approve)].id, action: 'approve' }); toast('Approved and scheduled'); pollyBank(box); } catch (e) { toast(e.message); }
  });
}

/** Edit any field; approve / reject / retire. `fix` (a report) saves without changing the status. */
function pollyEditor(q, done, { report = null } = {}) {
  const used = q.answers || 0;
  openModal(`<h2>${report ? 'Fix this question' : `Question #${q.id}`}</h2>
    <p class="sub" style="margin-top:0">${entryBadge(q.entry)} <span class="st ${q.status === 'retired' ? 'rejected' : q.status}">${q.status}</span> ${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">open the source ↗</a>` : ''}</p>
    <div id="pe">${qFields(q, pollySources)}</div>
    ${used ? `<div class="note warn">${used} ${used === 1 ? 'answer' : 'answers'} so far. Changing the raw numbers rescores every play of this question.</div>` : ''}
    ${report ? '<label class="sub" style="display:block;margin-top:10px">Note (admin only)<input class="box" id="peNote"></label>' : ''}
    <div class="row">
      ${report ? '<button class="btn" id="peFix">Save the fix</button>' : `<button class="btn" id="peSave">Save</button>
      ${q.status !== 'approved' ? '<button class="btn alt" id="peApprove">Approve</button>' : ''}
      ${q.status === 'draft' && !used ? '<button class="btn alt" id="peReject">Reject</button>' : ''}
      ${q.status === 'approved' ? '<button class="btn alt" id="peRetire">Retire</button>' : ''}
      ${q.status !== 'draft' && !used ? '<button class="btn alt" id="peDraft">Back to draft</button>' : ''}`}
      <button class="btn alt" id="peCancel">Cancel</button></div>`);
  const el = $('#pe');
  wireReal(el);
  const act = async action => {
    try {
      const r = report
        ? await api('admin/polly/reports/resolve', { id: report.id, action: 'fix', fields: readQ(el), adminNote: $('#peNote').value })
        : await api('admin/polly/question', { id: q.id, ...readQ(el), action });
      closeModal();
      toast(r.rescored ? `Saved · ${r.rescored} ${r.rescored === 1 ? 'answer' : 'answers'} rescored` : { approve: 'Approved and scheduled', reject: 'Rejected', retire: 'Retired', draft: 'Back to draft' }[action] || 'Saved');
      done && done();
    } catch (e) { toast(e.message); }
  };
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('#peSave', () => act('save')); on('#peApprove', () => act('approve')); on('#peReject', () => act('reject'));
  on('#peRetire', () => { if (confirm('Retire it? It leaves every future day; past plays keep their scores.')) act('retire'); });
  on('#peDraft', () => act('draft')); on('#peFix', () => act('fix')); on('#peCancel', closeModal);
}

/* ── Calendar ── */
async function pollyCal(box) {
  const d = await api('admin/polly/calendar');
  const dates = [];
  for (let x = d.from; x <= d.to; x = addDays(x, 1)) dates.push(x);
  const at = (date, slot) => d.slots.find(s => s.date === date && s.slot === slot);
  const editable = (date, s) => date > d.today || (date === d.today && !(s && s.answers));
  const cell = (date, slot) => {
    const s = at(date, slot), can = editable(date, s);
    if (!s) return `<td class="pslot empty ${can ? 'drop' : ''}" data-date="${date}" data-slot="${slot}">${can && d.unscheduled.length
      ? `<select class="box" data-assign="${date}|${slot}" style="height:30px;font-size:12px"><option value="">+ from the bank…</option>${d.unscheduled.map(q => `<option value="${q.id}">${esc(q.short.slice(0, 50))}</option>`).join('')}</select>` : '<span class="sub">–</span>'}</td>`;
    return `<td class="pslot ${can ? 'drop' : ''}" data-date="${date}" data-slot="${slot}">
      <div class="pq-chip" ${can ? 'draggable="true"' : ''} data-from="${date}|${slot}">
        <b>${esc(s.short)}</b>
        <div class="sub">${esc(TOPIC_NAMES[s.topic] || s.topic)}${s.time_sensitive ? ' · TS' : ''}${s.answers ? ` · ${s.answers} answers` : ''}</div>
        <div>${s.stale ? `${badge('STALE', 'rejected')} ` : ''}${s.reused ? `${badge('reused', 'auto')} ` : ''}${s.pinned ? `${badge('pinned', 'approved')} ` : ''}${s.status !== 'approved' ? badge(s.status, 'draft') : ''}</div>
        ${can ? `<div class="row" style="margin-top:4px;gap:4px"><button class="mini-btn" data-pin="${date}|${slot}|${s.pinned ? 'unpin' : 'pin'}">${s.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="mini-btn" data-move="${date}|${slot}">Move…</button><button class="mini-btn danger" data-unsched="${date}|${slot}">Unschedule</button></div>` : ''}
      </div></td>`;
  };
  box.innerHTML = `<section class="card"><div class="kicker"><span>Past 14 days and the next 60 · today is Polly #${d.number}</span><span>${d.bank.unscheduled} unscheduled in the bank · ${d.bank.fresh} never run</span></div>
      <p class="sub">Auto-fill puts approved questions into empty slots, oldest approval first: at most 1 politics question a day, never two from the same URL, and three different topics where it can. Drag a question onto another slot to swap or move it. Pinned questions are never moved by auto-fill. Past days and slots someone already answered are locked.</p>
      ${bankLowNote(d.bank)}</section>
    <section class="card"><div class="tbl"><table class="pcal"><thead><tr><th>Date</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead>
      <tbody>${dates.map(dt => `<tr class="${dt === d.today ? 'today' : ''}"><td><b>${dt.slice(5)}</b>${dt === d.today ? '<br><span class="badge">today</span>' : ''}</td>${[1, 2, 3].map(s => cell(dt, s)).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  const send = async body => {
    try { const r = await api('admin/polly/schedule', body); if (r.warning) toast(r.warning); pollyCal(box); } catch (e) { toast(e.message); }
  };
  const pos = s => { const [date, slot] = s.split('|'); return { date, slot: Number(slot) }; };
  box.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => { const [date, slot, act] = b.dataset.pin.split('|'); send({ action: act, a: { date, slot: Number(slot) } }); });
  box.querySelectorAll('[data-unsched]').forEach(b => b.onclick = () => send({ action: 'unschedule', a: pos(b.dataset.unsched) }));
  box.querySelectorAll('[data-assign]').forEach(s => s.onchange = () => { if (s.value) send({ action: 'assign', a: pos(s.dataset.assign), questionId: Number(s.value) }); });
  box.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
    const to = prompt('Move to which day and slot? (YYYY-MM-DD 1–3)', `${addDays(d.today, 1)} 1`);
    if (!to) return;
    const m = to.trim().match(/^(\d{4}-\d{2}-\d{2})\s+([123])$/);
    if (!m) return toast('Type a date and a slot, like 2026-11-02 3');
    send({ action: 'swap', a: pos(b.dataset.move), b: { date: m[1], slot: Number(m[2]) } });
  });
  // drag to swap / move
  box.querySelectorAll('[draggable="true"]').forEach(el => {
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', el.dataset.from); e.dataTransfer.effectAllowed = 'move'; };
  });
  box.querySelectorAll('td.drop').forEach(td => {
    td.ondragover = e => { e.preventDefault(); td.classList.add('over'); };
    td.ondragleave = () => td.classList.remove('over');
    td.ondrop = e => {
      e.preventDefault(); td.classList.remove('over');
      const from = e.dataTransfer.getData('text/plain');
      if (from) send({ action: 'swap', a: pos(from), b: { date: td.dataset.date, slot: Number(td.dataset.slot) } });
    };
  });
}

/* ── Reports ── */
async function pollyRep(box, status = 'open') {
  const d = await api('admin/polly/reports?status=' + status);
  pollySources = (await api('admin/polly/sources')).sources;
  if (status === 'open') $('#pollyN').textContent = d.reports.length ? `(${d.reports.length})` : '';
  box.innerHTML = `<div class="row" style="margin:0 0 12px">${['open', 'fixed', 'dismissed', 'retired'].map(s => `<button class="tbtn ${s === status ? 'on' : ''}" data-st="${s}">${s}</button>`).join('')}</div>
    ${d.reports.map((r, i) => {
      const q = r.question;
      return `<section class="card" style="margin-bottom:14px">
      <div class="kicker"><span>${esc(r.play_date || 'unlimited')} · ${esc(r.mode)} · question #${q.id}</span><span>${esc(r.created_at.slice(0, 16).replace('T', ' '))}</span></div>
      <p style="margin:8px 0 4px"><b>${esc(q.short)}</b> <span class="sub">${esc(q.left_label)} ${q.left_raw} / ${esc(q.right_label)} ${q.right_raw}${q.unsure_raw != null ? ` / unsure ${q.unsure_raw}` : ''} → real ${q.real}%</span></p>
      <p class="sub" style="margin:0">“${esc(q.original_wording)}” · ${esc(q.source)} · ${esc(niceDay(q.poll_end_date))} · <a href="${esc(q.url)}" target="_blank" rel="noopener">source ↗</a></p>
      <p style="margin:8px 0">Player guessed <b>${r.guess}</b>${r.own ? ` and picked <b>${esc(r.own === 'left' ? q.left_label : q.right_label)}</b>` : ' (no side)'} · scored ${r.score}</p>
      <div class="note warn"><b>${esc(r.reasonText)}</b>${r.note ? `: “${esc(r.note)}”` : ''}</div>
      ${r.open_on_question > 1 ? `<p class="sub">${r.open_on_question} open reports on this question. Resolving one resolves them all.</p>` : ''}
      ${status === 'open' ? `<div class="row"><button class="btn sm" data-fix="${i}">Fix…</button><input class="box" data-note="${i}" style="flex:1;min-width:160px;height:42px" placeholder="Note (admin only)">
        <button class="btn sm alt" data-dismiss="${i}">Dismiss</button><button class="btn sm alt" data-retire="${i}">Retire</button></div>`
        : `<p class="sub">Resolved ${esc((r.resolved_at || '').slice(0, 16).replace('T', ' '))}${r.admin_note ? ' · ' + esc(r.admin_note) : ''}</p>`}
    </section>`;
    }).join('') || '<div class="card"><p class="empty">Nothing here.</p></div>'}`;
  box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => pollyRep(box, b.dataset.st));
  const resolve = async (i, action) => {
    try { await api('admin/polly/reports/resolve', { id: d.reports[i].id, action, adminNote: box.querySelector(`[data-note="${i}"]`).value }); toast(action === 'dismiss' ? 'Dismissed' : 'Retired'); pollyRep(box, 'open'); }
    catch (e) { toast(e.message); }
  };
  box.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => resolve(Number(b.dataset.dismiss), 'dismiss'));
  box.querySelectorAll('[data-retire]').forEach(b => b.onclick = () => { if (confirm('Retire this question from every future day?')) resolve(Number(b.dataset.retire), 'retire'); });
  box.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
    const r = d.reports[Number(b.dataset.fix)];
    pollyEditor(r.question, () => pollyRep(box, 'open'), { report: r });
  });
}

/* ── Sources (the allowlist) ── */
async function pollySrc(box) {
  const d = await api('admin/polly/sources');
  pollySources = d.sources;
  box.innerHTML = `<section class="card"><p class="sub" style="margin-top:0">Only pages on these sites (or their subdomains) can be read. A URL anywhere else is refused before anything is fetched.</p>
    <div class="tbl" style="margin-top:10px"><table><thead><tr><th>Name</th><th>Domains</th><th>On</th><th>Questions</th><th></th></tr></thead>
    <tbody>${d.sources.map((s, i) => `<tr><td><input data-n="${i}" value="${esc(s.name)}"></td><td><input data-d="${i}" value="${esc(s.domains.join(', '))}" style="max-width:280px"></td>
      <td><input type="checkbox" data-a="${i}" ${s.active ? 'checked' : ''}></td><td>${s.questions}</td>
      <td style="white-space:nowrap"><button class="mini-btn" data-save="${i}">Save</button> ${s.questions ? '' : `<button class="mini-btn danger" data-del="${i}">✕</button>`}</td></tr>`).join('')}
      <tr><td><input id="nsName" placeholder="New source"></td><td><input id="nsDom" placeholder="example.org, polls.example.org" style="max-width:280px"></td><td></td><td></td><td><button class="mini-btn ok" id="nsAdd">Add</button></td></tr>
    </tbody></table></div></section>`;
  const save = async body => { try { pollySources = (await api('admin/polly/sources', body)).sources; toast('Saved'); pollySrc(box); } catch (e) { toast(e.message); } };
  box.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const i = b.dataset.save;
    save({ id: d.sources[i].id, name: box.querySelector(`[data-n="${i}"]`).value, domains: box.querySelector(`[data-d="${i}"]`).value, active: box.querySelector(`[data-a="${i}"]`).checked });
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Remove this source?')) save({ id: d.sources[b.dataset.del].id, remove: true }); });
  $('#nsAdd').onclick = () => save({ name: $('#nsName').value, domains: $('#nsDom').value, active: true });
}

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== tab) go(t); });
go(tab);
