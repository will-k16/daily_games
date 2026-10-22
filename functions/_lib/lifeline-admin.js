// Admin for Lifeline: AI drafts (each event's date checked against Wikidata, each example person checked
// against the scoring), the calendar (approve / edit / reject), paste-in import, reports ("these dates
// look wrong") and the people tab, where an admin fix to someone's dates rescores every play that named them.
import { HttpError, nowISO, todayUTC, addDays, isDate, clampStr, safeJson } from './util.js';
import { callAI } from './ai.js';
import { blocks } from './importer.js';
import { spread } from '../../public/js/charts.js';
import { ROUNDS, ROUND_MAX, DAY_MAX, PREC, eventSpan, lifeOf, scoreLife, showDate } from '../../public/js/lifeline-score.js';
import { lifelineNumber, insertPuzzle, pairProblem, eventsOf, rescore, getPuzzle, launchDate } from './lifeline.js';
import { findPerson, personById, builtinMatches } from './lifeline-wiki.js';

const LIVE = `status IN ('approved','auto')`;
const YEAR = 365.2425;
const UA = { 'user-agent': 'WK-Game-Suite/1.0 (https://wk-game-suite.pages.dev; daily history game)' };

function adminPuzzle(z, env) {
  const { a, b } = eventsOf(z);
  const A = eventSpan(a), B = eventSpan(b);
  return {
    id: z.id, date: z.date, round: z.round, status: z.status, a: { ...a, when: showDate(a.date, a.prec) }, b: { ...b, when: showDate(b.date, b.prec) },
    years: A && B ? Math.round((B.lo - A.hi) / YEAR) : null, examples: safeJson(z.examples, []), note: z.note, plays: z.plays || 0,
    number: z.date ? lifelineNumber(env, z.date) : null
  };
}

