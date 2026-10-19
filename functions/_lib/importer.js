// Paste-in puzzles: the admin pastes the text an LLM wrote (with the prompts in prompts/PROMPTS.md), checks it,
// and adds it to the calendar. One plain-text format per game, forgiving about spacing, bullets and code fences.
//   Summit: a "DAY" block per day, one line per stage:  easy | weight | a paper clip = 1 g | a grand piano = 450 kg
//   Venn:   a "DAY" block per day: R1 / R2 circles, typical (or par), and answers
//   Polly:  a "QUESTION" block per question; the server opens each source page and checks the numbers are on it
import { HttpError, nowISO, todayUTC, addDays, isDate, clampStr } from './util.js';
import { PROPS } from '../../public/js/props.js';
import { parFor, MIN_ANSWERS } from '../../public/js/venn-score.js';
import { rescale, LABEL_MAX, SHORT_MAX } from '../../public/js/polly-score.js';
import * as summitAdmin from './admin.js';
import * as vennAdmin from './venn-admin.js';
import { cleanPuzzle } from './ai.js';
import { recentItems } from './plan.js';
import { catKey } from './venn-ai.js';
import { activeSources, sourceForUrl, fetchPage, checkCandidate, TOPICS } from './polly-ai.js';
import { allSources, fieldsFrom, insertQ, approvalProblems } from './polly-admin.js';
import { autoFill } from './polly.js';

/* ───────────── Splitting the paste into blocks ───────────── */

