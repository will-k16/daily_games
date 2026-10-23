// Lifeline: each day has three pairs of historical events (easy, medium, hard). For each pair you name one
// real person who was alive for both, and get one guess. This file: making the day, the guess (with "which
// one did you mean?"), results, archive, stats, reports and rescoring.
import { tipUrl, HttpError, nowISO, todayUTC, addDays, dayIndex, isDate, clampStr, safeJson } from './util.js';
import { bucksBalance, raceLookOf } from './bucks.js';
import { crowd as crowdOf, spread } from '../../public/js/charts.js';
import { streaks } from './venn.js';
import { findPerson, personById, builtinByName } from './lifeline-wiki.js';
import { BANK } from './lifeline-bank.js';
import {
  ROUNDS, ROUND_MAX, DAY_MAX, PREC, lifeOf, eventSpan, scoreLife, showDate, bucksForRound, DAY_BONUS
} from '../../public/js/lifeline-score.js';

const LIVE = `status IN ('approved','auto')`;
const MODES = ['daily', 'archive', 'unlimited'];
const MAX_INPUT = 80;

export function lifelineNumber(env, date) {
  if (!isDate(date)) return null;
  const launch = isDate(env.LIFELINE_LAUNCH_DATE) ? env.LIFELINE_LAUNCH_DATE : date;
  return Math.max(1, dayIndex(date) - dayIndex(launch) + 1);
}
export const launchDate = env => (isDate(env.LIFELINE_LAUNCH_DATE) ? env.LIFELINE_LAUNCH_DATE : '2026-10-23');
export const isOpen = (env, date = todayUTC()) => date >= launchDate(env);

/* ───────────── Puzzles ───────────── */

export const eventsOf = z => ({ a: { label: z.a_label, date: z.a_date, prec: z.a_prec }, b: { label: z.b_label, date: z.b_date, prec: z.b_prec } });

/** What a player sees of a puzzle (the examples only once they've played it). */
function publicPuzzle(z, played) {
  const { a, b } = eventsOf(z);
  const show = e => ({ label: e.label, date: e.date, prec: e.prec, when: showDate(e.date, e.prec) });
  return { id: z.id, date: z.date, round: z.round, a: show(a), b: show(b), ...(played ? { examples: safeJson(z.examples, []) } : {}) };
}

export async function getPuzzle(env, id) {
  const z = await env.DB.prepare(`SELECT * FROM lifeline_puzzles WHERE id = ?`).bind(Number(id)).first();
  if (!z) throw new HttpError(404, 'Puzzle not found.');
  return z;
}

/** Checks a pair of events: both dates readable, in order, and not the same day. Returns an error message or ''. */
export function pairProblem(p) {
  const A = eventSpan({ date: p.aDate, prec: p.aPrec }), B = eventSpan({ date: p.bDate, prec: p.bPrec });
  if (!clampStr(p.aLabel, 140) || !clampStr(p.bLabel, 140)) return 'Both events need a name.';
  if (!A || !B) return 'Use dates like 1941-12-07, a year like 1543, or -0044-03-15 for BCE.';
  if (B.lo <= A.hi) return 'The second event has to come after the first.';
  return '';
}

