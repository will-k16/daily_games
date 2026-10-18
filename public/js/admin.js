// WK Game Suite admin: one page with a tab per game. Suite = players, WK Bucks, AI health;
// Summit = today, calendar, complaints, answers; Venn = calendar, complaints, judgments.
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
  venn: [['venn', 'Calendar'], ['venn/comp', 'Complaints'], ['venn/judg', 'Judgments']]
};
const VIEWS = {
  suite: box => suiteTab(box),
  summit: box => summitToday(box),
  'summit/cal': box => cal(box),
  'summit/comp': box => comp(box),
  'summit/ans': box => ans(box),
  venn: box => vennCal(box),
  'venn/comp': box => vennComp(box),
  'venn/judg': box => vennJudg(box)
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
    + (top === 'summit' ? '<a class="tbtn" href="/summit#/unlimited">∞ Summit unlimited</a>' : top === 'venn' ? '<a class="tbtn" href="/venn#/unlimited">∞ Venn unlimited</a>' : '');
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
  box.innerHTML = `
    <section class="card"><div class="kicker"><span>Today · ${d.date} (UTC)</span></div>
      <div class="section-title">Real players</div>
      <div class="tbl"><table><thead><tr><th>Game</th><th>Today</th><th>Ever</th><th>Open complaints</th></tr></thead>
        <tbody>${d.games.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${x.today}</td><td>${x.ever}</td><td>${x.openComplaints}</td></tr>`).join('')}
        <tr><td><b>Any game</b></td><td>–</td><td>${d.players}</td><td></td></tr></tbody></table></div>
      <p class="sub">“Players” only counts people who started at least one stage or round. Another ${d.visitsOnly} ${d.visitsOnly === 1 ? 'visit' : 'visits'} never played: mostly bots, link previews, and new guest IDs after signing out. ${d.signedIn} ${d.signedIn === 1 ? 'account' : 'accounts'}.</p>
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
      <p class="sub">The AI writes a two-circle round 1 and a three-circle round 2 for each day with an empty round. Every draft has to list at least 25 well-known answers (8 for round 2), or it's thrown out and tried again. Par = 60% of the AI's “typical” count (min 3 / 2). Days with nothing approved use their draft; with no draft the AI makes one on the spot, then the built-in bank.</p>
      <div class="row"><label class="sub">From <input type="date" id="vgFrom" class="box" style="width:auto" value="${addDays(d.today, 1)}"></label>
        <label class="sub">Days <select id="vgDays" class="box" style="width:auto">${[1, 3, 5, 7].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn sm" id="vgGo">Generate</button></div>
    </section>
    <section class="card"><div class="tbl"><table>
      <thead><tr><th>Date</th><th>Round 1 · two circles</th><th>Round 2 · three circles</th></tr></thead>
      <tbody>${dates.map(dt => `<tr class="${dt === d.today ? 'today' : ''}"><td><b>${dt.slice(5)}</b>${dt === d.today ? '<br><span class="badge">today</span>' : ''}</td>${[1, 2].map(r => cell(dt, r)).join('')}</tr>`).join('')}</tbody>
    </table></div></section>`;

  $('#vgGo').onclick = async () => {
    $('#vgGo').disabled = true; $('#vgGo').textContent = 'Thinking…';
    try { const r = await api('admin/venn/generate', { from: $('#vgFrom').value, days: Number($('#vgDays').value) }); toast(r.failed ? `Made ${r.made} drafts. ${r.failed} rounds are still empty (AI busy, or drafts failed the size check). Try Generate on them in a minute.` : `Made ${r.made} drafts`); go('venn'); }
    catch (e) { toast(e.message); $('#vgGo').disabled = false; $('#vgGo').textContent = 'Generate'; }
  };
  box.querySelectorAll('[data-vgen]').forEach(b => b.onclick = async () => {
    const [date, round] = b.dataset.vgen.split('|');
    b.disabled = true; b.textContent = 'Thinking…';
    try { const r = await api('admin/venn/generate', { date, round: Number(round) }); toast(`New draft: ${r.puzzle.circles.join(' + ')}`); go('venn'); }
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

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== tab) go(t); });
go(tab);
