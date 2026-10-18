import { tipUrl, HttpError, nowISO, todayUTC, addDays, dayIndex, isDate, puzzleNumber, sameItem, normalize, clampStr } from './util.js';
import { estimate, generatePuzzles, suggestMiddle } from './ai.js';
import { planSpecs, recentItems } from './plan.js';
import { lookOf, bucksBalance } from './bucks.js';
import { answerMeasurementProblem } from '../../public/js/measure.js';
import { PROPS } from '../../public/js/props.js';
import { scoreGuess, finalScore, middle, inRange, MAX_REJECTS, MAX_SCORE, MIN_CROWD } from '../../public/js/score.js';

const LIVE = `status IN ('approved','auto')`;

/* ───────────── Puzzles ───────────── */

export function publicPuzzle(p) {
  // Never includes the two values.
  return { id: p.id, date: p.date, slot: p.slot, property: p.property, unitLabel: p.unit_label || '', small: p.small_item, big: p.big_item };
}

function revealPuzzle(p) {
  return { ...publicPuzzle(p), smallValue: p.small_value, bigValue: p.big_value, middle: middle(p.small_value, p.big_value) };
}

/** Makes sure a date (today or earlier) has its 3 live puzzles, creating any that are missing. */
export async function ensureDay(env, date) {
  const db = env.DB;
  const load = async () => (await db.prepare(`SELECT * FROM puzzles WHERE date = ? AND ${LIVE} ORDER BY slot`).bind(date).all()).results;
  let rows = await load();
  if (rows.length >= 3 || date !== todayUTC()) return rows;

  const have = new Set(rows.map(r => r.slot));
  let missing = [1, 2, 3].filter(s => !have.has(s));

  // 1) Use drafts waiting for this day.
  for (const slot of missing) {
    const d = await db.prepare(`SELECT id FROM puzzles WHERE date = ? AND slot = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`).bind(date, slot).first();
    if (d) await db.prepare(`UPDATE OR IGNORE puzzles SET status = 'auto' WHERE id = ?`).bind(d.id).run();
  }
  rows = await load();
  missing = [1, 2, 3].filter(s => !rows.some(r => r.slot === s));
  if (!missing.length) return rows;

  // 2) Ask the AI (falls back to the bank inside generatePuzzles).
  const gen = await generatePuzzles(env, await planSpecs(env, date, missing), { avoidItems: await recentItems(env), seed: dayIndex(date) });
  const stmts = gen.map((p, i) => db.prepare(`INSERT OR IGNORE INTO puzzles
      (date, slot, status, property, unit_label, small_item, small_value, big_item, big_value, note, created_at)
      VALUES (?, ?, 'auto', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(date, missing[i], p.property, p.unitLabel, p.smallItem, p.smallValue, p.bigItem, p.bigValue, p.note, nowISO()));
  if (stmts.length) await db.batch(stmts);
  return load();
}

async function getPuzzle(env, id) {
  const p = await env.DB.prepare(`SELECT * FROM puzzles WHERE id = ?`).bind(Number(id)).first();
  if (!p) throw new HttpError(404, 'Puzzle not found.');
  return p;
}

/** Checks the caller may play this puzzle in this mode. */
function checkAccess(p, mode, who) {
  const today = todayUTC();
  const live = p.status === 'approved' || p.status === 'auto';
  if (mode === 'daily' && live && p.date === today) return;
  if (mode === 'archive' && live && p.date && p.date < today) return;
  if (mode === 'unlimited' && who.isAdmin && p.status === 'unlimited') return;
  throw new HttpError(403, 'You can\'t play that one right now.');
}

/* ───────────── Plays ───────────── */

async function getPlay(env, playerId, puzzleId, mode) {
  return env.DB.prepare(`SELECT * FROM plays WHERE player_id = ? AND puzzle_id = ? AND mode = ?`).bind(playerId, puzzleId, mode).first();
}

async function guessesFor(env, playId) {
  return (await env.DB.prepare(`SELECT * FROM guesses WHERE play_id = ? ORDER BY attempt`).bind(playId).all()).results;
}

function playView(play, guesses) {
  if (!play) return { state: 'g1', rejects: 0, guesses: [], score: null, usedSecond: false, gaveUp: false };
  return {
    id: play.id,
    state: play.state,
    rejects: play.state === 'g2' ? play.rejects2 : play.rejects1,
    rejects1: play.rejects1, rejects2: play.rejects2,
    guesses: guesses.map(g => ({
      id: g.id, attempt: g.attempt, input: g.input, name: g.name, value: g.value,
      raw: g.raw_score, score: g.score, outOfRange: !!g.out_of_range
    })),
    score: play.score,
    usedSecond: !!play.used_second,
    gaveUp: !!play.gave_up
  };
}

async function fullState(env, who, p, mode) {
  const play = await getPlay(env, who.player.id, p.id, mode);
  const guesses = play ? await guessesFor(env, play.id) : [];
  const view = playView(play, guesses);
  const out = { puzzle: publicPuzzle(p), play: view, complaints: {} };
  if (view.state === 'done') out.reveal = await reveal(env, p, mode, view, who);
  if (guesses.length) {
    const c = (await env.DB.prepare(`SELECT guess_id, status FROM complaints WHERE player_id = ? AND guess_id IN (${guesses.map(() => '?').join(',')})`)
      .bind(who.player.id, ...guesses.map(g => g.id)).all()).results;
    out.complaints = Object.fromEntries(c.map(r => [r.guess_id, r.status]));
  }
  return out;
}

async function reveal(env, p, mode, view, who) {
  const out = { puzzle: revealPuzzle(p), crowd: null, best: null, top: [] };
  if (mode === 'unlimited') return out;
  const db = env.DB;
  const scores = (await db.prepare(`SELECT player_id, score FROM plays WHERE puzzle_id = ? AND mode = 'daily' AND state = 'done'`).bind(p.id).all()).results;
  const others = scores.filter(s => s.player_id !== who.player.id).map(s => s.score);
  const hist = new Array(11).fill(0);
  scores.forEach(s => { hist[Math.min(10, Math.floor(s.score / 100))]++; });
  const my = view.score;
  // Comparisons stay hidden until enough people have played, so nobody's single result is on show.
  out.crowd = scores.length < MIN_CROWD ? { total: scores.length, few: true } : {
    total: scores.length,
    beat: others.length ? Math.round(100 * others.filter(s => s < my).length / others.length) : null,
    hist
  };
  const top = (await db.prepare(`
    SELECT g.answer_key AS k, MAX(g.raw_score) AS raw, COUNT(DISTINCT pl.player_id) AS n, a.name AS name, a.value AS value, a.approved AS approved
    FROM guesses g JOIN plays pl ON pl.id = g.play_id JOIN answers a ON a.key = g.answer_key
    WHERE pl.puzzle_id = ? AND pl.mode = 'daily' AND g.out_of_range = 0 AND a.status = 'ok' AND a.flagged = 0
    GROUP BY g.answer_key HAVING n >= 2 OR a.approved = 1
    ORDER BY raw DESC LIMIT 5`).bind(p.id).all()).results;
  out.top = top.map(t => ({ name: t.name, value: t.value, score: scoreGuess(p.small_value, p.big_value, t.value), count: t.n }));
  out.top.sort((a, b) => b.score - a.score);
  out.best = out.top[0] || null;
  return out;
}

/* ───────────── Endpoints ───────────── */

export async function today(env, who, waitUntil) {
  const date = todayUTC();
  const puzzles = await ensureDay(env, date);
  await warmBest(env, waitUntil);
  const rooms = [];
  for (const p of puzzles) rooms.push(await fullState(env, who, p, 'daily'));
  return {
    date, number: puzzleNumber(env, date), rooms,
    day: await daySummary(env, who, date, rooms),
    me: { signedIn: who.signedIn, email: who.email, isAdmin: who.isAdmin, hasPassword: who.hasPassword, skipper: lookOf(who.player) },
    bucks: await bucksBalance(env, who.player.id),
    notifications: await notifications(env, who),
    tipUrl: tipUrl(env),
    nextReset: addDays(date, 1) + 'T00:00:00Z'
  };
}

async function daySummary(env, who, date, rooms) {
  const done = rooms.filter(r => r.play.state === 'done');
  const total = done.reduce((s, r) => s + (r.play.score || 0), 0);
  const out = { total, done: done.length, of: rooms.length, beat: null, players: 0 };
  if (done.length === rooms.length && rooms.length) {
    const totals = (await env.DB.prepare(`
      SELECT pl.player_id AS pid, SUM(pl.score) AS t, COUNT(*) AS c FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
      WHERE z.date = ? AND z.${LIVE} AND pl.mode = 'daily' AND pl.state = 'done'
      GROUP BY pl.player_id HAVING c = 3`).bind(date).all()).results;
    const others = totals.filter(t => t.pid !== who.player.id).map(t => t.t);
    out.players = totals.length;
    out.beat = totals.length >= MIN_CROWD && others.length ? Math.round(100 * others.filter(t => t < total).length / others.length) : null;
  }
  return out;
}

/**
 * Today's Summit status for the suite home page. Only reads what exists (never generates puzzles):
 * { date, number, rooms (for the share text), done, of, total }.
 */
export async function dayStatus(env, who, date) {
  const puzzles = (await env.DB.prepare(`SELECT * FROM puzzles WHERE date = ? AND ${LIVE} ORDER BY slot`).bind(date).all()).results;
  const rooms = [];
  for (const p of puzzles) {
    const play = await getPlay(env, who.player.id, p.id, 'daily');
    rooms.push({ puzzle: { slot: p.slot }, play: playView(play, play ? await guessesFor(env, play.id) : []) });
  }
  const done = rooms.filter(r => r.play.state === 'done');
  return { date, number: puzzleNumber(env, date), rooms, done: done.length, of: 3, total: done.reduce((s, r) => s + (r.play.score || 0), 0) };
}

export async function archiveList(env, who) {
  const today = todayUTC();
  const rows = (await env.DB.prepare(`SELECT id, date, slot FROM puzzles WHERE date < ? AND ${LIVE} ORDER BY date DESC, slot`).bind(today).all()).results;
  const mine = (await env.DB.prepare(`SELECT pl.puzzle_id, pl.mode, pl.state, pl.score FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND z.date < ? AND pl.mode IN ('daily','archive')`).bind(who.player.id, today).all()).results;
  const byDate = new Map();
  rows.forEach(r => {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, number: puzzleNumber(env, r.date), slots: [] });
    const d = mine.filter(m => m.puzzle_id === r.id && m.state === 'done');
    const daily = d.find(m => m.mode === 'daily'), arch = d.find(m => m.mode === 'archive');
    byDate.get(r.date).slots.push({ slot: r.slot, daily: daily ? daily.score : null, archive: arch ? arch.score : null });
  });
  return { days: [...byDate.values()] };
}

export async function archiveDay(env, who, date) {
  if (!isDate(date) || date >= todayUTC()) throw new HttpError(400, 'Pick a past day.');
  const puzzles = (await env.DB.prepare(`SELECT * FROM puzzles WHERE date = ? AND ${LIVE} ORDER BY slot`).bind(date).all()).results;
  if (!puzzles.length) throw new HttpError(404, 'No puzzles that day.');
  const rooms = [];
  for (const p of puzzles) {
    // If they played it on the day, show that result instead of a replay.
    const daily = await getPlay(env, who.player.id, p.id, 'daily');
    rooms.push(await fullState(env, who, p, daily && daily.state === 'done' ? 'daily' : 'archive'));
    rooms[rooms.length - 1].mode = daily && daily.state === 'done' ? 'daily' : 'archive';
  }
  const total = rooms.filter(r => r.play.state === 'done').reduce((s, r) => s + (r.play.score || 0), 0);
  return { date, number: puzzleNumber(env, date), rooms, day: { total, done: rooms.filter(r => r.play.state === 'done').length, of: rooms.length } };
}

export async function newUnlimited(env, who) {
  if (!who.isAdmin) throw new HttpError(403, 'Admins only.');
  const tier = 1 + Math.floor(Math.random() * 3);
  const [p] = await generatePuzzles(env, await planSpecs(env, null, [tier]), { avoidItems: await recentItems(env), seed: Math.floor(Math.random() * 1000) });
  const r = await env.DB.prepare(`INSERT INTO puzzles (date, slot, status, property, unit_label, small_item, small_value, big_item, big_value, note, created_at)
    VALUES (NULL, ?, 'unlimited', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(tier, p.property, p.unitLabel, p.smallItem, p.smallValue, p.bigItem, p.bigValue, p.note, nowISO()).first();
  return { ...(await fullState(env, who, r, 'unlimited')), mode: 'unlimited' };
}

export async function guess(env, who, body, waitUntil) {
  const mode = ['daily', 'archive', 'unlimited'].includes(body.mode) ? body.mode : 'daily';
  const p = await getPuzzle(env, body.puzzleId);
  checkAccess(p, mode, who);
  if (mode === 'daily') await warmBest(env, waitUntil);
  const db = env.DB;

  let play = await getPlay(env, who.player.id, p.id, mode);
  if (!play) {
    await db.prepare(`INSERT OR IGNORE INTO plays (player_id, puzzle_id, mode, state, created_at) VALUES (?, ?, ?, 'g1', ?)`)
      .bind(who.player.id, p.id, mode, nowISO()).run();
    play = await getPlay(env, who.player.id, p.id, mode);
  }
  if (play.state !== 'g1' && play.state !== 'g2') return { status: 'stale', ...(await fullState(env, who, p, mode)) };
  const attempt = play.state === 'g1' ? 1 : 2;
  const prior = await guessesFor(env, play.id);

  const answer = clampStr(body.answer, 200);
  if (!answer) return { status: 'invalid', reason: 'Type the name of something real.' };
  if (answer.length > 80) return { status: 'invalid', reason: 'Keep it under 80 characters.' };
  if (sameItem(answer, p.small_item) || sameItem(answer, p.big_item)) {
    return { status: 'invalid', reason: 'That\'s one of the two ends. Find something in between!' };
  }
  const measure = answerMeasurementProblem(answer, (PROPS[p.property] || {}).dim || 'count');
  if (measure) return { status: 'invalid', reason: measure };
  if (attempt === 2 && prior[0] && sameItem(answer, prior[0].input)) {
    return { status: 'invalid', reason: 'Your second guess has to be something different.' };
  }

  const est = await estimate(env, { property: p.property, unitLabel: p.unit_label, answer, avg: !!body.avg, playerId: who.player.id });
  if (est.status === 'vague') return { status: 'vague', suggestions: est.suggestions, reason: est.reason };
  if (est.status !== 'ok') return { status: 'invalid', reason: est.reason || 'Couldn\'t find a number for that. Try naming something more specific.' };
  if (attempt === 2 && prior[0] && prior[0].answer_key === est.key) {
    return { status: 'invalid', reason: 'Your second guess has to be something different.' };
  }

  const rejCol = attempt === 1 ? 'rejects1' : 'rejects2';
  const outside = !inRange(p.small_value, p.big_value, est.value);
  if (outside && play[rejCol] < MAX_REJECTS) {
    const r = await db.prepare(`UPDATE plays SET ${rejCol} = ${rejCol} + 1 WHERE id = ? AND state = ? AND ${rejCol} = ?`)
      .bind(play.id, play.state, play[rejCol]).run();
    const used = play[rejCol] + (r.meta.changes ? 1 : 0);
    return { status: 'out_of_range', triesLeft: MAX_REJECTS - used, ...(await fullState(env, who, p, mode)) };
  }

  const raw = outside ? 0 : scoreGuess(p.small_value, p.big_value, est.value);
  const score = finalScore(raw, attempt);
  const next = attempt === 1 && raw < MAX_SCORE ? 'decide' : 'done';

  // Move the state forward first so a double-submit can't record two guesses.
  const moved = await db.prepare(`UPDATE plays SET state = ?, score = ?, used_second = ?, finished_at = ? WHERE id = ? AND state = ?`)
    .bind(next, next === 'done' ? score : null, attempt === 2 ? 1 : 0, next === 'done' ? nowISO() : null, play.id, play.state).run();
  if (!moved.meta.changes) return { status: 'stale', ...(await fullState(env, who, p, mode)) };

  await db.prepare(`INSERT INTO guesses (play_id, attempt, input, answer_key, name, value, raw_score, score, out_of_range, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(play.id, attempt, answer, est.key, est.name, est.value, raw, score, outside ? 1 : 0, nowISO()).run();

  return { status: 'accepted', ...(await fullState(env, who, p, mode)) };
}

export async function decide(env, who, body) {
  const mode = ['daily', 'archive', 'unlimited'].includes(body.mode) ? body.mode : 'daily';
  const p = await getPuzzle(env, body.puzzleId);
  checkAccess(p, mode, who);
  const play = await getPlay(env, who.player.id, p.id, mode);
  if (!play || play.state !== 'decide') return { status: 'stale', ...(await fullState(env, who, p, mode)) };
  if (body.choice === 'retry') {
    await env.DB.prepare(`UPDATE plays SET state = 'g2' WHERE id = ? AND state = 'decide'`).bind(play.id).run();
  } else {
    const g1 = (await guessesFor(env, play.id))[0];
    await env.DB.prepare(`UPDATE plays SET state = 'done', score = ?, finished_at = ? WHERE id = ? AND state = 'decide'`)
      .bind(g1 ? g1.score : 0, nowISO(), play.id).run();
  }
  return { status: 'ok', ...(await fullState(env, who, p, mode)) };
}

export async function room(env, who, puzzleId, mode) {
  const p = await getPuzzle(env, puzzleId);
  checkAccess(p, mode, who);
  return { ...(await fullState(env, who, p, mode)), mode };
}

/** Ends a room with a 0 (from the first or second guess). */
export async function giveUp(env, who, body) {
  const mode = ['daily', 'archive', 'unlimited'].includes(body.mode) ? body.mode : 'daily';
  const p = await getPuzzle(env, body.puzzleId);
  checkAccess(p, mode, who);
  await env.DB.prepare(`INSERT OR IGNORE INTO plays (player_id, puzzle_id, mode, state, created_at) VALUES (?, ?, ?, 'g1', ?)`)
    .bind(who.player.id, p.id, mode, nowISO()).run();
  await env.DB.prepare(`UPDATE plays SET state = 'done', score = 0, gave_up = 1, finished_at = ?
      WHERE player_id = ? AND puzzle_id = ? AND mode = ? AND state IN ('g1','g2','decide')`)
    .bind(nowISO(), who.player.id, p.id, mode).run();
  return { status: 'ok', ...(await fullState(env, who, p, mode)) };
}

/**
 * The best answer: the closest thing to the middle that anyone has found, AI or player, scored by the
 * same judge players get. Skipper's search runs in the background as soon as a day's puzzles exist
 * (see warmBest), so it's normally ready long before anyone finishes a stage. Any player answer that
 * does better replaces it, so the shown best answer is never beaten. Only shown after you finish.
 */
export async function bestAnswer(env, who, puzzleId, mode, waitUntil) {
  const p = await getPuzzle(env, puzzleId);
  checkAccess(p, mode, who);
  const play = await getPlay(env, who.player.id, p.id, mode);
  if (!play || play.state !== 'done') throw new HttpError(403, 'Finish this stage first!');
  const shape = (input, name, value, by) => ({ input, name, value, score: scoreGuess(p.small_value, p.big_value, value), by });

  // Best answer any player has given for this puzzle.
  const pg = await env.DB.prepare(`SELECT g.input, g.name, g.value FROM guesses g JOIN plays pl ON pl.id = g.play_id JOIN answers a ON a.key = g.answer_key
      WHERE pl.puzzle_id = ? AND g.out_of_range = 0 AND a.status = 'ok' AND a.flagged = 0 ORDER BY g.raw_score DESC, g.id LIMIT 1`).bind(p.id).first();
  const playerBest = pg ? shape(pg.input, pg.name, pg.value, 'player') : null;

  let best = p.best_name ? shape(p.best_input, p.best_name, p.best_value, 'ai') : null;
  if (!best) {
    // Still searching (or never started): kick it off and answer right away with what we have.
    if (waitUntil) waitUntil(computeBest(env, p).catch(e => console.error('best answer failed', e.message)));
    return playerBest ? { ...playerBest, pending: true } : { pending: true };
  }
  if (playerBest && playerBest.score > best.score) {
    best = playerBest;
    await env.DB.prepare(`UPDATE puzzles SET best_input = ?, best_name = ?, best_value = ? WHERE id = ?`).bind(best.input, best.name, best.value, p.id).run();
  }
  return best;
}

const BEST_CLAIM_MS = 3 * 60000;

/** Starts Skipper's search for one of today's puzzles that doesn't have a best answer yet. */
export async function warmBest(env, waitUntil) {
  if (!waitUntil) return;
  const p = await env.DB.prepare(`SELECT * FROM puzzles WHERE date = ? AND ${LIVE} AND best_name IS NULL
      AND (best_started IS NULL OR best_started < ?) ORDER BY slot LIMIT 1`).bind(todayUTC(), new Date(Date.now() - BEST_CLAIM_MS).toISOString()).first();
  if (p) waitUntil(computeBest(env, p).catch(e => console.error('best answer failed', e.message)));
}

/**
 * Asks the AI for things near the middle and runs each one past the judge (so the value shown is
 * exactly what a player would get for typing it). Two rounds: the second homes in on the closest.
 * Only one worker searches a puzzle at a time; every judged answer is cached, so a retry is quick.
 */
async function computeBest(env, p) {
  const db = env.DB, now = nowISO();
  const claim = await db.prepare(`UPDATE puzzles SET best_started = ? WHERE id = ? AND best_name IS NULL AND (best_started IS NULL OR best_started < ?)`)
    .bind(now, p.id, new Date(Date.now() - BEST_CLAIM_MS).toISOString()).run();
  if (!claim.meta.changes) return;
  const shape = (input, name, value) => ({ input, name, value, score: scoreGuess(p.small_value, p.big_value, value) });
  const dim = (PROPS[p.property] || {}).dim || 'count';
  const tried = new Set();
  const judge = async names => {
    const fresh = names.filter(n => !tried.has(normalize(n)) && !sameItem(n, p.small_item) && !sameItem(n, p.big_item) && !answerMeasurementProblem(n, dim));
    fresh.forEach(n => tried.add(normalize(n)));
    const out = [];
    for (let i = 0; i < fresh.length; i += 3) {
      const batch = await Promise.all(fresh.slice(i, i + 3).map(n =>
        estimate(env, { property: p.property, unitLabel: p.unit_label, answer: n, avg: false, playerId: '' }).catch(() => null)));
      batch.forEach((est, j) => { if (est && est.status === 'ok' && inRange(p.small_value, p.big_value, est.value)) out.push(shape(fresh[i + j], est.name, est.value)); });
    }
    return out;
  };
  const pickBest = list => list.filter(Boolean).reduce((b, c) => (!b || c.score > b.score ? c : b), null);
  const base = { property: p.property, unitLabel: p.unit_label, target: middle(p.small_value, p.big_value), small: p.small_item, big: p.big_item };
  let best = null;
  try { best = pickBest(await judge(await suggestMiddle(env, { ...base, count: 6 }))); } catch { /* try round two */ }
  if (!best || best.score < 970) {
    try { best = pickBest([best, ...(await judge(await suggestMiddle(env, { ...base, closest: best, count: 5 })))]); } catch { /* keep round one */ }
  }
  if (!best) { await db.prepare(`UPDATE puzzles SET best_started = NULL WHERE id = ?`).bind(p.id).run(); return; }
  await db.prepare(`UPDATE puzzles SET best_input = ?, best_name = ?, best_value = ? WHERE id = ? AND best_name IS NULL`).bind(best.input, best.name, best.value, p.id).run();
}

/* ───────────── Complaints & notifications ───────────── */

export async function complain(env, who, body) {
  const g = await env.DB.prepare(`SELECT g.id FROM guesses g JOIN plays pl ON pl.id = g.play_id WHERE g.id = ? AND pl.player_id = ?`)
    .bind(Number(body.guessId), who.player.id).first();
  if (!g) throw new HttpError(404, 'Guess not found.');
  const dup = await env.DB.prepare(`SELECT id FROM complaints WHERE guess_id = ? AND player_id = ?`).bind(g.id, who.player.id).first();
  if (dup) return { ok: true, already: true };
  await env.DB.prepare(`INSERT INTO complaints (guess_id, player_id, note, created_at) VALUES (?, ?, ?, ?)`)
    .bind(g.id, who.player.id, clampStr(body.note, 500), nowISO()).run();
  return { ok: true };
}

async function notifications(env, who) {
  const rows = (await env.DB.prepare(`
    SELECT c.id, c.status, c.admin_note, g.input, g.name, g.value, z.property, z.unit_label
    FROM complaints c JOIN guesses g ON g.id = c.guess_id JOIN plays pl ON pl.id = g.play_id JOIN puzzles z ON z.id = pl.puzzle_id
    WHERE c.player_id = ? AND c.status != 'open' AND c.seen = 0 ORDER BY c.id DESC LIMIT 10`).bind(who.player.id).all()).results;
  return rows.map(r => ({ id: r.id, status: r.status, note: r.admin_note, input: r.input, name: r.name, value: r.value, property: r.property, unitLabel: r.unit_label }));
}

export async function markSeen(env, who, body) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean).slice(0, 50);
  if (ids.length) {
    await env.DB.prepare(`UPDATE complaints SET seen = 1 WHERE player_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(who.player.id, ...ids).run();
  }
  return { ok: true };
}

/* ───────────── Stats ───────────── */

export async function stats(env, who) {
  const rows = (await env.DB.prepare(`
    SELECT z.date, pl.mode, pl.score FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
    WHERE pl.player_id = ? AND pl.state = 'done' AND pl.mode IN ('daily','archive') AND z.${LIVE}`).bind(who.player.id).all()).results;
  const days = {};
  let aCount = 0, aSum = 0;
  rows.forEach(r => {
    if (r.mode === 'archive') { aCount++; aSum += r.score; return; }
    days[r.date] = days[r.date] || { n: 0, t: 0 };
    days[r.date].n++; days[r.date].t += r.score;
  });
  const full = Object.keys(days).filter(d => days[d].n >= 3).sort();
  const totals = full.map(d => days[d].t);
  const dist = [0, 0, 0, 0, 0, 0]; // 0-999, 1000-1499, 1500-1999, 2000-2499, 2500-2999, 3000 (meters)
  totals.forEach(t => { dist[t >= 3000 ? 5 : t < 1000 ? 0 : Math.min(4, Math.floor((t - 500) / 500))]++; });

  let streak = 0, d = todayUTC();
  const set = new Set(full);
  if (!set.has(d)) d = addDays(d, -1);
  while (set.has(d)) { streak++; d = addDays(d, -1); }
  let max = 0, run = 0, prev = null;
  full.forEach(x => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; max = Math.max(max, run); prev = x; });

  return {
    played: full.length,
    avg: totals.length ? Math.round(totals.reduce((s, x) => s + x, 0) / totals.length) : 0,
    best: totals.length ? Math.max(...totals) : 0,
    streak, maxStreak: max, dist,
    archive: { played: aCount, avg: aCount ? Math.round(aSum / aCount) : 0 }
  };
}

/* ───────────── Rescoring (used by admin) ───────────── */

/** Recomputes every guess that used this answer key (and the plays they finish). */
export async function rescoreAnswer(env, key) {
  const db = env.DB;
  const a = await db.prepare(`SELECT * FROM answers WHERE key = ?`).bind(key).first();
  if (!a) return 0;
  const rows = (await db.prepare(`
    SELECT g.id, g.attempt, g.play_id, z.small_value, z.big_value FROM guesses g
    JOIN plays pl ON pl.id = g.play_id JOIN puzzles z ON z.id = pl.puzzle_id WHERE g.answer_key = ?`).bind(key).all()).results;
  const stmts = rows.map(r => {
    const ok = a.status === 'ok' && inRange(r.small_value, r.big_value, a.value);
    const raw = ok ? scoreGuess(r.small_value, r.big_value, a.value) : 0;
    return db.prepare(`UPDATE guesses SET name = ?, value = ?, raw_score = ?, score = ?, out_of_range = ? WHERE id = ?`)
      .bind(a.name, a.value, raw, finalScore(raw, r.attempt), ok ? 0 : 1, r.id);
  });
  const plays = [...new Set(rows.map(r => r.play_id))];
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await refreshPlayScores(env, plays);
  return rows.length;
}

/** Recomputes every guess on a puzzle (after its end values were edited). */
export async function rescorePuzzle(env, puzzleId) {
  const db = env.DB;
  const z = await db.prepare(`SELECT * FROM puzzles WHERE id = ?`).bind(puzzleId).first();
  const rows = (await db.prepare(`SELECT g.id, g.attempt, g.play_id, g.value FROM guesses g JOIN plays pl ON pl.id = g.play_id WHERE pl.puzzle_id = ?`)
    .bind(puzzleId).all()).results;
  const stmts = rows.map(r => {
    const ok = inRange(z.small_value, z.big_value, r.value);
    const raw = ok ? scoreGuess(z.small_value, z.big_value, r.value) : 0;
    return db.prepare(`UPDATE guesses SET raw_score = ?, score = ?, out_of_range = ? WHERE id = ?`).bind(raw, finalScore(raw, r.attempt), ok ? 0 : 1, r.id);
  });
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await refreshPlayScores(env, [...new Set(rows.map(r => r.play_id))]);
}

async function refreshPlayScores(env, playIds) {
  const db = env.DB;
  const stmts = playIds.map(id => db.prepare(`
    UPDATE plays SET score = (SELECT g.score FROM guesses g WHERE g.play_id = plays.id ORDER BY g.attempt DESC LIMIT 1)
    WHERE id = ? AND state = 'done' AND gave_up = 0`).bind(id));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

export { normalize };
