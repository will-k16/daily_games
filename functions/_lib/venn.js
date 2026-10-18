// Venn: the daily game where you name things that fit two (then three) categories at once, against a
// 90-second clock. The server keeps the clock: a play stores elapsed_ms plus resumed_at while running.
import { HttpError, nowISO, todayUTC, addDays, dayIndex, isDate, normalize, clampStr, safeJson } from './util.js';
import { judgeAnswer, generateVennPuzzle, fallbackVennPuzzle, vennHistory } from './venn-ai.js';
import { exactMatch, suggest, sameAnswer } from './fuzzy.js';
import { melLookOf, bucksBalance } from './bucks.js';
import { roundScore, ROUND_MS, GRACE_MS, MAX_ANSWER, DAY_MAX } from '../../public/js/venn-score.js';

const LIVE = `status IN ('approved','auto')`;
const MODES = ['daily', 'archive', 'unlimited'];
const DECLINED = 'Not one we know. Check the spelling?';

export function vennNumber(env, date) {
  const launch = isDate(env.VENN_LAUNCH_DATE) ? env.VENN_LAUNCH_DATE : date;
  return Math.max(1, dayIndex(date) - dayIndex(launch) + 1);
}

const circlesOf = p => safeJson(p.circles, []);
const answersOf = p => safeJson(p.answers, []);

/* ───────────── Puzzles ───────────── */

/** Never includes the answer list. Circles only once the round has started (and not while paused). */
function publicPuzzle(p, showCircles) {
  const circles = circlesOf(p);
  return { id: p.id, date: p.date, round: p.round, par: p.par, size: circles.length, circles: showCircles ? circles : null };
}

/** Makes sure a date (today or earlier) has its two live puzzles, creating any that are missing. */
export async function ensureVennDay(env, date) {
  const db = env.DB;
  const load = async () => (await db.prepare(`SELECT * FROM venn_puzzles WHERE date = ? AND ${LIVE} ORDER BY round`).bind(date).all()).results;
  let rows = await load();
  if (rows.length >= 2 || date !== todayUTC()) return rows;

  // 1) Use drafts waiting for this day.
  for (const round of [1, 2].filter(r => !rows.some(x => x.round === r))) {
    const d = await db.prepare(`SELECT id FROM venn_puzzles WHERE date = ? AND round = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`).bind(date, round).first();
    if (d) await db.prepare(`UPDATE OR IGNORE venn_puzzles SET status = 'auto' WHERE id = ?`).bind(d.id).run();
  }
  rows = await load();
  // 2) Ask the AI, and 3) fall back to the built-in bank.
  for (const round of [1, 2].filter(r => !rows.some(x => x.round === r))) {
    const history = await vennHistory(env, date);
    const p = (await generateVennPuzzle(env, round, date, history)) || fallbackVennPuzzle(round, dayIndex(date), history);
    await insertPuzzle(env, date, 'auto', p, true);
  }
  return load();
}