/** Inserts a puzzle. p: { aLabel, aDate, aPrec, bLabel, bDate, bPrec, examples, note }. */
export async function insertPuzzle(env, date, round, status, p) {
  return env.DB.prepare(`INSERT INTO lifeline_puzzles (date, round, status, a_label, a_date, a_prec, b_label, b_date, b_prec, examples, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(date, round, status, clampStr(p.aLabel, 140), p.aDate, Number(p.aPrec) || PREC.DAY, clampStr(p.bLabel, 140), p.bDate, Number(p.bPrec) || PREC.DAY,
      JSON.stringify((p.examples || []).map(x => clampStr(x, 80)).filter(Boolean).slice(0, 5)), clampStr(p.note, 300), nowISO()).first();
}

/** The built-in bank's day for a date: they take turns, starting with the first on launch day. */
export function bankDay(env, date) {
  const i = ((dayIndex(date) - dayIndex(launchDate(env))) % BANK.length + BANK.length) % BANK.length;
  return BANK[i].map(r => ({ round: r.round, aLabel: r.a.label, aDate: r.a.date, aPrec: r.a.prec, bLabel: r.b.label, bDate: r.b.date, bPrec: r.b.prec, examples: r.examples, note: 'From the built-in bank.' }));
}

/**
 * A day's three puzzles. For each round: the approved one; else its newest draft, used as-is; else
 * the built-in bank's. The pick is saved (as 'auto') so the day never changes under anyone.
 */
export async function ensureDay(env, date) {
  const db = env.DB;
  let live = (await db.prepare(`SELECT * FROM lifeline_puzzles WHERE date = ? AND ${LIVE} ORDER BY round`).bind(date).all()).results;
  if (live.length >= ROUNDS || date > todayUTC()) return live;
  const bank = bankDay(env, date);
  for (let round = 1; round <= ROUNDS; round++) {
    if (live.some(z => z.round === round)) continue;
    const draft = await db.prepare(`SELECT id FROM lifeline_puzzles WHERE date = ? AND round = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`).bind(date, round).first();
    try {
      if (draft) await db.prepare(`UPDATE lifeline_puzzles SET status = 'auto' WHERE id = ?`).bind(draft.id).run();
      else await insertPuzzle(env, date, round, 'auto', bank.find(b => b.round === round));
    } catch { /* someone else filled it a moment ago */ }
  }
  live = (await db.prepare(`SELECT * FROM lifeline_puzzles WHERE date = ? AND ${LIVE} ORDER BY round`).bind(date).all()).results;
  return live;
}

const dayRows = (env, date) => env.DB.prepare(`SELECT * FROM lifeline_puzzles WHERE date = ? AND ${LIVE} ORDER BY round`).bind(date).all().then(r => r.results);

function checkAccess(env, z, mode, who) {
  const today = todayUTC();
  if (mode === 'unlimited') { if (who.isAdmin && z.status === 'unlimited') return; throw new HttpError(403, 'Unlimited is for admins.'); }
  const live = z.status === 'approved' || z.status === 'auto';
  if (!isOpen(env, today)) throw new HttpError(403, 'Lifeline opens soon.');
  if (mode === 'daily' && live && z.date === today) return;
  if (mode === 'archive' && live && z.date && z.date < today && z.date >= launchDate(env)) return;
  throw new HttpError(403, 'You can\'t play that one right now.');
}
const modeOf = m => (MODES.includes(m) ? m : 'daily');
/** The rounds that go with a puzzle: its day's three, or just itself in unlimited. */
const rowsFor = (env, z, mode) => (mode === 'unlimited' ? [z] : dayRows(env, z.date));

/* ───────────── People and scores ───────────── */

/** A person as the browser shows them, with their lifespan as drawn and why it scored what it did. */
export function personView(p, z) {
  const life = lifeOf(p);
  const { a, b } = eventsOf(z);
  const r = scoreLife(life, eventSpan(a), eventSpan(b));
  return {
    qid: p.qid, name: p.name, descr: p.descr, living: !!life.living,
    birth: p.birth, birthPrec: p.birthPrec, death: p.death, deathPrec: p.deathPrec,
    born: showDate(p.birth, p.birthPrec), died: p.death ? showDate(p.death, p.deathPrec) : '',
    from: life.from, to: life.to, ...r
  };
}

/** Why someone can't be scored, or ''. */
function lifeProblem(p) {
  const life = lifeOf(p);
  if (life.error === 'no-birth') return `Wikipedia doesn't say when ${p.name} was born, so there's nothing to measure. Try someone else.`;
  if (life.error === 'no-death') return `Wikipedia doesn't say when ${p.name} died. Try someone else.`;
  return '';
}
const choiceView = p => ({ qid: p.qid, name: p.name, descr: p.descr });

async function getPlay(env, playerId, puzzleId, mode) {
  return env.DB.prepare(`SELECT * FROM lifeline_plays WHERE player_id = ? AND puzzle_id = ? AND mode = ?`).bind(playerId, puzzleId, mode).first();
}

/** A finished round: your person, the examples, what others named, how everyone did. */
async function results(env, who, z, mode, play) {
  const db = env.DB;
  const person = await personById(env, play.qid);
  const you = person ? personView(person, z) : { qid: play.qid, name: play.name, score: play.score, kind: play.kind };
  you.score = play.score; you.kind = play.kind;
  const picks = (await db.prepare(`SELECT qid, name, COUNT(*) AS n, MAX(score) AS score FROM lifeline_plays
      WHERE puzzle_id = ? AND mode IN ('daily','archive') GROUP BY qid ORDER BY n DESC, score DESC, name LIMIT 6`).bind(z.id).all()).results;
  const players = (await db.prepare(`SELECT COUNT(*) AS n FROM lifeline_plays WHERE puzzle_id = ? AND mode IN ('daily','archive')`).bind(z.id).first()).n;
  let everyone = null;
  if (mode === 'daily') {
    const rows = (await db.prepare(`SELECT player_id AS player, score FROM lifeline_plays WHERE puzzle_id = ? AND mode = 'daily'`).bind(z.id).all()).results;
    everyone = crowdOf(rows, who.player.id, play.score, ROUND_MAX);
  }
  // Examples with their dates (from the built-in list), skipping whoever you named.
  const examples = safeJson(z.examples, []).filter(n => n && n !== you.name).slice(0, 3).map(n => {
    const p = builtinByName(n);
    return p ? { name: p.name, descr: p.descr, born: showDate(p.birth, p.birthPrec), died: p.death ? showDate(p.death, p.deathPrec) : '' } : { name: n };
  });
  const report = await db.prepare(`SELECT status FROM lifeline_reports WHERE play_id = ? AND player_id = ?`).bind(play.id, who.player.id).first();
  return { playId: play.id, you, examples, picks: picks.map(p => ({ ...p, mine: p.qid === play.qid })), players, everyone, report: report ? report.status : null };
}

/** Every round of a day with your result for each played one, and the summary once all three are done. */
async function dayState(env, who, date, mode, rows) {
  const rounds = [];
  for (const z of rows) {
    const play = await getPlay(env, who.player.id, z.id, mode);
    rounds.push({ puzzle: publicPuzzle(z, !!play), mode, result: play ? await results(env, who, z, mode, play) : null });
  }
  const done = rounds.filter(r => r.result);
  const total = done.reduce((t, r) => t + r.result.you.score, 0);
  let summary = null;
  if (done.length >= ROUNDS) {
    let everyone = null;
    if (mode === 'daily') {
      const rows2 = (await env.DB.prepare(`SELECT pl.player_id AS player, SUM(pl.score) AS score FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
          WHERE z.date = ? AND pl.mode = 'daily' GROUP BY pl.player_id HAVING COUNT(*) >= ?`).bind(date, ROUNDS).all()).results;
      everyone = crowdOf(rows2, who.player.id, total, DAY_MAX);
    }
    const bucks = done.reduce((t, r) => t + bucksForRound(r.result.you.score, mode), 0) + (mode === 'daily' ? DAY_BONUS : 0);
    summary = { total, bucks, everyone };
  }
  return { date, number: lifelineNumber(env, date), mode, rounds, done: done.length, total, summary };
}

/* ───────────── Endpoints ───────────── */

export async function today(env, who) {
  const date = todayUTC();
  const base = { me: { signedIn: who.signedIn, email: who.email, isAdmin: who.isAdmin, hasPassword: who.hasPassword, race: raceLookOf(who.player) },
    bucks: await bucksBalance(env, who.player.id), tipUrl: tipUrl(env), nextReset: addDays(date, 1) + 'T00:00:00Z' };
  if (!isOpen(env, date)) return { ...base, notYet: true, opensAt: launchDate(env) + 'T00:00:00Z', date };
  const rows = await ensureDay(env, date);
  const state = await dayState(env, who, date, 'daily', rows);
  const notes = (await env.DB.prepare(`SELECT r.id, r.status, r.admin_note, p.name FROM lifeline_reports r JOIN lifeline_plays p ON p.id = r.play_id
      WHERE r.player_id = ? AND r.status != 'open' AND r.seen = 0`).bind(who.player.id).all()).results;
  return { ...base, ...state, notifications: notes };
}

/**
 * The one guess for a round. body: { puzzleId, mode, input } or { puzzleId, mode, qid } (after picking
 * from "which one?"). → { status: 'scored', ...day } | { status: 'choose', choices } | { status: 'invalid', reason }.
 * A second guess for a round you've played just returns the round as it stands.
 */
export async function guess(env, who, body) {
  const mode = modeOf(body.mode);
  const z = await getPuzzle(env, body.puzzleId);
  checkAccess(env, z, mode, who);
  if (mode === 'archive' && await playedOnTheDay(env, who, z.date)) throw new HttpError(409, 'You played this day already.');
  const already = await getPlay(env, who.player.id, z.id, mode);
  if (already) return { status: 'scored', round: z.round, ...(await dayState(env, who, z.date, mode, await rowsFor(env, z, mode))) };

  const input = clampStr(body.input, 200).replace(/\s+/g, ' ');
  let person = null;
  if (body.qid) person = await personById(env, String(body.qid));
  else {
    if (!input) return { status: 'invalid', reason: 'Type the name of a real person.' };
    if (input.length > MAX_INPUT) return { status: 'invalid', reason: `Keep it under ${MAX_INPUT} characters.` };
    const found = await findPerson(env, input);
    if (found.none) return { status: 'invalid', reason: `Couldn't find a real person called “${input}” on Wikipedia. Check the spelling, or try their full name.` };
    if (found.choices) {
      const ok = found.choices.filter(p => p && !lifeProblem(p));
      if (ok.length === 1) person = ok[0];
      else if (ok.length) return { status: 'choose', input, choices: ok.map(choiceView) };
      else return { status: 'invalid', reason: lifeProblem(found.choices[0]) || 'Couldn\'t find dates for that person.' };
    } else person = found.person;
  }
  if (!person) return { status: 'invalid', reason: 'Couldn\'t find that person. Try their full name.' };
  const problem = lifeProblem(person);
  if (problem) return { status: 'invalid', reason: problem };

  const v = personView(person, z);
  await env.DB.prepare(`INSERT OR IGNORE INTO lifeline_plays (player_id, puzzle_id, mode, input, qid, name, score, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(who.player.id, z.id, mode, input || person.name, person.qid, person.name, v.score, v.kind, nowISO()).run();
  const state = await dayState(env, who, z.date, mode, await rowsFor(env, z, mode));
  return { status: 'scored', round: z.round, ...state, bucks: await bucksBalance(env, who.player.id) };
}

/* ───────────── Archive ───────────── */

async function playedOnTheDay(env, who, date) {
  const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND z.date = ? AND pl.mode = 'daily'`).bind(who.player.id, date).first()).n;
  return n >= ROUNDS;
}

