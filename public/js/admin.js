import { fmt, nice } from './units.js';
import { PROPS, ROOMS, propLabel } from './props.js';

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

let tab = location.hash.slice(1) || 'dash';
document.querySelectorAll('#atabs [data-t]').forEach(b => b.onclick = () => go(b.dataset.t));
function go(t) {
  tab = t; history.replaceState(null, '', '#' + t);
  document.querySelectorAll('#atabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const box = $('#admin');
  box.innerHTML = '<div class="loading">Loading…</div>';
  ({ dash, cal, comp, ans })[t](box).catch(e => {
    box.innerHTML = `<div class="card"><div class="note bad">${esc(e.message)}</div>
      ${/Admins only/.test(e.message) ? `<p class="sub">Sign in with your admin Google account, then come back to this page.</p>
        <div class="row"><a class="btn" href="/api/auth/login" style="display:inline-flex;align-items:center;text-decoration:none">Sign in with Google</a></div>` : ''}</div>`;
  });
}

/* ═══════════ Dashboard ═══════════ */
async function dash(box) {
  const d = await api('admin/dashboard');
  $('#compN').textContent = d.openComplaints ? `(${d.openComplaints})` : '';
  const max = Math.max(1, ...d.hist), wmax = Math.max(1, ...d.week.map(w => w.n));
  box.innerHTML = `
    <section class="card"><div class="kicker"><span>Today · ${d.date} (UTC)</span></div>
      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><b>${d.todayPlayers}</b><span>Players today</span></div>
        <div class="kpi"><b>${d.players}</b><span>Players ever</span></div>
        <div class="kpi"><b>${d.signedIn}</b><span>Signed in</span></div>
        <div class="kpi"><b>${d.openComplaints}</b><span>Open complaints</span></div>
      </div>
      <div class="section-title">Today's stages</div>
      <div class="tbl"><table><thead><tr><th>Stage</th><th>Puzzle</th><th>Status</th><th>Finished</th><th>Avg</th><th>2nd guess</th></tr></thead>
      <tbody>${d.rooms.map(r => `<tr><td>${room(r.slot).emoji} ${room(r.slot).name}</td><td>${esc(r.small_item)} ↔ ${esc(r.big_item)}<br><span class="sub">${esc(propLabel(r.property))}</span></td>
        <td><span class="st ${r.status}">${r.status}</span></td><td>${r.plays}</td><td>${r.avg == null ? '–' : Math.round(r.avg)}</td><td>${r.plays ? Math.round(100 * (r.seconds || 0) / r.plays) + '%' : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Not generated yet. It will be created on the first visit.</td></tr>'}</tbody></table></div>
      <div class="crowd" style="margin-top:6px">
        <div><div class="section-title">Score spread today</div><div class="histo">${d.hist.map(n => `<i style="height:${Math.max(4, n / max * 100)}%" title="${n}"></i>`).join('')}</div><div class="histo-l"><span>0</span><span>500</span><span>1000</span></div></div>
        <div><div class="section-title">Daily players (14 days)</div><div class="histo">${d.week.map(w => `<i style="height:${Math.max(4, w.n / wmax * 100)}%" title="${w.date}: ${w.n}"></i>`).join('') || '<span class="empty">No data yet</span>'}</div></div>
      </div>
    </section>
    <section class="card"><h2 class="prompt" style="margin-top:0;font-size:22px">AI judge (last 24h)</h2>
      <div class="tbl"><table><thead><tr><th>Provider</th><th>Kind</th><th>OK</th><th>Failed</th><th>Avg ms</th></tr></thead>
      <tbody>${d.ai.map(a => `<tr><td>${esc(a.provider)}</td><td>${esc(a.kind)}</td><td>${a.ok}</td><td>${a.fail}</td><td>${Math.round(a.ms)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No AI calls yet.</td></tr>'}</tbody></table></div>
      ${d.rateLimited ? `<p class="sub">⏳ ${d.rateLimited} rate-limit ${d.rateLimited === 1 ? 'hit' : 'hits'} in the last 24h. Nothing to fix: the judge switched to its backup each time.</p>` : ''}
      ${d.errors.length ? `<div class="section-title">Recent errors</div>${d.errors.map(e => `<p class="sub"><b>${esc(e.provider)}/${esc(e.kind)}</b> ${esc(e.created_at)}: ${esc(e.error)}</p>`).join('')}` : ''}
    </section>`;
}

/* ═══════════ Calendar ═══════════ */
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
    try { const r = await api('admin/generate', { from: $('#gFrom').value, days: Number($('#gDays').value) }); toast(r.failed ? `Made ${r.made} drafts. ${r.failed} rooms are still empty because the AI was busy. Wait a minute, then use ✨ Generate on them.` : `Made ${r.made} drafts`); go('cal'); }
    catch (e) { toast(e.message); $('#gGo').disabled = false; $('#gGo').textContent = 'Generate'; }
  };
  box.querySelectorAll('[data-gen]').forEach(b => b.onclick = async () => {
    const [date, slot] = b.dataset.gen.split('|');
    b.disabled = true; b.textContent = 'Thinking…';
    try {
      const r = await api('admin/generate-slot', { date, slot: Number(slot) });
      toast(`New ${room(Number(slot)).name} draft: ${r.puzzle.smallItem} ↔ ${r.puzzle.bigItem}`); go('cal');
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
        try { await api('admin/puzzle/delete', { id: Number(x.dataset.del) }); closeModal(); toast('Deleted'); go('cal'); } catch (e) { toast(e.message); }
      });
    };
  });
}

async function setStatus(id, status) {
  try { await api('admin/puzzle/status', { id, status }); toast(status === 'approved' ? 'Approved' : 'Updated'); go('cal'); }
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
    try { await api('admin/puzzle', body); closeModal(); toast('Saved'); go('cal'); }
    catch (e) { toast(e.message); $('#eSave').disabled = false; }
  };
}

/* ═══════════ Complaints ═══════════ */
async function comp(box, status = 'open') {
  const d = await api('admin/complaints?status=' + status);
  if (status === 'open') $('#compN').textContent = d.complaints.length ? `(${d.complaints.length})` : '';
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

/* ═══════════ Answers ═══════════ */
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

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== tab) go(t); });
go(tab);