export function insertPuzzle(env, date, status, p, ignore = false) {
  return env.DB.prepare(`INSERT ${ignore ? 'OR IGNORE ' : ''}INTO venn_puzzles (date, round, status, circles, par, typical, answers, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(date, p.round, status, JSON.stringify(p.circles), p.par, p.typical, JSON.stringify(p.answers), p.note || '', nowISO()).first();
}

export async function getPuzzle(env, id) {
  const p = await env.DB.prepare(`SELECT * FROM venn_puzzles WHERE id = ?`).bind(Number(id)).first();
  if (!p) throw new HttpError(404, 'Puzzle not found.');
  return p;
}

function checkAccess(p, mode, who) {
  const today = todayUTC();
  const live = p.status === 'approved' || p.status === 'auto';
  if (mode === 'daily' && live && p.date === today) return;
  if (mode === 'archive' && live && p.date && p.date < today) return;
  if (mode === 'unlimited' && who.isAdmin && p.status === 'unlimited') return;
  throw new HttpError(403, 'You can\'t play that one right now.');
}
const modeOf = m => (MODES.includes(m) ? m : 'daily');

/* ───────────── Plays and the clock ───────────── */

async function getPlay(env, playerId, puzzleId, mode) {
  return env.DB.prepare(`SELECT * FROM venn_plays WHERE player_id = ? AND puzzle_id = ? AND mode = ?`).bind(playerId, puzzleId, mode).first();
}
async function answersFor(env, playId) {
  return (await env.DB.prepare(`SELECT * FROM venn_answers WHERE play_id = ? ORDER BY id`).bind(playId).all()).results;
}
export const elapsedOf = (play, now = Date.now()) =>
  play.elapsed_ms + (play.state === 'running' && play.resumed_at ? Math.max(0, now - play.resumed_at) : 0);

/** Ends a round: banks the time, settles any open "did you mean" and scores it. */
async function finish(env, play, p) {
  const db = env.DB;
  const elapsed = Math.min(ROUND_MS, elapsedOf(play));
  await db.prepare(`UPDATE venn_answers SET verdict = 'no', reason = ? WHERE play_id = ? AND verdict = 'pending'`).bind(DECLINED, play.id).run();
  const n = (await db.prepare(`SELECT COUNT(*) AS n FROM venn_answers WHERE play_id = ? AND verdict = 'ok'`).bind(play.id).first()).n;
  await db.prepare(`UPDATE venn_plays SET state = 'done', elapsed_ms = ?, resumed_at = NULL, count = ?, score = ?, finished_at = ? WHERE id = ? AND state != 'done'`)
    .bind(elapsed, n, roundScore(n, p.par), nowISO(), play.id).run();
}

/** Closes a round whose time ran out while nobody was looking. Returns the fresh play. */
async function settle(env, play, p) {
  if (play && play.state === 'running' && elapsedOf(play) > ROUND_MS + GRACE_MS) {
    await finish(env, play, p);
    return getPlay(env, play.player_id, play.puzzle_id, play.mode);
  }
  return play;
}

function answerView(a) {
  return { id: a.id, input: a.input, canonical: a.verdict === 'pending' ? '' : a.canonical, verdict: a.verdict, fits: safeJson(a.fits, []), reason: a.reason };
}

function playView(play, answers, now = Date.now()) {
  if (!play) return { state: 'ready', elapsed: 0, count: 0, score: null, answers: [], pending: null };
  const pend = answers.find(a => a.verdict === 'pending');
  return {
    id: play.id, state: play.state, elapsed: Math.min(ROUND_MS, elapsedOf(play, now)), count: play.count, score: play.score,
    answers: answers.filter(a => a.verdict !== 'pending').map(answerView),
    pending: pend ? { id: pend.id, input: pend.input, suggestion: pend.canonical } : null
  };
}

async function roundState(env, who, p, mode) {
  let play = await getPlay(env, who.player.id, p.id, mode);
  play = await settle(env, play, p);
  const answers = play ? await answersFor(env, play.id) : [];
  const view = playView(play, answers);
  const out = { mode, puzzle: publicPuzzle(p, view.state === 'running' || view.state === 'done'), play: view };
  if (view.state === 'done') out.results = await results(env, who, p, mode, view);
  return out;
}

/* ───────────── Results ───────────── */

async function results(env, who, p, mode, view) {
  const db = env.DB;
  const mine = view.answers.filter(a => a.verdict === 'ok').map(a => a.canonical);
  // Answers you missed: what other players found most often first, then the AI's list.
  const crowd = (await db.prepare(`
    SELECT a.canonical AS name, COUNT(DISTINCT pl.player_id) AS n FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id
    WHERE pl.puzzle_id = ? AND a.verdict = 'ok' AND pl.player_id != ? AND pl.mode IN ('daily','archive')
    GROUP BY lower(a.canonical) ORDER BY n DESC, a.canonical LIMIT 40`).bind(p.id, who.player.id).all()).results;
  const missed = [];
  const add = (name, n) => { if (missed.length < 10 && name && !mine.some(m => sameAnswer(m, name)) && !missed.some(m => sameAnswer(m.name, name))) missed.push({ name, players: n }); };
  crowd.forEach(c => add(c.name, c.n));
  answersOf(p).forEach(a => add(a, 0));

  let everyone = null;
  if (mode !== 'unlimited') {
    const plays = (await db.prepare(`SELECT player_id, count FROM venn_plays WHERE puzzle_id = ? AND mode = 'daily' AND state = 'done'`).bind(p.id).all()).results;
    const others = plays.filter(x => x.player_id !== who.player.id).map(x => x.count);
    const top = Math.max(2 * p.par, ...plays.map(x => x.count), view.count);
    const hist = new Array(top + 1).fill(0);
    plays.forEach(x => { hist[Math.min(top, x.count)]++; });
    everyone = { total: plays.length, hist, beat: others.length ? Math.round(100 * others.filter(c => c < view.count).length / others.length) : null };
  }
  const ids = view.answers.map(a => a.id);
  const complaints = ids.length
    ? Object.fromEntries((await db.prepare(`SELECT answer_id, status FROM venn_complaints WHERE player_id = ? AND answer_id IN (${ids.map(() => '?').join(',')})`)
      .bind(who.player.id, ...ids).all()).results.map(r => [r.answer_id, r.status]))
    : {};
  return { count: view.count, par: p.par, score: view.score, missed, everyone, complaints };
}

export async function resultsFor(env, who, puzzleId, mode) {
  mode = modeOf(mode);
  const p = await getPuzzle(env, puzzleId);
  checkAccess(p, mode, who);
  const s = await roundState(env, who, p, mode);
  if (s.play.state !== 'done') throw new HttpError(403, 'Finish the round first.');
  return s;
}

/* ───────────── Endpoints ───────────── */

export async function today(env, who) {
  const date = todayUTC();
  const puzzles = await ensureVennDay(env, date);
  const rounds = [];
  for (const p of puzzles) rounds.push(await roundState(env, who, p, 'daily'));
  return {
    date, number: vennNumber(env, date), rounds,
    day: daySummary(rounds),
    me: { signedIn: who.signedIn, email: who.email, isAdmin: who.isAdmin, hasPassword: who.hasPassword, mel: melLookOf(who.player) },
    bucks: await bucksBalance(env, who.player.id),
    notifications: await notifications(env, who),
    nextReset: addDays(date, 1) + 'T00:00:00Z'
  };
}

const daySummary = rounds => {
  const done = rounds.filter(r => r.play.state === 'done');
  return { total: done.reduce((s, r) => s + (r.play.score || 0), 0), done: done.length, of: rounds.length, max: DAY_MAX };
};

/** Today's Venn status for the suite home page (reads only; never generates). */
export async function dayStatus(env, who, date) {
  const puzzles = (await env.DB.prepare(`SELECT * FROM venn_puzzles WHERE date = ? AND ${LIVE} ORDER BY round`).bind(date).all()).results;
  const rounds = [];
  for (const p of puzzles) {
    let play = await getPlay(env, who.player.id, p.id, 'daily');
    play = await settle(env, play, p);
    rounds.push({ round: p.round, par: p.par, play: play ? { state: play.state, count: play.count, score: play.score } : { state: 'ready' } });
  }
  const done = rounds.filter(r => r.play.state === 'done');
  return {
    date, number: vennNumber(env, date), done: done.length, of: 2, total: done.reduce((s, r) => s + (r.play.score || 0), 0),
    rounds: done.map(r => ({ round: r.round, count: r.play.count, par: r.par, score: r.play.score }))
  };
}

async function playFor(env, who, body) {
  const mode = modeOf(body.mode);
  const p = await getPuzzle(env, body.puzzleId);
  checkAccess(p, mode, who);
  let play = await getPlay(env, who.player.id, p.id, mode);
  play = await settle(env, play, p);
  return { p, mode, play };
}

/** Round 2 opens only once round 1 of the same day has its results. */
async function checkUnlocked(env, who, p, mode) {
  if (p.round !== 2 || mode === 'unlimited') return;
  const r1 = await env.DB.prepare(`SELECT id FROM venn_puzzles WHERE date = ? AND round = 1 AND ${LIVE}`).bind(p.date).first();
  if (!r1) return;
  const modes = mode === 'archive' ? ['archive', 'daily'] : ['daily'];
  const done = await env.DB.prepare(`SELECT 1 FROM venn_plays WHERE player_id = ? AND puzzle_id = ? AND state = 'done' AND mode IN (${modes.map(() => '?').join(',')})`)
    .bind(who.player.id, r1.id, ...modes).first();
  if (!done) throw new HttpError(403, 'Finish round 1 first.');
}

export async function start(env, who, body) {
  const { p, mode, play } = await playFor(env, who, body);
  await checkUnlocked(env, who, p, mode);
  const now = Date.now();
  if (!play) {
    await env.DB.prepare(`INSERT OR IGNORE INTO venn_plays (player_id, puzzle_id, mode, state, elapsed_ms, resumed_at, created_at) VALUES (?, ?, ?, 'running', 0, ?, ?)`)
      .bind(who.player.id, p.id, mode, now, nowISO()).run();
  } else if (play.state === 'ready' || play.state === 'paused') {
    await resumePlay(env, play, now);
  }
  return roundState(env, who, p, mode);
}

async function resumePlay(env, play, now = Date.now()) {
  // A "did you mean" still waiting keeps the clock stopped.
  const pend = await env.DB.prepare(`SELECT 1 FROM venn_answers WHERE play_id = ? AND verdict = 'pending'`).bind(play.id).first();
  if (pend) return;
  await env.DB.prepare(`UPDATE venn_plays SET state = 'running', resumed_at = ? WHERE id = ? AND state IN ('ready','paused')`).bind(now, play.id).run();
}

async function pausePlay(env, play, now = Date.now()) {
  if (play.state !== 'running') return;
  await env.DB.prepare(`UPDATE venn_plays SET state = 'paused', elapsed_ms = ?, resumed_at = NULL WHERE id = ? AND state = 'running'`)
    .bind(Math.min(ROUND_MS + GRACE_MS, elapsedOf(play, now)), play.id).run();
}

export async function pause(env, who, body) {
  const { p, mode, play } = await playFor(env, who, body);
  if (play) await pausePlay(env, play);
  const fresh = play ? await getPlay(env, who.player.id, p.id, mode) : null;
  return { ok: true, state: fresh ? fresh.state : 'ready', elapsed: fresh ? Math.min(ROUND_MS, elapsedOf(fresh)) : 0 };
}

export async function resume(env, who, body) {
  const { p, mode, play } = await playFor(env, who, body);
  if (play && play.state === 'paused') {
    if (play.elapsed_ms > ROUND_MS + GRACE_MS) await finish(env, play, p);
    else await resumePlay(env, play);
  }
  return roundState(env, who, p, mode);
}

export async function done(env, who, body) {
  const { p, mode, play } = await playFor(env, who, body);
  if (play && play.state !== 'done') await finish(env, play, p);
  return roundState(env, who, p, mode);
}

/* ───────────── Answers ───────────── */

/** Answers that count for this puzzle: its list plus anything already judged to fit every circle. */
async function knownAnswers(env, p) {
  const n = circlesOf(p).length;
  const rows = (await env.DB.prepare(`SELECT canonical, fits FROM venn_judgments WHERE puzzle_id = ? AND offensive = 0 AND fictional = 0 AND canonical != ''`).bind(p.id).all()).results;
  const accepted = rows.filter(r => { const f = safeJson(r.fits, []); return f.length === n && f.every(Boolean); }).map(r => r.canonical);
  const out = [];
  [...answersOf(p), ...accepted].forEach(a => { if (!out.some(x => sameAnswer(x, a))) out.push(a); });
  return out;
}

async function getJudgment(env, puzzleId, norm) {
  const j = await env.DB.prepare(`SELECT * FROM venn_judgments WHERE puzzle_id = ? AND norm = ?`).bind(puzzleId, norm).first();
  return j ? { canonical: j.canonical, fits: safeJson(j.fits, []), reason: j.reason, suggestion: j.suggestion, offensive: !!j.offensive, fictional: !!j.fictional, source: j.source } : null;
}

function saveJudgment(env, puzzleId, norm, j, source = 'ai') {
  return env.DB.prepare(`INSERT OR REPLACE INTO venn_judgments (puzzle_id, norm, canonical, fits, reason, suggestion, offensive, fictional, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(puzzleId, norm, j.canonical || '', JSON.stringify(j.fits || []), j.reason || '', j.suggestion || '', j.offensive ? 1 : 0, j.fictional ? 1 : 0, source, nowISO()).run();
}

/** Looks up (or makes) the verdict data for one answer on one puzzle. The same answer always gets the same verdict. */
async function judgmentFor(env, p, input, norm, playerId, { known, allowSuggest }) {
  const cached = await getJudgment(env, p.id, norm);
  if (cached) {
    // A cached "didn't recognize it" still offers its spelling suggestion (unless the player said No).
    if (allowSuggest && !cached.canonical && cached.suggestion && cached.source !== 'admin') return { suggestion: cached.suggestion };
    return { j: cached };
  }
  const list = answersOf(p);
  const hit = exactMatch(input, list);
  if (hit) {
    const j = { canonical: hit, fits: circlesOf(p).map(() => true), reason: '', suggestion: '', offensive: false, fictional: false };
    await saveJudgment(env, p.id, norm, j);
    return { j };
  }
  if (allowSuggest) {
    const s = suggest(input, known);
    if (s) return { suggestion: s };
  }
  const ai = await judgeAnswer(env, { circles: circlesOf(p), date: p.date, answer: input, known, playerId });
  const j = { canonical: ai.recognized ? ai.canonical : '', fits: ai.fits, reason: ai.reason, suggestion: ai.didYouMean, offensive: ai.offensive, fictional: ai.fictional };
  await saveJudgment(env, p.id, norm, j);
  if (allowSuggest && !ai.recognized && ai.didYouMean) return { suggestion: ai.didYouMean };
  return { j };
}

/** Turns a judgment into a verdict for this play, given the answers already in it. */
export function verdictFor(j, size, prior) {
  const fits = (j.fits || []).slice(0, size);
  const k = fits.filter(Boolean).length;
  if (j.offensive) return { verdict: 'no', reason: 'Let\'s keep it friendly. Try something else.', fits: fits.map(() => false) };
  if (j.fictional) return { verdict: 'no', reason: 'Fictional characters don\'t count.', fits: fits.map(() => false) };
  if (!j.canonical) return { verdict: 'no', reason: j.reason || DECLINED, fits };
  if (k === size) {
    if (prior.some(a => a.verdict === 'ok' && sameAnswer(a.canonical, j.canonical))) return { verdict: 'dup', reason: 'Already have it', fits };
    return { verdict: 'ok', reason: j.reason || '', fits };
  }
  if (size === 3 && k === 2) {
    if (prior.some(a => a.verdict === 'close' && sameAnswer(a.canonical, j.canonical))) return { verdict: 'dup', reason: 'Already have it', fits };
    return { verdict: 'close', reason: 'Close! Fits 2 of 3', fits };
  }
  return { verdict: 'no', reason: j.reason || 'Doesn\'t fit.', fits };
}

async function record(env, play, p, input, norm, j) {
  const prior = (await answersFor(env, play.id)).filter(a => a.verdict !== 'pending');
  const v = verdictFor(j, circlesOf(p).length, prior.map(a => ({ verdict: a.verdict, canonical: a.canonical })));
  const row = await env.DB.prepare(`INSERT INTO venn_answers (play_id, input, norm, canonical, verdict, fits, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(play.id, input, norm, j.canonical || '', v.verdict, JSON.stringify(v.fits), v.reason, nowISO()).first();
  const count = prior.filter(a => a.verdict === 'ok').length + (v.verdict === 'ok' ? 1 : 0);
  if (v.verdict === 'ok') await env.DB.prepare(`UPDATE venn_plays SET count = ? WHERE id = ?`).bind(count, play.id).run();
  return { answerId: row.id, verdict: v.verdict, canonical: j.canonical || '', fits: v.fits, reason: v.reason, count };
}

export async function answer(env, who, body) {
  const { p, mode, play } = await playFor(env, who, body);
  if (!play || play.state === 'ready') throw new HttpError(409, 'Press Start first.');
  if (play.state === 'done') return { verdict: 'closed', ...(await roundState(env, who, p, mode)) };
  if (play.state === 'paused') throw new HttpError(409, 'The clock is paused. Resume to keep going.');
  if (elapsedOf(play) > ROUND_MS + GRACE_MS) {
    await finish(env, play, p);
    return { verdict: 'closed', ...(await roundState(env, who, p, mode)) };
  }
  const input = String(body.input == null ? '' : body.input).trim().replace(/\s+/g, ' ');
  const norm = normalize(input);
  if (!input || !norm) return { verdict: 'ignored', count: play.count, elapsed: elapsedOf(play) };
  if (input.length > MAX_ANSWER) return { verdict: 'invalid', reason: `Keep it under ${MAX_ANSWER} characters.`, count: play.count, elapsed: elapsedOf(play) };

  // After a "No" to a suggestion, the same text goes straight to the judge without another suggestion.
  const declined = await env.DB.prepare(`SELECT 1 FROM venn_answers WHERE play_id = ? AND norm = ? AND verdict = 'no' AND reason = ?`).bind(play.id, norm, DECLINED).first();
  const known = await knownAnswers(env, p);
  const got = await judgmentFor(env, p, input, norm, who.player.id, { known, allowSuggest: !declined });

  if (got.suggestion) {
    // "Did you mean ___?" stops the clock until the player answers.
    const fresh = await getPlay(env, who.player.id, p.id, mode);
    await pausePlay(env, fresh);
    const row = await env.DB.prepare(`INSERT INTO venn_answers (play_id, input, norm, canonical, verdict, fits, reason, created_at)
        VALUES (?, ?, ?, ?, 'pending', '[]', '', ?) RETURNING id`).bind(play.id, input, norm, got.suggestion, nowISO()).first();
    const after = await getPlay(env, who.player.id, p.id, mode);
    return { verdict: 'pending', answerId: row.id, didYouMean: got.suggestion, canonical: '', fits: [], reason: '', count: after.count, elapsed: Math.min(ROUND_MS, elapsedOf(after)), state: after.state };
  }
  const out = await record(env, play, p, input, norm, got.j);
  return { ...out, didYouMean: '', elapsed: Math.min(ROUND_MS, elapsedOf(play)), state: 'running' };
}

/** The player's answer to "Did you mean ___?". Yes judges the suggestion as if typed; No marks it ✗. Either way the clock restarts. */
export async function confirm(env, who, body) {
  const a = await env.DB.prepare(`SELECT a.*, pl.player_id, pl.puzzle_id, pl.mode FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id WHERE a.id = ?`)
    .bind(Number(body.answerId)).first();
  if (!a || a.player_id !== who.player.id) throw new HttpError(404, 'Answer not found.');
  const p = await getPuzzle(env, a.puzzle_id);
  checkAccess(p, a.mode, who);
  let play = await getPlay(env, who.player.id, p.id, a.mode);
  if (a.verdict !== 'pending' || play.state === 'done') return { verdict: 'stale', ...(await roundState(env, who, p, a.mode)) };

  let out;
  if (body.yes) {
    const suggestion = a.canonical, norm = normalize(suggestion);
    await env.DB.prepare(`DELETE FROM venn_answers WHERE id = ?`).bind(a.id).run();
    const known = await knownAnswers(env, p);
    const got = await judgmentFor(env, p, suggestion, norm, who.player.id, { known, allowSuggest: false });
    out = await record(env, play, p, a.input, norm, got.j);
  } else {
    await env.DB.prepare(`UPDATE venn_answers SET verdict = 'no', reason = ? WHERE id = ?`).bind(DECLINED, a.id).run();
    out = { answerId: a.id, verdict: 'no', canonical: '', fits: [], reason: DECLINED, count: play.count };
  }
  play = await getPlay(env, who.player.id, p.id, a.mode);
  if (play.state === 'paused') await resumePlay(env, play);
  play = await getPlay(env, who.player.id, p.id, a.mode);
  return { ...out, didYouMean: '', elapsed: Math.min(ROUND_MS, elapsedOf(play)), state: play.state };
}

/* ───────────── Complaints & notifications ───────────── */

export async function complain(env, who, body) {
  const a = await env.DB.prepare(`SELECT a.id, a.verdict FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id WHERE a.id = ? AND pl.player_id = ?`)
    .bind(Number(body.answerId), who.player.id).first();
  if (!a) throw new HttpError(404, 'Answer not found.');
  if (a.verdict !== 'no') throw new HttpError(400, 'Only answers marked ✗ can be reported.');
  const dup = await env.DB.prepare(`SELECT id FROM venn_complaints WHERE answer_id = ? AND player_id = ?`).bind(a.id, who.player.id).first();
  if (dup) return { ok: true, already: true };
  await env.DB.prepare(`INSERT INTO venn_complaints (answer_id, player_id, note, created_at) VALUES (?, ?, ?, ?)`)
    .bind(a.id, who.player.id, clampStr(body.note, 500), nowISO()).run();
  return { ok: true };
}

/** Resolved reports this player hasn't seen yet. They're marked seen as they're handed over. */
async function notifications(env, who) {
  const rows = (await env.DB.prepare(`
    SELECT c.id, c.status, c.admin_note, a.input, z.circles FROM venn_complaints c JOIN venn_answers a ON a.id = c.answer_id
    JOIN venn_plays pl ON pl.id = a.play_id JOIN venn_puzzles z ON z.id = pl.puzzle_id
    WHERE c.player_id = ? AND c.status != 'open' AND c.seen = 0 ORDER BY c.id DESC LIMIT 10`).bind(who.player.id).all()).results;
  if (rows.length) await env.DB.prepare(`UPDATE venn_complaints SET seen = 1 WHERE id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(r => r.id)).run();
  return rows.map(r => ({ id: r.id, status: r.status, note: r.admin_note, input: r.input, circles: safeJson(r.circles, []) }));
}

/* ───────────── Stats, streaks, archive ───────────── */

export function streaks(dates, today = todayUTC()) {
  const set = new Set(dates);
  let streak = 0, d = today;
  if (!set.has(d)) d = addDays(d, -1);
  while (set.has(d)) { streak++; d = addDays(d, -1); }
  let max = 0, run = 0, prev = null;
  [...set].sort().forEach(x => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; max = Math.max(max, run); prev = x; });
  return { streak, max };
}

export async function stats(env, who) {
  const rows = (await env.DB.prepare(`
    SELECT z.date, pl.mode, pl.score FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
    WHERE pl.player_id = ? AND pl.state = 'done' AND pl.mode IN ('daily','archive') AND z.${LIVE}`).bind(who.player.id).all()).results;
  const days = {};
  let aCount = 0, aSum = 0;
  rows.forEach(r => {
    if (r.mode === 'archive') { aCount++; aSum += r.score || 0; return; }
    days[r.date] = (days[r.date] || 0) + (r.score || 0);
  });
  const dates = Object.keys(days).sort();                  // a day counts if either round was finished
  const totals = dates.map(d => days[d]);
  const dist = [0, 0, 0, 0, 0, 0];                          // 0–39, 40–79, 80–119, 120–159, 160–199, 200
  totals.forEach(t => { dist[t >= DAY_MAX ? 5 : Math.min(4, Math.floor(t / 40))]++; });
  const s = streaks(dates);
  return {
    played: dates.length,
    avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    best: totals.length ? Math.max(...totals) : 0,
    streak: s.streak, maxStreak: s.max, dist,
    archive: { played: aCount, avg: aCount ? Math.round(aSum / aCount) : 0 }
  };
}

export async function archiveList(env, who) {
  const today = todayUTC();
  const rows = (await env.DB.prepare(`SELECT id, date, round, par FROM venn_puzzles WHERE date < ? AND ${LIVE} ORDER BY date DESC, round`).bind(today).all()).results;
  const mine = (await env.DB.prepare(`SELECT pl.puzzle_id, pl.mode, pl.score FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
      WHERE pl.player_id = ? AND z.date < ? AND pl.mode IN ('daily','archive') AND pl.state = 'done'`).bind(who.player.id, today).all()).results;
  const byDate = new Map();
  rows.forEach(r => {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, number: vennNumber(env, r.date), rounds: [] });
    const daily = mine.find(m => m.puzzle_id === r.id && m.mode === 'daily'), arch = mine.find(m => m.puzzle_id === r.id && m.mode === 'archive');
    byDate.get(r.date).rounds.push({ round: r.round, daily: daily ? daily.score : null, archive: arch ? arch.score : null });
  });
  return { days: [...byDate.values()] };
}