/** "1941-12-07" stays a day (or a year, when prec says so); "1543" becomes a year; "44 BCE" / "-44" becomes -0044 (a year). → { date, prec } or null. */
export function readDate(v, prec) {
  const s = String(v || '').trim();
  let m = /^(-?)(\d{1,4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { date: `${m[1]}${m[2].padStart(4, '0')}-${m[3]}-${m[4]}`, prec: Number(prec) === PREC.YEAR ? PREC.YEAR : PREC.DAY };
  m = /^(-?)(\d{1,4})$/.exec(s) || /^(\d{1,4})\s*(?:BCE|BC)$/i.exec(s);
  if (m) {
    const neg = m[1] === '-' || /BC/i.test(s), y = (m[2] || m[1]).padStart(4, '0');
    return { date: `${neg ? '-' : ''}${y}-01-01`, prec: PREC.YEAR };
  }
  return null;
}

/* ───────────── Checking a pair ───────────── */

/** Each example name looked up and scored: those alive for both, plus what went wrong with the rest. */
async function checkExamples(env, z, names) {
  const ok = [], notes = [];
  const { a, b } = eventsOf(z);
  for (const n of names.slice(0, 6)) {
    try {
      const f = await findPerson(env, n);
      const p = f.person || (f.choices && f.choices[0]);
      if (!p) { notes.push(`${n}: not found on Wikipedia`); continue; }
      const life = lifeOf(p);
      if (life.error) { notes.push(`${n}: no dates`); continue; }
      const r = scoreLife(life, eventSpan(a), eventSpan(b));
      if (r.score === ROUND_MAX) ok.push(p.name); else notes.push(`${n}: not alive for both (${showDate(p.birth, p.birthPrec)} – ${p.death ? showDate(p.death, p.deathPrec) : 'today'})`);
    } catch (e) { notes.push(`${n}: ${e.message}`); }
  }
  return { ok, notes };
}

/** An event's date on Wikidata (point in time / start time / inception / publication), from its English Wikipedia title. */
async function wikidataDate(title) {
  if (!title) return null;
  try {
    const w = await (await fetch('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', titles: title, redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item', format: 'json' }), { headers: UA })).json();
    const page = Object.values((w.query && w.query.pages) || {})[0];
    const qid = page && page.pageprops && page.pageprops.wikibase_item;
    if (!qid) return null;
    const d = await (await fetch('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids: qid, props: 'claims', format: 'json' }), { headers: UA })).json();
    const claims = (d.entities[qid] || {}).claims || {};
    for (const p of ['P585', 'P580', 'P571', 'P577']) {
      const c = (claims[p] || []).find(x => x.mainsnak && x.mainsnak.snaktype === 'value');
      if (c) { const v = c.mainsnak.datavalue.value; return { date: v.time.replace(/^\+/, '').replace(/T.*$/, ''), prec: v.precision }; }
    }
  } catch { /* no check, then */ }
  return null;
}
const sameYear = (x, y) => x && y && x.date.slice(0, x.date.startsWith('-') ? 5 : 4) === y.date.slice(0, y.date.startsWith('-') ? 5 : 4);

/* ───────────── AI drafts ───────────── */

const GEN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rounds: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          round: { type: 'NUMBER' },
          eventA: { type: 'STRING' }, dateA: { type: 'STRING' }, wikiA: { type: 'STRING' },
          eventB: { type: 'STRING' }, dateB: { type: 'STRING' }, wikiB: { type: 'STRING' },
          examples: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['round', 'eventA', 'dateA', 'wikiA', 'eventB', 'dateB', 'wikiB', 'examples']
      }
    }
  },
  required: ['rounds']
};

export const RULES = [
  'Round 1 (easy): two famous modern events (after 1800) 20 to 45 years apart. Lots of well-known people were alive for both.',
  'Round 2 (medium): two famous events 45 to 70 years apart (after 1700). Only a handful of famous people lived through both.',
  'Round 3 (hard): two events before 1750 (any era, even BCE) 15 to 60 years apart, where only a few famous people were alive for both.'
];

function genPrompt(date, avoid) {
  return [
    'You write puzzles for "Lifeline", a daily history game. Each round shows two real historical events. The player names one real, famous person who was alive on BOTH dates.',
    'Write one day: three rounds.',
    ...RULES.map(r => '- ' + r),
    '- Events must be famous, with one well-known exact date (YYYY-MM-DD; for BCE write -0044-03-15). Use a plain year (like 1543) only when the day really is unknown.',
    '- "eventA" is the earlier event, written as a short plain sentence ("The Battle of Waterloo", "Sputnik 1 is launched"). Never put the date or year in the event text.',
    '- "wikiA" / "wikiB": the exact English Wikipedia article title for each event.',
    '- "examples": 3 to 5 famous people (full names as on Wikipedia) who were alive on both dates. Double-check birth and death dates.',
    '- Mix it up: politics, science, art, music, sport, exploration, inventions, from all over the world.',
    avoid.length ? '- Do NOT reuse any of these recent events: ' + avoid.slice(0, 80).join('; ') + '.' : '',
    `(The day is ${date}.)`
  ].filter(Boolean).join('\n');
}

/** Recent event names, so drafts don't repeat them. */
async function recentEvents(env) {
  const rows = (await env.DB.prepare(`SELECT a_label, b_label FROM lifeline_puzzles WHERE status != 'rejected' ORDER BY id DESC LIMIT 120`).all()).results;
  return [...new Set(rows.flatMap(r => [r.a_label, r.b_label]))];
}

/**
 * One AI-written day, checked: dates readable and in order, each event's year matching Wikidata when it
 * has a date, and only examples who really were alive for both kept. → [{ round, ...pair, examples, note }] (may be short).
 */
async function aiDay(env, date) {
  if (env.MOCK_AI === '1') return [];
  const res = await callAI(env, genPrompt(date, await recentEvents(env)), GEN_SCHEMA, 'lifeline-generate', '', 0.8, { timeout: 25000, retries: 1 });
  const out = [];
  for (const r of (Array.isArray(res.rounds) ? res.rounds : [])) {
    const round = Number(r.round);
    if (![1, 2, 3].includes(round) || out.some(x => x.round === round)) continue;
    const A = readDate(r.dateA), B = readDate(r.dateB);
    if (!A || !B) continue;
    const p = { round, aLabel: clampStr(r.eventA, 140), aDate: A.date, aPrec: A.prec, bLabel: clampStr(r.eventB, 140), bDate: B.date, bPrec: B.prec };
    if (pairProblem(p)) continue;
    const notes = [];
    const [wa, wb] = await Promise.all([wikidataDate(r.wikiA), wikidataDate(r.wikiB)]);
    if (wa && !sameYear(wa, A)) notes.push(`Wikidata dates "${r.wikiA}" to ${showDate(wa.date, wa.prec)}.`);
    if (wb && !sameYear(wb, B)) notes.push(`Wikidata dates "${r.wikiB}" to ${showDate(wb.date, wb.prec)}.`);
    if (!wa || !wb) notes.push('One date couldn\'t be checked on Wikidata.');
    const fake = { a_label: p.aLabel, a_date: p.aDate, a_prec: p.aPrec, b_label: p.bLabel, b_date: p.bDate, b_prec: p.bPrec };
    const ex = await checkExamples(env, fake, (Array.isArray(r.examples) ? r.examples : []).map(String));
    if (!ex.ok.length) notes.push('None of the AI\'s examples checked out: make sure someone famous fits.');
    if (ex.notes.length) notes.push('Dropped: ' + ex.notes.join('; ') + '.');
    out.push({ ...p, examples: ex.ok, note: notes.join(' ') || 'Dates and examples checked.' });
  }
  return out.sort((a, b) => a.round - b.round);
}

/** AI drafts for one day (body.date) or the next few empty days (body.from, body.days). */
export async function generate(env, body) {
  const db = env.DB;
  const dates = [];
  if (isDate(body.date)) dates.push(body.date);
  else {
    const from = isDate(body.from) ? body.from : addDays(todayUTC(), 1);
    const n = Math.max(1, Math.min(5, Number(body.days) || 3));
    for (let i = 0, d = from; i < 30 && dates.length < n; i++, d = addDays(d, 1)) {
      const taken = (await db.prepare(`SELECT COUNT(DISTINCT round) AS n FROM lifeline_puzzles WHERE date = ? AND status IN ('approved','auto','draft')`).bind(d).first()).n;
      if (taken < ROUNDS) dates.push(d);
    }
  }
  let made = 0;
  const want = Number(body.round) || 0;
  for (const date of dates) {
    // A pair is only kept when at least one famous person really was alive for both; the AI gets a second go at the rest.
    const have = {};
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const r of await aiDay(env, date)) if (!have[r.round] && r.examples.length) have[r.round] = r;
      if ([1, 2, 3].every(n => have[n] || (want && n !== want))) break;
    }
    for (const r of Object.values(have)) {
      if (want && r.round !== want) continue;
      await insertPuzzle(env, date, r.round, 'draft', r);
      made++;
    }
  }
  if (!made && env.MOCK_AI !== '1') throw new HttpError(503, 'The AI didn\'t come up with anything usable. Try again.');
  return { made };
}