export async function archiveList(env, who) {
  const today = todayUTC(), launch = launchDate(env);
  const dates = [];
  for (let d = addDays(today, -1); d >= launch; d = addDays(d, -1)) dates.push(d);
  const mine = (await env.DB.prepare(`SELECT z.date, z.round, pl.mode, pl.score FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND z.date < ?`).bind(who.player.id, today).all()).results;
  const view = (date, mode) => {
    const r = mine.filter(x => x.date === date && x.mode === mode);
    return r.length ? { done: r.length, total: r.reduce((t, x) => t + x.score, 0), rounds: [1, 2, 3].map(n => { const x = r.find(y => y.round === n); return x ? x.score : null; }) } : null;
  };
  return { days: dates.map(date => ({ date, number: lifelineNumber(env, date), daily: view(date, 'daily'), archive: view(date, 'archive') })) };
}

export async function archiveDay(env, who, date) {
  if (!isDate(date) || date >= todayUTC() || date < launchDate(env)) throw new HttpError(400, 'Pick a past day.');
  const rows = await ensurePast(env, date);
  const mode = await playedOnTheDay(env, who, date) ? 'daily' : 'archive';
  return dayState(env, who, date, mode, rows);
}

/** A past day nobody opened still gets its puzzles (from its draft or the bank). */
async function ensurePast(env, date) {
  const rows = await dayRows(env, date);
  if (rows.length >= ROUNDS) return rows;
  const bank = bankDay(env, date);
  for (let round = 1; round <= ROUNDS; round++) {
    if (rows.some(z => z.round === round)) continue;
    try { await insertPuzzle(env, date, round, 'auto', bank.find(b => b.round === round)); } catch { /* raced */ }
  }
  return dayRows(env, date);
}