export async function archiveDay(env, who, date) {
  if (!isDate(date) || date >= todayUTC()) throw new HttpError(400, 'Pick a past day.');
  const puzzles = (await env.DB.prepare(`SELECT * FROM venn_puzzles WHERE date = ? AND ${LIVE} ORDER BY round`).bind(date).all()).results;
  if (!puzzles.length) throw new HttpError(404, 'No puzzles that day.');
  const rounds = [];
  for (const p of puzzles) {
    // If they played it on the day, show that result instead of a replay.
    const daily = await getPlay(env, who.player.id, p.id, 'daily');
    rounds.push(await roundState(env, who, p, daily && daily.state === 'done' ? 'daily' : 'archive'));
  }
  return { date, number: vennNumber(env, date), rounds, day: daySummary(rounds) };
}

export async function newUnlimited(env, who) {
  if (!who.isAdmin) throw new HttpError(403, 'Admins only.');
  const round = Math.random() < 0.5 ? 1 : 2;
  const history = await vennHistory(env, null);
  const p = (await generateVennPuzzle(env, round, todayUTC(), history)) || fallbackVennPuzzle(round, Math.floor(Math.random() * 1000), { categories: [], sets: new Set() });
  const row = await insertPuzzle(env, null, 'unlimited', p);
  return roundState(env, who, row, 'unlimited');
}