/** While someone plays, keep a few days of drafts ahead (at most once an hour). */
export async function maybeGenerate(env) {
  try {
    if (env.MOCK_AI === '1') return;
    const recent = await env.DB.prepare(`SELECT 1 FROM lifeline_puzzles WHERE status = 'draft' AND created_at > ? LIMIT 1`).bind(new Date(Date.now() - 3600e3).toISOString()).first();
    if (recent) return;
    const tomorrow = addDays(todayUTC(), 1);
    const ready = (await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS n FROM lifeline_puzzles WHERE date BETWEEN ? AND ? AND status IN ('approved','draft')`)
      .bind(tomorrow, addDays(tomorrow, 6)).first()).n;
    if (ready < 4) await generate(env, { from: tomorrow, days: 1 });
  } catch (e) { console.error('lifeline auto-generate', e.message); }
}

/* ───────────── Calendar ───────────── */

export async function calendar(env, q) {
  const from = isDate(q.get('from')) ? q.get('from') : addDays(todayUTC(), -14);
  const to = isDate(q.get('to')) ? q.get('to') : addDays(todayUTC(), 30);
  const rows = (await env.DB.prepare(`SELECT z.*, (SELECT COUNT(*) FROM lifeline_plays pl WHERE pl.puzzle_id = z.id) AS plays
      FROM lifeline_puzzles z WHERE z.date BETWEEN ? AND ? AND z.status != 'rejected' ORDER BY z.date, z.round, z.id`).bind(from, to).all()).results;
  return { from, to, today: todayUTC(), launch: launchDate(env), rules: RULES, puzzles: rows.map(z => adminPuzzle(z, env)) };
}

/** Create or update a puzzle. Approving demotes any other live puzzle for that day and round (unless it's been played). */
export async function savePuzzle(env, body) {
  const db = env.DB;
  const A = readDate(body.aDate, body.aPrec), B = readDate(body.bDate, body.bPrec);
  if (!A || !B) throw new HttpError(400, 'Use dates like 1941-12-07, a year like 1543, or -44 for 44 BCE.');
  const p = { aLabel: body.aLabel, aDate: A.date, aPrec: A.prec, bLabel: body.bLabel, bDate: B.date, bPrec: B.prec,
    examples: Array.isArray(body.examples) ? body.examples : String(body.examples || '').split(/\s*;\s*/), note: body.note || '' };
  const bad = pairProblem(p);
  if (bad) throw new HttpError(400, bad);
  const status = ['draft', 'approved', 'rejected'].includes(body.status) ? body.status : 'draft';
  const date = isDate(body.date) ? body.date : null, round = Number(body.round);
  if (![1, 2, 3].includes(round)) throw new HttpError(400, 'Round 1, 2 or 3.');
  let id = Number(body.id) || 0;
  if (status === 'approved' && date) {
    const live = (await db.prepare(`SELECT z.id, (SELECT COUNT(*) FROM lifeline_plays pl WHERE pl.puzzle_id = z.id) AS plays FROM lifeline_puzzles z
        WHERE z.date = ? AND z.round = ? AND z.${LIVE} AND z.id != ?`).bind(date, round, id).all()).results;
    if (live.some(x => x.plays > 0)) throw new HttpError(409, 'People already played that round. Edit it instead.');
    for (const x of live) await db.prepare(`UPDATE lifeline_puzzles SET status = 'draft' WHERE id = ?`).bind(x.id).run();
  }
  const ex = JSON.stringify(p.examples.map(x => clampStr(x, 80)).filter(Boolean).slice(0, 5));
  if (id) {
    const old = await getPuzzle(env, id);
    const keep = old.status === 'auto' && status === 'draft' ? 'auto' : status;
    await db.prepare(`UPDATE lifeline_puzzles SET date = ?, round = ?, status = ?, a_label = ?, a_date = ?, a_prec = ?, b_label = ?, b_date = ?, b_prec = ?, examples = ?, note = ? WHERE id = ?`)
      .bind(date, round, keep, clampStr(p.aLabel, 140), p.aDate, p.aPrec, clampStr(p.bLabel, 140), p.bDate, p.bPrec, ex, clampStr(p.note, 300), id).run();
    await rescore(env, { puzzleId: id });
  } else id = (await insertPuzzle(env, date, round, status, p)).id;
  // Check the examples now, so the calendar shows which of them really fit.
  const z = await getPuzzle(env, id);
  const check = body.check ? await checkExamples(env, z, safeJson(z.examples, [])) : null;
  return { puzzle: adminPuzzle(z, env), check };
}

export async function deletePuzzle(env, body) {
  const z = await getPuzzle(env, body.id);
  const plays = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM lifeline_plays WHERE puzzle_id = ?`).bind(z.id).first()).n;
  if (plays) throw new HttpError(409, 'People played this one; it can\'t be deleted.');
  await env.DB.prepare(`DELETE FROM lifeline_puzzles WHERE id = ?`).bind(z.id).run();
  return { ok: true };
}