/* ───────────── Home page, stats, history ───────────── */

export async function dayStatus(env, who, date) {
  if (!isOpen(env, date)) return { date, number: 0, done: 0, of: ROUNDS, total: 0, max: DAY_MAX, notYet: true, opensAt: launchDate(env) + 'T00:00:00Z', rounds: [] };
  const rows = await ensureDay(env, date);
  const plays = rows.length ? (await env.DB.prepare(`SELECT z.round, pl.score FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND z.date = ? AND pl.mode = 'daily' AND z.${LIVE}`).bind(who.player.id, date).all()).results : [];
  return { date, number: lifelineNumber(env, date), done: plays.length, of: ROUNDS, max: DAY_MAX, total: plays.reduce((t, p) => t + p.score, 0), rounds: plays.map(p => ({ round: p.round, score: p.score })) };
}

/** Days with at least one daily round played (for the WK streak). */
export async function wkDates(env, who) {
  return (await env.DB.prepare(`SELECT DISTINCT z.date FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND pl.mode = 'daily' AND z.date IS NOT NULL`).bind(who.player.id).all()).results.map(r => r.date);
}

export async function stats(env, who) {
  const rows = (await env.DB.prepare(`SELECT z.date, pl.mode, pl.score, pl.kind FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND z.${LIVE}`).bind(who.player.id).all()).results;
  const days = {}, counts = {};
  rows.filter(r => r.mode === 'daily').forEach(r => { days[r.date] = (days[r.date] || 0) + r.score; counts[r.date] = (counts[r.date] || 0) + 1; });
  const full = Object.keys(days).filter(d => counts[d] >= ROUNDS).sort();
  const totals = full.map(d => days[d]);
  const s = streaks(full);
  const daily = rows.filter(r => r.mode === 'daily');
  return {
    played: full.length, avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0, best: totals.length ? Math.max(...totals) : 0,
    streak: s.streak, maxStreak: s.max, dist: spread(totals, DAY_MAX),
    rounds: daily.length, perfect: daily.filter(r => r.kind === 'both').length
  };
}