const HEADER = /^(?:#+\s*)?(day|question|q)\b\s*\d*\s*:?\s*$|^(-{3,}|={3,})$/i;

/** Lines grouped into blocks. A block starts at a "DAY" / "QUESTION" / "---" line; fences, bullets and blank lines are ignored. */
export function blocks(text) {
  const out = [];
  let cur = null;
  String(text || '').replace(/\r/g, '').split('\n').forEach(raw => {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!line || /^```/.test(line)) return;
    if (HEADER.test(line)) { cur = []; out.push(cur); return; }
    if (!cur) { cur = []; out.push(cur); }
    cur.push(line);
  });
  return out.filter(b => b.length);
}

/** "key: value" (the key is case- and space-insensitive). */
function field(line) {
  const m = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,24}?)\s*:\s*(.*)$/);
  return m ? [m[1].toLowerCase().replace(/[\s_-]+/g, ''), m[2].trim()] : [null, line];
}
const splitList = v => String(v || '').split(/\s*;\s*/).map(s => s.trim()).filter(Boolean);

/* ───────────── Summit ───────────── */

// Units an LLM (or a person) might write, per dimension, as multipliers to that property's base unit.
const UNITS = {
  mass: { mg: 1e-6, milligram: 1e-6, g: 1e-3, gram: 1e-3, kg: 1, kilogram: 1, kilo: 1, t: 1000, tonne: 1000, 'metric ton': 1000, oz: .0283495, ounce: .0283495, lb: .453592, pound: .453592, ton: 907.185, 'us ton': 907.185, 'short ton': 907.185 },
  length: { mm: 1e-3, millimeter: 1e-3, cm: .01, centimeter: .01, m: 1, meter: 1, metre: 1, km: 1000, kilometer: 1000, kilometre: 1000, in: .0254, inch: .0254, ft: .3048, foot: .3048, feet: .3048, yd: .9144, yard: .9144, mi: 1609.344, mile: 1609.344 },
  area: { cm2: 1e-4, 'square centimeter': 1e-4, m2: 1, 'sq m': 1, 'square meter': 1, 'square metre': 1, ha: 1e4, hectare: 1e4, km2: 1e6, 'sq km': 1e6, 'square kilometer': 1e6, in2: .00064516, 'square inch': .00064516, ft2: .092903, 'sq ft': .092903, 'square foot': .092903, 'square feet': .092903, acre: 4046.86, mi2: 2.58999e6, 'sq mi': 2.58999e6, 'square mile': 2.58999e6 },
  volume: { ml: 1e-3, milliliter: 1e-3, millilitre: 1e-3, l: 1, liter: 1, litre: 1, m3: 1000, 'cubic meter': 1000, tsp: .00492892, teaspoon: .00492892, tbsp: .0147868, tablespoon: .0147868, 'fl oz': .0295735, 'fluid ounce': .0295735, cup: .236588, pint: .473176, quart: .946353, gal: 3.78541, gallon: 3.78541 },
  time: { ms: 1e-3, millisecond: 1e-3, s: 1, sec: 1, second: 1, min: 60, minute: 60, h: 3600, hr: 3600, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600, yr: 31557600, decade: 315576000, century: 3155760000, centurie: 3155760000 },
  speed: { 'm/s': 1, mps: 1, 'km/h': 1 / 3.6, kph: 1 / 3.6, kmh: 1 / 3.6, mph: .44704, knot: .514444, kn: .514444 },
  energy: { cal: 1, kcal: 1, calorie: 1, kilocalorie: 1, kj: .239006 },
  power: { w: 1, watt: 1, kw: 1e3, kilowatt: 1e3, mw: 1e6, megawatt: 1e6, gw: 1e9, gigawatt: 1e9, hp: 745.7, horsepower: 745.7 },
  data: { b: 1, byte: 1, kb: 1e3, kilobyte: 1e3, mb: 1e6, megabyte: 1e6, gb: 1e9, gigabyte: 1e9, tb: 1e12, terabyte: 1e12, pb: 1e15, petabyte: 1e15 },
  money: { '': 1, usd: 1, dollar: 1, '$': 1, 'us dollar': 1 }
};
const MULT = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, tn: 1e12, trillion: 1e12 };

/** "450 kg", "1.5 million people", "$1,200", "120 years" → the value in the property's base unit, or { error }. */
export function parseValue(text, property) {
  const p = PROPS[property];
  const dim = p.dim === 'time_y' ? 'time' : p.dim, toBase = p.dim === 'time_y' ? 1 / 31557600 : 1;
  const t = String(text || '').trim().toLowerCase().replace(/^about |^around |^~|^approx(?:imately|\.)? /, '').replace(/²/g, '2').replace(/³/g, '3');
  const m = t.match(/^(\$)?\s*(\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*[x×]\s*10\^?\s*(-?\d+)|e([+-]?\d+))?\s*(k|thousand|mil|million|bn|billion|tn|trillion|m(?=\s|$)|b(?=\s|$))?\b\s*(.*)$/);
  if (!m) return { error: `Couldn't read the number in "${text}".` };
  let n = Number(m[2].replace(/,/g, '')) * Math.pow(10, Number(m[3] || m[4] || 0));
  let unit = m[6].trim().replace(/\.$/, '');
  // "m" / "b" right after the number mean million / billion only for counts and money; otherwise "m" is meters.
  if (m[5]) {
    if ((m[5] === 'm' || m[5] === 'b') && !['count', 'money'].includes(dim)) unit = (m[5] + ' ' + unit).trim();
    else n *= MULT[m[5]];
  }
  if (dim === 'count') return n > 0 ? { value: n } : { error: `"${text}" isn't a positive number.` };
  if (dim === 'money') unit = unit.replace(/^(us )?dollars?$|^usd$/, '');
  const table = UNITS[dim] || {};
  const key = unit in table ? unit : unit.replace(/(es|s)$/, '') in table ? unit.replace(/(es|s)$/, '') : unit.replace(/s$/, '') in table ? unit.replace(/s$/, '') : null;
  if (key === null) {
    if (!unit) return n > 0 ? { value: n } : { error: `"${text}" isn't a positive number.` };
    return { error: `Unknown unit "${unit}" for ${p.label} (try ${Object.keys(table).slice(0, 6).join(', ')}).` };
  }
  const value = n * table[key] * toBase;
  return value > 0 ? { value } : { error: `"${text}" isn't a positive number.` };
}

const TIERS = { easy: 1, foothills: 1, '1': 1, medium: 2, ridge: 2, '2': 2, hard: 3, peak: 3, '3': 3 };
const PROP_ALIASES = { 'top speed': 'speed', 'build time': 'build', 'data size': 'data', 'word count': 'words', 'copies sold': 'copies', mass: 'weight', cost: 'price' };
const propKey = s => { const k = String(s || '').toLowerCase().trim(); return PROPS[k] && !PROPS[k].retired ? k : PROP_ALIASES[k] || null; };

/** Summit days: [{ date, stages: [{ slot, property, smallItem, smallValue, bigItem, bigValue, note }], errors }]. */
export function parseSummit(text) {
  return blocks(text).map(lines => {
    const day = { date: null, stages: [], errors: [] };
    for (const line of lines) {
      const [k, v] = field(line);
      if (k === 'date') { if (isDate(v)) day.date = v; else day.errors.push(`"${v}" isn't a YYYY-MM-DD date.`); continue; }
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 4) { day.errors.push(`Couldn't read: "${line}"`); continue; }
      const slot = TIERS[parts[0].toLowerCase().replace(/[^a-z0-9]/g, '')];
      const property = propKey(parts[1]);
      const end = s => { const i = s.lastIndexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()]; };
      const [smallItem, sv] = end(parts[2]), [bigItem, bv] = end(parts[3]);
      if (!slot) { day.errors.push(`"${parts[0]}" should be easy, medium or hard.`); continue; }
      if (!property) { day.errors.push(`"${parts[1]}" isn't a Summit property (${Object.keys(PROPS).filter(x => !PROPS[x].retired).join(', ')}).`); continue; }
      const a = parseValue(sv, property), b = parseValue(bv, property);
      if (a.error || b.error) { day.errors.push(a.error || b.error); continue; }
      const clean = cleanPuzzle({ smallItem, smallValue: a.value, bigItem, bigValue: b.value, property, tier: slot, note: parts[4] || '' });
      if (!clean) { day.errors.push(`Stage ${slot}: the two values need to be at least 20× apart.`); continue; }
      if (day.stages.some(s => s.slot === slot)) { day.errors.push(`Two ${['', 'easy', 'medium', 'hard'][slot]} stages in one day.`); continue; }
      day.stages.push({ slot, ...clean, tier: undefined });
    }
    day.stages.sort((x, y) => x.slot - y.slot);
    return day;
  });
}

/* ───────────── Venn ───────────── */

/** Venn days: [{ date, rounds: [{ round, circles, typical, par, answers }], errors }]. */
export function parseVenn(text) {
  return blocks(text).map(lines => {
    const day = { date: null, rounds: [], errors: [] };
    const r = { 1: { round: 1 }, 2: { round: 2 } };
    for (const line of lines) {
      const [k, v] = field(line);
      if (!k) { day.errors.push(`Couldn't read: "${line}"`); continue; }
      if (k === 'date') { if (isDate(v)) day.date = v; else day.errors.push(`"${v}" isn't a YYYY-MM-DD date.`); continue; }
      const m = k.match(/^(?:r|round)([12])(circles|typical|par|answers|note)?$/);
      if (!m) { day.errors.push(`Unknown line "${line}"`); continue; }
      const x = r[m[1]], what = m[2] || 'circles';
      if (what === 'circles') x.circles = v.split('|').map(s => s.trim()).filter(Boolean);
      else if (what === 'answers') x.answers = splitList(v);
      else if (what === 'note') x.note = clampStr(v, 200);
      else x[what] = Math.round(Number(v));
    }
    for (const n of [1, 2]) {
      const x = r[n];
      if (!x.circles) continue;
      const need = n === 2 ? 3 : 2;
      if (x.circles.length !== need) { day.errors.push(`Round ${n} needs exactly ${need} circles (split them with |).`); continue; }
      if (new Set(x.circles.map(catKey)).size !== need) { day.errors.push(`Round ${n}: the circles have to be different.`); continue; }
      if (!(x.typical > 0) && !(x.par > 0)) { day.errors.push(`Round ${n} needs a typical count (or a par).`); continue; }
      const typical = x.typical > 0 ? x.typical : Math.ceil(x.par / .6);
      const answers = [...new Set(x.answers || [])];
      day.rounds.push({ round: n, circles: x.circles, typical, par: x.par > 0 ? x.par : parFor(typical, n), answers, note: x.note || '',
        warning: answers.length < MIN_ANSWERS[n] ? `only ${answers.length} answers listed (aim for ${MIN_ANSWERS[n]}+)` : '' });
    }
    if (!day.rounds.length && !day.errors.length) day.errors.push('No rounds in this day.');
    return day;
  });
}

/* ───────────── Polly ───────────── */

const yes = v => /^(y|yes|true|1)$/i.test(String(v || '').trim());
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[%,\s]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
const sideOf = v => { const i = String(v || '').lastIndexOf('='); return i < 0 ? { label: String(v || '').trim(), raw: null } : { label: v.slice(0, i).trim(), raw: num(v.slice(i + 1)) }; };

/** Polly questions: [{ q: { …question fields }, errors }]. */
export function parsePolly(text) {
  return blocks(text).map(lines => {
    const q = { population: 'US adults', topic: 'life', time_sensitive: false, ts_reason: '' }, errors = [];
    for (const line of lines) {
      const [k, v] = field(line);
      if (!k) { errors.push(`Couldn't read: "${line}"`); continue; }
      const map = {
        short: () => { q.short = v; }, question: () => { q.short = v; },
        left: () => { const s = sideOf(v); q.left_label = s.label; q.left_raw = s.raw; },
        right: () => { const s = sideOf(v); q.right_label = s.label; q.right_raw = s.raw; },
        unsure: () => { q.unsure_raw = num(v); },
        wording: () => { q.original_wording = v.replace(/^["“]|["”]$/g, ''); }, originalwording: () => { q.original_wording = v.replace(/^["“]|["”]$/g, ''); },
        url: () => { q.url = v; }, source: () => { q.source = v; },
        ended: () => { q.poll_end_date = v; }, pollended: () => { q.poll_end_date = v; }, polldate: () => { q.poll_end_date = v; },
        sample: () => { q.sample_size = num(v); }, samplesize: () => { q.sample_size = num(v); },
        topic: () => { q.topic = TOPICS.includes(v.toLowerCase()) ? v.toLowerCase() : (errors.push(`Topic should be ${TOPICS.join(', ')}.`), q.topic); },
        timesensitive: () => { q.time_sensitive = yes(v.split(/[—–-]/)[0]); const why = v.split(/[—–-]/).slice(1).join('-').trim(); if (why) q.ts_reason = why; },
        population: () => { q.population = v; },
        evidence: () => { q.evidence = v.replace(/^["“]|["”]$/g, ''); }
      };
      if (map[k]) map[k](); else errors.push(`Unknown line "${line}"`);
    }
    if (!q.short) errors.push('No short question.');
    if (!q.left_label || q.left_raw == null) errors.push('The left side needs a label and a number (Label = 45).');
    if (!q.right_label) errors.push('The right side needs a label.');
    if (!q.url) errors.push('No source URL.');
    if (!q.evidence) errors.push('No evidence sentence.');
    if (q.poll_end_date && !isDate(q.poll_end_date)) { errors.push(`"${q.poll_end_date}" isn't a YYYY-MM-DD date.`); q.poll_end_date = null; }
    if (q.short && q.short.length > SHORT_MAX) errors.push(`The short question is over ${SHORT_MAX} characters.`);
    if ((q.left_label || '').length > LABEL_MAX || (q.right_label || '').length > LABEL_MAX) errors.push(`Labels can be ${LABEL_MAX} characters at most.`);
    if (q.left_raw != null && q.right_raw != null) q.real = rescale(q.left_raw, q.right_raw);
    return { q, errors };
  });
}

/* ───────────── Where things go ───────────── */

/** The first date on/after `from` that isn't taken; marks it taken. */
function nextFree(taken, from) {
  let d = from;
  while (taken.has(d)) d = addDays(d, 1);
  taken.add(d);
  return d;
}

/* ───────────── Endpoints ───────────── */

/** body: { text, dryRun }. Days with a date go there; the rest fill the next days (from tomorrow) with nothing approved yet. */
export async function importSummit(env, body) {
  const days = parseSummit(body.text);
  if (!days.length) throw new HttpError(400, 'Nothing to import. Paste the LLM\'s answer.');
  const tomorrow = addDays(todayUTC(), 1);
  const taken = new Set((await env.DB.prepare(`SELECT DISTINCT date FROM puzzles WHERE date >= ? AND status = 'approved'`).bind(tomorrow).all()).results.map(r => r.date));
  days.filter(d => d.date).forEach(d => taken.add(d.date));
  for (const d of days) {
    if (d.errors.length || !d.stages.length) continue;
    if (!d.date) d.date = nextFree(taken, tomorrow);
  }
  let added = 0;
  if (!body.dryRun) {
    for (const d of days) {
      if (d.errors.length || !d.date) continue;
      for (const s of d.stages) {
        try { await summitAdmin.savePuzzle(env, { date: d.date, slot: s.slot, status: 'approved', ...s }); added++; }
        catch (e) { d.errors.push(`Stage ${s.slot}: ${e.message}`); }
      }
    }
  }
  return { game: 'summit', dryRun: !!body.dryRun, added, days };
}

export async function importVenn(env, body) {
  const days = parseVenn(body.text);
  if (!days.length) throw new HttpError(400, 'Nothing to import. Paste the LLM\'s answer.');
  const tomorrow = addDays(todayUTC(), 1);
  const taken = new Set((await env.DB.prepare(`SELECT DISTINCT date FROM venn_puzzles WHERE date >= ? AND status = 'approved'`).bind(tomorrow).all()).results.map(r => r.date));
  days.filter(d => d.date).forEach(d => taken.add(d.date));
  for (const d of days) {
    if (d.errors.length || !d.rounds.length) continue;
    if (!d.date) d.date = nextFree(taken, tomorrow);
  }
  let added = 0;
  if (!body.dryRun) {
    for (const d of days) {
      if (d.errors.length || !d.date) continue;
      for (const r of d.rounds) {
        try { await vennAdmin.savePuzzle(env, { date: d.date, status: 'approved', ...r }); added++; }
        catch (e) { d.errors.push(`Round ${r.round}: ${e.message}`); }
      }
    }
  }
  return { game: 'venn', dryRun: !!body.dryRun, added, days };
}

const POLLY_MAX = 15;   // each question's source page is opened, so a paste is checked 15 at a time

/**
 * Polly: every question's source page is opened and the numbers checked against it (the same check as Auto-find).
 * Verified questions with every field are approved and go on the calendar; anything else is saved as a draft.
 */
export async function importPolly(env, body) {
  const items = parsePolly(body.text);
  if (!items.length) throw new HttpError(400, 'Nothing to import. Paste the LLM\'s answer.');
  if (body.dryRun) return { game: 'polly', dryRun: true, added: 0, drafted: 0, items: items.map(i => ({ ...i, status: i.errors.length ? 'skip' : 'ready' })) };
  const sources = await allSources(env), active = await activeSources(env);
  const pages = new Map();
  let added = 0, drafted = 0, checked = 0;
  for (const it of items) {
    if (it.errors.length) { it.status = 'skip'; continue; }
    if (checked >= POLLY_MAX) { it.status = 'later'; it.errors.push(`Only ${POLLY_MAX} questions are checked per paste. Paste the rest again.`); continue; }
    checked++;
    const src = sourceForUrl(active, it.q.url);
    if (!src) { it.status = 'skip'; it.errors.push('That URL isn\'t from an allowed pollster (see Sources).'); continue; }
    const dup = await env.DB.prepare(`SELECT id FROM polly_questions WHERE url = ? AND lower(short) = lower(?)`).bind(it.q.url, it.q.short).first();
    if (dup) { it.status = 'skip'; it.errors.push('Already in the bank.'); continue; }
    let text = pages.get(it.q.url);
    if (text === undefined) {
      try { text = await fetchPage(env, it.q.url, active); } catch (e) { text = null; it.notes = [`Couldn't open the page (${e.message})`]; }
      pages.set(it.q.url, text);
    }
    const chk = text ? checkCandidate({ ...it.q, original_wording: it.q.original_wording || it.q.short }, text) : null;
    const verified = !!(chk && chk.ok);
    if (chk && !chk.ok) it.notes = chk.reasons;
    // Keep the date and sample size the LLM gave even when the page writes them differently; they're required to approve.
    const base = chk ? { ...chk.q, poll_end_date: it.q.poll_end_date || chk.q.poll_end_date, sample_size: it.q.sample_size || chk.q.sample_size } : it.q;
    const f = fieldsFrom({ ...base, original_wording: it.q.original_wording || it.q.short, source_id: src.id, url: it.q.url, entry: verified ? 'auto-checked' : 'admin-entered' }, sources, 'admin-entered');
    const ok = verified && approvalProblems(f, sources).length === 0;
    const row = await insertQ(env, f, ok ? 'approved' : 'draft').run();
    if (ok) { await env.DB.prepare(`UPDATE polly_questions SET approved_at = ? WHERE id = ?`).bind(nowISO(), row.meta.last_row_id).run(); added++; it.status = 'approved'; }
    else { drafted++; it.status = 'draft'; if (verified) it.notes = approvalProblems(f, sources); }
  }
  if (added) await autoFill(env);
  return { game: 'polly', dryRun: false, added, drafted, items };
}

/** Text to paste into the prompt so the LLM doesn't repeat what's already been used. */
export async function avoidList(env, q) {
  const game = q.get('game'), db = env.DB;
  if (game === 'summit') {
    const items = (await recentItems(env, 200)).slice(0, 200);
    return { text: items.join('; ') };
  }
  if (game === 'venn') {
    const rows = (await db.prepare(`SELECT circles FROM venn_puzzles WHERE status != 'rejected' AND (date IS NULL OR date >= ?) ORDER BY id DESC LIMIT 200`).bind(addDays(todayUTC(), -45)).all()).results;
    const cats = [...new Set(rows.flatMap(r => { try { return JSON.parse(r.circles); } catch { return []; } }))];
    return { text: cats.join('; ') };
  }
  if (game === 'polly') {
    const rows = (await db.prepare(`SELECT short, url FROM polly_questions WHERE status != 'rejected' ORDER BY id DESC LIMIT 150`).all()).results;
    return { text: rows.map(r => `${r.short} (${r.url})`).join('\n') };
  }
  throw new HttpError(400, 'Which game?');
}