/* ───────────── Dashboard ───────────── */

export async function dashboard(env) {
  const db = env.DB, date = todayUTC(), from = addDays(date, -13);
  const [players, finished, ever, rounds, open, week, scores, totals, ahead] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT pl.player_id) AS n FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id WHERE z.date = ? AND pl.mode = 'daily'`).bind(date).first(),
    db.prepare(`SELECT COUNT(*) AS n, AVG(t) AS avg FROM (SELECT SUM(pl.score) AS t FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
        WHERE z.date = ? AND pl.mode = 'daily' GROUP BY pl.player_id HAVING COUNT(*) >= 3)`).bind(date).first(),
    db.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM lifeline_plays`).first(),
    db.prepare(`SELECT z.*, COUNT(pl.id) AS plays, AVG(pl.score) AS avg, SUM(pl.kind = 'both') AS perfect FROM lifeline_puzzles z
        LEFT JOIN lifeline_plays pl ON pl.puzzle_id = z.id AND pl.mode = 'daily' WHERE z.date = ? AND z.${LIVE} GROUP BY z.id ORDER BY z.round`).bind(date).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM lifeline_reports WHERE status = 'open'`).first(),
    db.prepare(`SELECT z.date, COUNT(DISTINCT pl.player_id) AS n FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
        WHERE pl.mode = 'daily' AND z.date >= ? GROUP BY z.date`).bind(from).all(),
    db.prepare(`SELECT pl.score FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id WHERE z.date = ? AND pl.mode = 'daily'`).bind(date).all(),
    db.prepare(`SELECT SUM(pl.score) AS t FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
        WHERE z.date = ? AND pl.mode = 'daily' GROUP BY pl.player_id HAVING COUNT(*) >= 3`).bind(date).all(),
    db.prepare(`SELECT date, round, status FROM lifeline_puzzles WHERE date > ? AND date <= ? AND status IN ('approved','auto','draft')`).bind(date, addDays(date, 7)).all()
  ]);
  const byDate = Object.fromEntries(week.results.map(w => [w.date, w.n]));
  const top = rounds.results.length ? (await db.prepare(`SELECT z.round, pl.name, COUNT(*) AS n FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE z.date = ? AND pl.mode = 'daily' GROUP BY z.round, pl.qid ORDER BY n DESC`).bind(date).all()).results : [];
  return {
    date, number: lifelineNumber(env, date), launch: launchDate(env), players: players.n, finished: finished.n, avgDay: finished.avg == null ? null : Math.round(finished.avg),
    ever: ever.n, openComplaints: open.n,
    rounds: rounds.results.map(z => ({ ...adminPuzzle(z, env), plays: z.plays, avg: z.avg == null ? null : Math.round(z.avg), perfect: z.perfect || 0,
      top: top.filter(t => t.round === z.round).slice(0, 3) })),
    week: Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)).map(d => ({ date: d, n: byDate[d] || 0 })),
    rHist: spread(scores.results.map(r => r.score), ROUND_MAX), dHist: spread(totals.results.map(r => r.t || 0), DAY_MAX),
    next: Array.from({ length: 7 }, (_, i) => addDays(date, i + 1)).map(d => ({
      date: d,
      parts: [1, 2, 3].map(r => {
        const list = ahead.results.filter(a => a.date === d && a.round === r);
        return list.some(a => a.status === 'approved' || a.status === 'auto') ? 'approved' : list.length ? 'draft' : 'empty';
      })
    }))
  };
}

/* ───────────── Reports and people ───────────── */

export async function reports(env, q) {
  const status = ['open', 'fixed', 'dismissed'].includes(q.get('status')) ? q.get('status') : 'open';
  const rows = (await env.DB.prepare(`SELECT r.*, pl.name, pl.input, pl.score, z.date, z.round, z.a_label, z.a_date, z.a_prec, z.b_label, z.b_date, z.b_prec
      FROM lifeline_reports r JOIN lifeline_plays pl ON pl.id = r.play_id JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE r.status = ? ORDER BY r.id DESC LIMIT 100`).bind(status).all()).results;
  const out = [];
  for (const r of rows) out.push({ ...r, person: await personById(env, r.qid) });
  return { status, reports: out };
}

/** Saves an admin's dates for a person, then rescores every play that named them. */
export async function savePerson(env, body) {
  const p = await personById(env, body.qid);
  if (!p) throw new HttpError(404, 'Person not found.');
  const B = readDate(body.birth), D = body.death ? readDate(body.death) : null;
  if (!B || (body.death && !D)) throw new HttpError(400, 'Use dates like 1809-02-12, or a year like 1450.');
  await env.DB.prepare(`INSERT INTO lifeline_people (qid, name, descr, birth, birth_prec, death, death_prec, links, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?) ON CONFLICT(qid) DO UPDATE SET birth = excluded.birth, birth_prec = excluded.birth_prec,
      death = excluded.death, death_prec = excluded.death_prec, source = 'admin', updated_at = excluded.updated_at`)
    .bind(p.qid, p.name, p.descr || '', B.date, B.prec, D ? D.date : '', D ? D.prec : PREC.DAY, p.links || 0, nowISO()).run();
  const rescored = await rescore(env, { qid: p.qid });
  return { person: await personById(env, p.qid), rescored };
}

export async function resolveReport(env, body) {
  const r = await env.DB.prepare(`SELECT * FROM lifeline_reports WHERE id = ?`).bind(Number(body.id)).first();
  if (!r) throw new HttpError(404, 'Report not found.');
  let rescored = 0;
  if (body.action === 'fix') rescored = (await savePerson(env, { qid: r.qid, birth: body.birth, death: body.death })).rescored;
  const status = body.action === 'fix' ? 'fixed' : 'dismissed';
  await env.DB.prepare(`UPDATE lifeline_reports SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?`).bind(status, clampStr(body.note, 300), nowISO(), r.id).run();
  return { ok: true, rescored };
}

/** People named so far (most named first), or a search across them and the built-in list. */
export async function people(env, q) {
  const s = String(q.get('q') || '').trim();
  const db = env.DB;
  if (!s) {
    const rows = (await db.prepare(`SELECT qid, name, COUNT(*) AS n, AVG(score) AS avg FROM lifeline_plays GROUP BY qid ORDER BY n DESC LIMIT 60`).all()).results;
    const out = [];
    for (const r of rows) out.push({ ...(await personById(env, r.qid)), named: r.n, avg: Math.round(r.avg) });
    return { people: out };
  }
  const rows = (await db.prepare(`SELECT * FROM lifeline_people WHERE name LIKE ? ORDER BY links DESC LIMIT 20`).bind('%' + s + '%').all()).results;
  const seen = new Set(rows.map(r => r.qid));
  const list = [...rows.map(r => ({ qid: r.qid, name: r.name, descr: r.descr, birth: r.birth, birthPrec: r.birth_prec, death: r.death, deathPrec: r.death_prec, source: r.source })),
    ...builtinMatches(s).filter(p => !seen.has(p.qid))];
  return { people: list.slice(0, 30) };
}

/* ───────────── Paste-in import ───────────── */

/**
 * One DAY block per day, one line per round:
 *   DAY 2026-11-02            (the date is optional)
 *   1 | The attack on Pearl Harbor | 1941-12-07 | The Apollo 11 Moon landing | 1969-07-20 | Ronald Reagan; Elizabeth II
 */
export function parseLifeline(text) {
  return blocks(String(text || '').replace(/^\s*(?:#+\s*)?day\s+(\d{4}-\d{2}-\d{2})\s*$/gim, 'DAY\ndate: $1')).map(lines => {
    const day = { date: null, rounds: [], errors: [] };
    for (const line of lines) {
      const dm = /^date\s*:\s*(.+)$/i.exec(line);
      if (dm) { if (isDate(dm[1].trim())) day.date = dm[1].trim(); else day.errors.push(`"${dm[1]}" isn't a YYYY-MM-DD date.`); continue; }
      const f = line.split('|').map(s => s.trim());
      const round = Number(String(f[0]).replace(/^(?:r|round)\s*/i, ''));
      if (f.length < 5 || ![1, 2, 3].includes(round)) { day.errors.push(`Couldn't read: "${line}"`); continue; }
      const A = readDate(f[2]), B = readDate(f[4]);
      if (!A || !B) { day.errors.push(`Round ${round}: dates like 1941-12-07, 1543 or -44.`); continue; }
      const p = { round, aLabel: f[1], aDate: A.date, aPrec: A.prec, bLabel: f[3], bDate: B.date, bPrec: B.prec, examples: String(f[5] || '').split(/\s*;\s*/).filter(Boolean) };
      const bad = pairProblem(p);
      if (bad) { day.errors.push(`Round ${round}: ${bad}`); continue; }
      if (day.rounds.some(x => x.round === round)) { day.errors.push(`Round ${round} is there twice.`); continue; }
      day.rounds.push({ ...p, aWhen: showDate(A.date, A.prec), bWhen: showDate(B.date, B.prec), years: Math.round((eventSpan({ date: B.date, prec: B.prec }).lo - eventSpan({ date: A.date, prec: A.prec }).hi) / YEAR) });
    }
    if (!day.rounds.length && !day.errors.length) day.errors.push('No rounds in this day.');
    return day;
  });
}