/* ───────────── Reports ───────────── */

/** "These dates look wrong": on your own round. */
export async function report(env, who, body) {
  const play = await env.DB.prepare(`SELECT * FROM lifeline_plays WHERE id = ? AND player_id = ?`).bind(Number(body.playId), who.player.id).first();
  if (!play) throw new HttpError(404, 'Round not found.');
  const dup = await env.DB.prepare(`SELECT id FROM lifeline_reports WHERE play_id = ? AND player_id = ?`).bind(play.id, who.player.id).first();
  if (dup) return { ok: true, already: true };
  await env.DB.prepare(`INSERT INTO lifeline_reports (play_id, player_id, qid, note, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(play.id, who.player.id, play.qid, clampStr(body.note, 300), nowISO()).run();
  return { ok: true };
}

export async function markSeen(env, who, body) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 50);
  if (ids.length) await env.DB.prepare(`UPDATE lifeline_reports SET seen = 1 WHERE player_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(who.player.id, ...ids).run();
  return { ok: true };
}

/** A person's dates changed (or a puzzle's): every play that named them is scored again. */
export async function rescore(env, { qid = null, puzzleId = null }) {
  const db = env.DB;
  const plays = (await db.prepare(`SELECT z.*, pl.id AS play_id, pl.qid AS play_qid FROM lifeline_plays pl JOIN lifeline_puzzles z ON z.id = pl.puzzle_id WHERE ${qid ? 'pl.qid = ?' : 'pl.puzzle_id = ?'}`)
    .bind(qid || Number(puzzleId)).all()).results;
  const cache = {};
  const stmts = [];
  for (const r of plays) {
    const p = cache[r.play_qid] || (cache[r.play_qid] = await personById(env, r.play_qid));
    if (!p || lifeProblem(p)) continue;
    const v = personView(p, r);
    stmts.push(db.prepare(`UPDATE lifeline_plays SET score = ?, kind = ? WHERE id = ?`).bind(v.score, v.kind, r.play_id));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return stmts.length;
}

export { dayRows, dayState };