/* ───────────── Rescoring (used by admin) ───────────── */

/** Re-derives every answer's verdict in a play from the judgments, then its count and score. */
export async function rescorePlay(env, playId) {
  const db = env.DB;
  const play = await db.prepare(`SELECT * FROM venn_plays WHERE id = ?`).bind(playId).first();
  if (!play) return;
  const p = await getPuzzle(env, play.puzzle_id);
  const size = circlesOf(p).length;
  const answers = await answersFor(env, playId);
  const prior = [], stmts = [];
  for (const a of answers) {
    if (a.verdict === 'pending' || (a.verdict === 'no' && a.reason === DECLINED)) { prior.push(a); continue; }
    const j = await getJudgment(env, p.id, a.norm);
    if (!j) { prior.push(a); continue; }
    const v = verdictFor(j, size, prior);
    if (v.verdict !== a.verdict || (j.canonical || '') !== a.canonical || JSON.stringify(v.fits) !== a.fits) {
      stmts.push(db.prepare(`UPDATE venn_answers SET verdict = ?, canonical = ?, fits = ?, reason = ? WHERE id = ?`).bind(v.verdict, j.canonical || '', JSON.stringify(v.fits), v.reason, a.id));
    }
    prior.push({ ...a, verdict: v.verdict, canonical: j.canonical || '' });
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  const n = prior.filter(a => a.verdict === 'ok').length;
  await db.prepare(`UPDATE venn_plays SET count = ?, score = CASE WHEN state = 'done' THEN ? ELSE score END WHERE id = ?`).bind(n, roundScore(n, p.par), playId).run();
}

/** Rescores every play on a puzzle that used this answer (or all plays when norm is null). */
export async function rescorePuzzle(env, puzzleId, norm = null) {
  const rows = norm
    ? (await env.DB.prepare(`SELECT DISTINCT a.play_id AS id FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id WHERE pl.puzzle_id = ? AND a.norm = ?`).bind(puzzleId, norm).all()).results
    : (await env.DB.prepare(`SELECT id FROM venn_plays WHERE puzzle_id = ?`).bind(puzzleId).all()).results;
  for (const r of rows) await rescorePlay(env, r.id);
  return rows.length;
}

export { saveJudgment, getJudgment, DECLINED };