export async function importLifeline(env, body) {
  const days = parseLifeline(body.text);
  if (!days.length) throw new HttpError(400, 'Nothing to import. Paste the LLM\'s answer.');
  const first = addDays(todayUTC(), 1) > launchDate(env) ? addDays(todayUTC(), 1) : launchDate(env);
  const taken = new Set((await env.DB.prepare(`SELECT DISTINCT date FROM lifeline_puzzles WHERE date >= ? AND status = 'approved'`).bind(first).all()).results.map(r => r.date));
  days.filter(d => d.date).forEach(d => taken.add(d.date));
  for (const d of days) {
    if (d.errors.length || !d.rounds.length || d.date) continue;
    let x = first; while (taken.has(x)) x = addDays(x, 1); taken.add(x); d.date = x;
  }
  let added = 0;
  if (!body.dryRun) {
    for (const d of days) {
      if (d.errors.length || !d.date) continue;
      for (const r of d.rounds) {
        try { await savePuzzle(env, { ...r, date: d.date, status: 'approved', aDate: r.aDate, bDate: r.bDate, examples: r.examples }); added++; }
        catch (e) { d.errors.push(`Round ${r.round}: ${e.message}`); }
      }
    }
  }
  return { game: 'lifeline', dryRun: !!body.dryRun, added, days };
}

export async function avoid(env) {
  return { text: (await recentEvents(env)).join('; ') };
}
