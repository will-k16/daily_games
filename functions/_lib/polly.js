// Polly: each day has 3 questions from real polls of US adults. You guess what percent of Americans picked
// the left side, lock it in, and the real split is revealed. This file: scheduling (auto-fill, reuse),
// gameplay (today, lock-in, reveals, archive, unlimited), crowd comparisons, stats, reports and rescoring.
import { tipUrl, HttpError, nowISO, todayUTC, addDays, dayIndex, isDate, clampStr, safeJson } from './util.js';
import { bucksBalance, pollyLookOf } from './bucks.js';
import { spread } from '../../public/js/charts.js';
import {
  SLOTS, DAY_MAX, MIN_CROWD, questionScore, crowd, bucksForQuestion, dayBonus, staleReason
} from '../../public/js/polly-score.js';

export const HORIZON = 60;            // auto-fill looks this many days ahead (today included)
export const BANK_LOW_DAYS = 14;      // warn when fewer than 14 days (42 questions) of never-run questions remain
const MODES = ['daily', 'archive', 'unlimited'];
export const REASONS = { wrong: 'Number looks wrong', wording: 'Confusing wording', biased: 'Biased / unfair', other: 'Other' };

export function pollyNumber(env, date) {
  const launch = isDate(env.POLLY_LAUNCH_DATE) ? env.POLLY_LAUNCH_DATE : date;
  return Math.max(1, dayIndex(date) - dayIndex(launch) + 1);
}
const launchOf = (env, today) => (isDate(env.POLLY_LAUNCH_DATE) && env.POLLY_LAUNCH_DATE <= today ? env.POLLY_LAUNCH_DATE : today);

/* ───────────── Day rules (pure, tested) ───────────── */

/** Same source URL, ignoring the scheme, "www.", a trailing slash and any #fragment. */
export const urlKey = u => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');

/** The hard rules: at most 1 politics question, and no two questions from the same source URL. */
export function fitsDay(q, day) {
  if (q.topic === 'politics' && day.some(x => x.topic === 'politics')) return false;
  const k = urlKey(q.url);
  if (k && day.some(x => urlKey(x.url) === k)) return false;
  return true;
}

/**
 * Picks up to n questions for a day's empty slots from `pool` (already in preference order), given the
 * questions the day already has. Different topics where possible; the hard rules never relax.
 */
export function pickForDay(pool, day, n) {
  const picked = [], used = new Set(day.map(x => x.id));
  for (let i = 0; i < n; i++) {
    const cur = [...day, ...picked];
    const ok = pool.filter(q => !used.has(q.id) && fitsDay(q, cur));
    const q = ok.find(x => !cur.some(y => y.topic === x.topic)) || ok[0];
    if (!q) break;
    picked.push(q); used.add(q.id);
  }
  return picked;
}

/**
 * For reuse: approved questions that have run before, oldest last run first. Time-sensitive ones are skipped
 * entirely (a reused one would always be stale), as is anything already scheduled for today or later.
 */
export function reuseOrder(questions) {
  return questions.filter(q => q.status === 'approved' && !q.time_sensitive && q.last_run_date)
    .sort((a, b) => (a.last_run_date < b.last_run_date ? -1 : a.last_run_date > b.last_run_date ? 1 : a.id - b.id));
}

/** Polly streak: days with all 3 answered. A day with no poll doesn't break it. */
export function pollyStreaks(doneDates, pollDates, today, launch) {
  const D = new Set(doneDates), P = new Set(pollDates);
  let streak = 0, d = today;
  if (!D.has(d)) d = addDays(d, -1);
  while (d >= launch) {
    if (D.has(d)) streak++;
    else if (P.has(d)) break;
    d = addDays(d, -1);
  }
  let max = 0, run = 0;
  for (let x = launch; x <= today; x = addDays(x, 1)) {
    if (D.has(x)) { run++; max = Math.max(max, run); } else if (P.has(x) && x !== today) run = 0;
  }
  return { streak, max: Math.max(max, streak) };
}

/* ───────────── Schedule ───────────── */

async function dayRows(env, date) {
  return (await env.DB.prepare(`SELECT s.date AS run_date, s.slot, s.pinned, s.reused, q.* FROM polly_schedule s
      JOIN polly_questions q ON q.id = s.question_id WHERE s.date = ? ORDER BY s.slot`).bind(date).all()).results;
}

/** Approved questions that aren't scheduled anywhere, oldest approval first. */
async function bankPool(env) {
  return (await env.DB.prepare(`SELECT * FROM polly_questions q WHERE q.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM polly_schedule s WHERE s.question_id = q.id) ORDER BY q.approved_at, q.id`).all()).results;
}

/**
 * Puts bank questions into the empty slots of the next 60 days (today first), oldest approval first, following
 * the day rules. It never moves anything already scheduled. Past days that never ran (incomplete, nobody
 * played) give their questions back to the bank first.
 */
export async function autoFill(env, today = todayUTC()) {
  const db = env.DB;
  const stuck = (await db.prepare(`SELECT s.date FROM polly_schedule s WHERE s.date < ? GROUP BY s.date HAVING COUNT(*) < ?`).bind(today, SLOTS).all()).results;
  for (const r of stuck) {
    const played = await db.prepare(`SELECT 1 FROM polly_plays WHERE date = ? AND done > 0 LIMIT 1`).bind(r.date).first();
    if (!played) await db.prepare(`DELETE FROM polly_schedule WHERE date = ?`).bind(r.date).run();
  }
  const end = addDays(today, HORIZON - 1);
  const rowsAhead = async () => (await db.prepare(`SELECT s.date, s.slot, s.pinned, q.id, q.topic, q.url, q.time_sensitive, q.poll_end_date FROM polly_schedule s
      JOIN polly_questions q ON q.id = s.question_id WHERE s.date BETWEEN ? AND ?`).bind(today, end).all()).results;
  // A question that would be stale on its day goes back to the bank (unless the admin pinned it there, or someone
  // already answered it today), so a time-sensitive question only ever runs within 3 months of its poll.
  const drop = [];
  for (const r of await rowsAhead()) {
    if (r.pinned || !staleReason(r, r.date)) continue;
    if (r.date === today && await db.prepare(`SELECT 1 FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE pl.date = ? AND g.slot = ? LIMIT 1`).bind(r.date, r.slot).first()) continue;
    drop.push(db.prepare(`DELETE FROM polly_schedule WHERE date = ? AND slot = ?`).bind(r.date, r.slot));
  }
  if (drop.length) await db.batch(drop);
  const pool = await bankPool(env);
  if (!pool.length) return 0;
  const taken = await rowsAhead();
  const stmts = [];
  for (let i = 0; i < HORIZON && pool.length; i++) {
    const date = addDays(today, i);
    const day = taken.filter(t => t.date === date);
    const empty = [1, 2, 3].filter(s => !day.some(t => t.slot === s));
    if (!empty.length) continue;
    const picks = pickForDay(pool.filter(q => !staleReason(q, date)), day, empty.length);
    picks.forEach((q, j) => {
      stmts.push(db.prepare(`INSERT OR IGNORE INTO polly_schedule (date, slot, question_id, pinned, reused) VALUES (?, ?, ?, 0, 0)`).bind(date, empty[j], q.id));
      pool.splice(pool.indexOf(q), 1);
    });
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return stmts.length;
}

/**
 * The day's 3 questions in order, or [] when there's no poll. For today, empty slots are filled first:
 * auto-fill from the bank, then reuse (longest-ago run, never time-sensitive). Nothing is ever generated.
 */
export async function ensureDay(env, date) {
  const db = env.DB, today = todayUTC();
  let rows = await dayRows(env, date);
  if (date !== today) return rows.length >= SLOTS ? rows : [];
  if (rows.length < SLOTS) {
    await autoFill(env, today);
    rows = await dayRows(env, date);
  }
  if (rows.length < SLOTS) {
    const all = (await db.prepare(`SELECT q.* FROM polly_questions q WHERE q.status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM polly_schedule s WHERE s.question_id = q.id AND s.date >= ?)`).bind(today).all()).results;
    const empty = [1, 2, 3].filter(s => !rows.some(r => r.slot === s));
    const picks = pickForDay(reuseOrder(all), rows, empty.length);
    if (rows.length + picks.length === SLOTS) {
      await db.batch(picks.map((q, j) => db.prepare(`INSERT OR IGNORE INTO polly_schedule (date, slot, question_id, pinned, reused) VALUES (?, ?, ?, 0, 1)`).bind(today, empty[j], q.id)));
      rows = await dayRows(env, date);
    }
  }
  if (rows.length < SLOTS) {
    // No poll today. Unpinned questions go back to the bank so they run on the next full day.
    const played = await db.prepare(`SELECT 1 FROM polly_plays WHERE date = ? AND done > 0 LIMIT 1`).bind(today).first();
    if (!played && rows.length) await db.prepare(`DELETE FROM polly_schedule WHERE date = ? AND pinned = 0`).bind(today).run();
    return [];
  }
  if (rows.some(r => !r.last_run_date || r.last_run_date < today)) {
    await db.prepare(`UPDATE polly_questions SET last_run_date = ? WHERE id IN (?, ?, ?) AND (last_run_date IS NULL OR last_run_date < ?)`)
      .bind(today, rows[0].id, rows[1].id, rows[2].id, today).run();
  }
  return rows;
}

/* ───────────── Views ───────────── */

const publicQ = r => ({ slot: r.slot, short: r.short, left: r.left_label, right: r.right_label });

async function getPlay(env, playerId, date, mode) {
  return env.DB.prepare(`SELECT * FROM polly_plays WHERE player_id = ? AND date IS ? AND mode = ?`).bind(playerId, date, mode).first();
}
async function guessesFor(env, playId) {
  return (await env.DB.prepare(`SELECT * FROM polly_guesses WHERE play_id = ? ORDER BY slot`).bind(playId).all()).results;
}
async function sourceName(env, id) {
  const s = id ? await env.DB.prepare(`SELECT name FROM polly_sources WHERE id = ?`).bind(id).first() : null;
  return s ? s.name : '';
}

/** The WK players' split for a question on its day: only once 5+ players picked a side (skips don't count). */
async function wkSplit(env, questionId, date) {
  const rows = (await env.DB.prepare(`SELECT g.own, COUNT(DISTINCT pl.player_id) AS n FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id
      WHERE pl.mode = 'daily' AND pl.date = ? AND g.question_id = ? AND g.own IN ('left','right') GROUP BY g.own`).bind(date, questionId).all()).results;
  const left = (rows.find(r => r.own === 'left') || { n: 0 }).n, right = (rows.find(r => r.own === 'right') || { n: 0 }).n, n = left + right;
  if (n < MIN_CROWD) return { n, few: true };
  return { n, left: Math.round(100 * left / n) };
}

/** How everyone did on one question that day (daily plays only). */
async function questionCrowd(env, who, date, slot, myScore) {
  const rows = (await env.DB.prepare(`SELECT pl.player_id AS player, g.score FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id
      WHERE pl.mode = 'daily' AND pl.date = ? AND g.slot = ?`).bind(date, slot).all()).results;
  return crowd(rows, who.player.id, myScore, 10);
}

async function revealFor(env, who, r, g, date, mode) {
  const rep = await env.DB.prepare(`SELECT rp.status FROM polly_reports rp JOIN polly_guesses g ON g.id = rp.guess_id
      WHERE rp.player_id = ? AND g.question_id = ? ORDER BY rp.id DESC LIMIT 1`).bind(who.player.id, r.id).first();
  const counted = mode !== 'unlimited' && date;
  return {
    slot: g.slot, guessId: g.id, guess: g.guess, own: g.own, real: g.real, score: g.score,
    original: r.original_wording, source: await sourceName(env, r.source_id), url: r.url, pollEnd: r.poll_end_date, sample: r.sample_size,
    wk: counted ? await wkSplit(env, r.id, date) : null,
    crowd: counted ? await questionCrowd(env, who, date, g.slot, g.score) : null,
    report: rep ? rep.status : null,
    bucks: bucksForQuestion(g.score, mode)
  };
}

/** One day for one player in one mode: each question (with its reveal once answered), the day total and, when done, the summary. */
async function dayState(env, who, date, mode, rows) {
  const play = await getPlay(env, who.player.id, date, mode);
  const guesses = play ? await guessesFor(env, play.id) : [];
  const questions = [];
  for (const r of rows) {
    const g = guesses.find(x => x.slot === r.slot);
    questions.push(g ? { ...publicQ(r), answered: true, reveal: await revealFor(env, who, r, g, date, mode) } : { ...publicQ(r), answered: false });
  }
  const done = questions.filter(q => q.answered);
  const day = { total: done.reduce((s, q) => s + q.reveal.score, 0), done: done.length, of: SLOTS, max: DAY_MAX, mode };
  const out = { mode, questions, day };
  if (rows.length && done.length === SLOTS) out.summary = await summaryFor(env, who, date, mode, questions, day.total);
  return out;
}

/** The end-of-day summary: how everyone did for the day, and "you vs America". */
async function summaryFor(env, who, date, mode, questions, total) {
  const rows = (await env.DB.prepare(`SELECT player_id AS player, total AS score FROM polly_plays WHERE date = ? AND mode = 'daily' AND done >= ?`)
    .bind(date, SLOTS).all()).results;
  const sided = questions.filter(q => q.reveal && q.reveal.own && q.reveal.real !== 50);
  const agreed = sided.filter(q => (q.reveal.real > 50 ? 'left' : 'right') === q.reveal.own).length;
  const bucks = questions.reduce((s, q) => s + (q.reveal ? q.reveal.bucks : 0), 0) + dayBonus(mode);
  return { total, crowd: crowd(rows, who.player.id, total, 30), agree: { agreed, of: sided.length }, bucks };
}

/* ───────────── Player endpoints ───────────── */

const meOf = who => ({ signedIn: who.signedIn, email: who.email, isAdmin: who.isAdmin, hasPassword: who.hasPassword, polly: pollyLookOf(who.player) });

export async function today(env, who) {
  const date = todayUTC();
  const rows = await ensureDay(env, date);
  const state = await dayState(env, who, date, 'daily', rows);
  const st = await stats(env, who);
  return {
    date, number: pollyNumber(env, date), noPoll: rows.length < SLOTS, ...state,
    me: meOf(who), bucks: await bucksBalance(env, who.player.id), notifications: await notifications(env, who),
    streak: st.streak, played: st.played, tipUrl: tipUrl(env), nextReset: addDays(date, 1) + 'T00:00:00Z'
  };
}

/** Today's Polly status for the suite home page and the combined share. */
export async function dayStatus(env, who, date) {
  const rows = date === todayUTC() ? await ensureDay(env, date) : await dayRows(env, date);
  const play = rows.length >= SLOTS ? await getPlay(env, who.player.id, date, 'daily') : null;
  const guesses = play ? await guessesFor(env, play.id) : [];
  return {
    date, number: pollyNumber(env, date), noPoll: rows.length < SLOTS, done: guesses.length, of: SLOTS, max: DAY_MAX,
    total: guesses.reduce((s, g) => s + g.score, 0), questions: guesses.map(g => ({ slot: g.slot, score: g.score }))
  };
}

function readGuess(body) {
  const guess = Number(body.guess);
  if (!Number.isInteger(guess) || guess < 0 || guess > 100) throw new HttpError(400, 'Guess a whole number from 0 to 100.');
  return { guess, own: body.own === 'left' || body.own === 'right' ? body.own : null };
}

/** Locks in one answer. The real number is never sent before this. A second lock for the same question is a 409. */
async function lockIn(env, who, date, mode, rows, body) {
  const db = env.DB;
  const slot = Number(body.slot);
  const r = rows.find(x => x.slot === slot);
  if (!r) throw new HttpError(404, 'No such question.');
  const { guess, own } = readGuess(body);
  let play = await getPlay(env, who.player.id, date, mode);
  if (!play) {
    await db.prepare(`INSERT OR IGNORE INTO polly_plays (player_id, date, mode, created_at) VALUES (?, ?, ?, ?)`).bind(who.player.id, date, mode, nowISO()).run();
    play = await getPlay(env, who.player.id, date, mode);
  }
  const before = await guessesFor(env, play.id);
  if (before.some(g => g.slot === slot)) throw new HttpError(409, 'You already locked that one in.');
  const next = [1, 2, 3].find(s => !before.some(g => g.slot === s));
  if (slot !== next) throw new HttpError(409, 'Answer the questions in order.');
  const score = questionScore(guess, r.real);
  const ins = await db.prepare(`INSERT OR IGNORE INTO polly_guesses (play_id, slot, question_id, own, guess, real, score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(play.id, slot, r.id, own, guess, r.real, score, nowISO()).first();
  if (!ins) throw new HttpError(409, 'You already locked that one in.');
  await refreshPlay(env, play.id);
  const state = await dayState(env, who, date, mode, rows);
  const q = state.questions.find(x => x.slot === slot);
  return { ...state, reveal: q.reveal, bucks: await bucksBalance(env, who.player.id) };
}

/** Re-derives a play's total and count from its guesses. */
function refreshPlay(env, playId) {
  return env.DB.prepare(`UPDATE polly_plays SET total = (SELECT COALESCE(SUM(score), 0) FROM polly_guesses WHERE play_id = polly_plays.id),
      done = (SELECT COUNT(*) FROM polly_guesses WHERE play_id = polly_plays.id),
      finished_at = CASE WHEN (SELECT COUNT(*) FROM polly_guesses WHERE play_id = polly_plays.id) >= ? THEN COALESCE(finished_at, ?) ELSE finished_at END
      WHERE id = ?`).bind(SLOTS, nowISO(), playId).run();
}

export async function lock(env, who, body) {
  const date = todayUTC();
  const rows = await ensureDay(env, date);
  if (rows.length < SLOTS) throw new HttpError(404, 'No poll today. Check back tomorrow.');
  return lockIn(env, who, date, 'daily', rows, body);
}

/** The day's summary (once all three are answered). */
export async function summary(env, who, q) {
  const date = isDate(q.get('date')) ? q.get('date') : todayUTC();
  const rows = date === todayUTC() ? await ensureDay(env, date) : await dayRows(env, date);
  if (rows.length < SLOTS) throw new HttpError(404, 'No poll that day.');
  const mode = MODES.includes(q.get('mode')) && q.get('mode') !== 'unlimited' ? q.get('mode') : 'daily';
  const state = await dayState(env, who, date, mode, rows);
  if (!state.summary) throw new HttpError(403, 'Answer all three first.');
  return { date, number: pollyNumber(env, date), ...state };
}

/* ───────────── Archive ───────────── */

export async function archiveList(env, who) {
  const today = todayUTC();
  const dates = (await env.DB.prepare(`SELECT date FROM polly_schedule WHERE date < ? GROUP BY date HAVING COUNT(*) >= ? ORDER BY date DESC`).bind(today, SLOTS).all()).results;
  const mine = (await env.DB.prepare(`SELECT date, mode, total, done FROM polly_plays WHERE player_id = ? AND date < ? AND mode IN ('daily','archive')`).bind(who.player.id, today).all()).results;
  return {
    days: dates.map(({ date }) => {
      const d = mine.find(m => m.date === date && m.mode === 'daily'), a = mine.find(m => m.date === date && m.mode === 'archive');
      return { date, number: pollyNumber(env, date), daily: d ? { total: d.total, done: d.done } : null, archive: a ? { total: a.total, done: a.done } : null };
    })
  };
}

/** A past day: what you played on the day if you finished it then, otherwise an archive replay. */
async function archiveMode(env, who, date) {
  const d = await getPlay(env, who.player.id, date, 'daily');
  return d && d.done >= SLOTS ? 'daily' : 'archive';
}

export async function archiveDay(env, who, date) {
  if (!isDate(date) || date >= todayUTC()) throw new HttpError(400, 'Pick a past day.');
  const rows = await dayRows(env, date);
  if (rows.length < SLOTS) throw new HttpError(404, 'No poll that day.');
  const state = await dayState(env, who, date, await archiveMode(env, who, date), rows);
  return { date, number: pollyNumber(env, date), ...state };
}

export async function archiveLock(env, who, body) {
  const date = String(body.date || '');
  if (!isDate(date) || date >= todayUTC()) throw new HttpError(400, 'Pick a past day.');
  const rows = await dayRows(env, date);
  if (rows.length < SLOTS) throw new HttpError(404, 'No poll that day.');
  if (await archiveMode(env, who, date) === 'daily') throw new HttpError(409, 'You played this day already.');
  return lockIn(env, who, date, 'archive', rows, body);
}

/* ───────────── Unlimited (admin only) ───────────── */

export async function unlimitedNext(env, who) {
  if (!who.isAdmin) throw new HttpError(403, 'Admins only.');
  const q = await env.DB.prepare(`SELECT * FROM polly_questions WHERE status = 'approved' ORDER BY RANDOM() LIMIT 1`).first();
  if (!q) throw new HttpError(404, 'No approved questions yet. Add some in admin.');
  return { questionId: q.id, question: { ...publicQ({ ...q, slot: 1 }) } };
}

export async function unlimitedLock(env, who, body) {
  if (!who.isAdmin) throw new HttpError(403, 'Admins only.');
  const q = await env.DB.prepare(`SELECT * FROM polly_questions WHERE id = ? AND status = 'approved'`).bind(Number(body.questionId)).first();
  if (!q) throw new HttpError(404, 'Question not found.');
  const { guess, own } = readGuess(body);
  const play = await env.DB.prepare(`INSERT INTO polly_plays (player_id, date, mode, created_at) VALUES (?, NULL, 'unlimited', ?) RETURNING id`).bind(who.player.id, nowISO()).first();
  const g = await env.DB.prepare(`INSERT INTO polly_guesses (play_id, slot, question_id, own, guess, real, score, created_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(play.id, q.id, own, guess, q.real, questionScore(guess, q.real), nowISO()).first();
  await refreshPlay(env, play.id);
  return { reveal: await revealFor(env, who, { ...q, slot: 1 }, g, null, 'unlimited') };
}

/* ───────────── Reports and notes ───────────── */

export async function report(env, who, body) {
  const g = await env.DB.prepare(`SELECT g.id, g.question_id FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE g.id = ? AND pl.player_id = ?`)
    .bind(Number(body.guessId), who.player.id).first();
  if (!g) throw new HttpError(404, 'Answer not found.');
  const reason = Object.keys(REASONS).includes(body.reason) ? body.reason : null;
  if (!reason) throw new HttpError(400, 'Pick a reason.');
  const note = clampStr(body.note, 300);
  if (reason === 'other' && !note) throw new HttpError(400, 'Tell us a little about it.');
  const dup = await env.DB.prepare(`SELECT rp.id FROM polly_reports rp JOIN polly_guesses g ON g.id = rp.guess_id WHERE rp.player_id = ? AND g.question_id = ?`)
    .bind(who.player.id, g.question_id).first();
  if (dup) return { ok: true, already: true };
  await env.DB.prepare(`INSERT INTO polly_reports (guess_id, player_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(g.id, who.player.id, reason, note, nowISO()).run();
  return { ok: true };
}

/** Resolved reports this player hasn't seen yet. They're marked seen as they're handed over. */
async function notifications(env, who) {
  const rows = (await env.DB.prepare(`SELECT rp.id, rp.status, q.short FROM polly_reports rp JOIN polly_guesses g ON g.id = rp.guess_id
      JOIN polly_questions q ON q.id = g.question_id WHERE rp.player_id = ? AND rp.status != 'open' AND rp.seen = 0 ORDER BY rp.id DESC LIMIT 10`).bind(who.player.id).all()).results;
  if (rows.length) await env.DB.prepare(`UPDATE polly_reports SET seen = 1 WHERE id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(r => r.id)).run();
  return rows.map(r => ({ status: r.status, short: r.short }));
}

/* ───────────── Stats ───────────── */

const one = n => Math.round(n * 10) / 10;

export async function stats(env, who) {
  const db = env.DB, today = todayUTC(), launch = launchOf(env, today);
  const [plays, guesses, polls] = await Promise.all([
    db.prepare(`SELECT date, mode, total, done FROM polly_plays WHERE player_id = ? AND mode IN ('daily','archive')`).bind(who.player.id).all(),
    db.prepare(`SELECT g.guess, g.real, g.own FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE pl.player_id = ? AND pl.mode = 'daily'`).bind(who.player.id).all(),
    db.prepare(`SELECT date FROM polly_schedule WHERE date BETWEEN ? AND ? GROUP BY date HAVING COUNT(*) >= ?`).bind(launch, today, SLOTS).all()
  ]);
  const daily = plays.results.filter(p => p.mode === 'daily' && p.done >= SLOTS);
  const arch = plays.results.filter(p => p.mode === 'archive' && p.done >= SLOTS);
  const totals = daily.map(p => p.total);
  const dist = spread(totals, DAY_MAX);
  const s = pollyStreaks(daily.map(p => p.date), polls.results.map(r => r.date), today, launch);
  const g = guesses.results;
  const sided = g.filter(x => x.own && x.real !== 50);
  const agreed = sided.filter(x => (x.real > 50 ? 'left' : 'right') === x.own).length;
  return {
    played: daily.length,
    avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    best: totals.length ? Math.max(...totals) : 0,
    streak: s.streak, maxStreak: s.max, dist,
    archive: { played: arch.length, avg: arch.length ? Math.round(arch.reduce((a, p) => a + p.total, 0) / arch.length) : 0 },
    questions: g.length,
    avgMiss: g.length ? one(g.reduce((a, x) => a + Math.abs(x.guess - x.real), 0) / g.length) : null,
    lean: g.length ? one(g.reduce((a, x) => a + Math.abs(x.guess - 50) - Math.abs(x.real - 50), 0) / g.length) : null,
    agree: { pct: sided.length ? Math.round(100 * agreed / sided.length) : null, n: sided.length }
  };
}

/** Days with at least one daily Polly question answered (for the suite's WK streak). */
export async function wkDates(env, who) {
  return (await env.DB.prepare(`SELECT DISTINCT date FROM polly_plays WHERE player_id = ? AND mode = 'daily' AND done > 0 AND date IS NOT NULL`)
    .bind(who.player.id).all()).results.map(r => r.date);
}

/* ───────────── Rescoring (used by admin) ───────────── */

/** A fix changed `real`: every play of the question (daily, archive and unlimited) is rescored and its total recomputed. */
export async function rescoreQuestion(env, questionId, real) {
  const db = env.DB;
  const rows = (await db.prepare(`SELECT id, play_id, guess FROM polly_guesses WHERE question_id = ?`).bind(questionId).all()).results;
  const stmts = rows.map(g => db.prepare(`UPDATE polly_guesses SET real = ?, score = ? WHERE id = ?`).bind(real, questionScore(g.guess, real), g.id));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  const plays = [...new Set(rows.map(g => g.play_id))];
  for (const id of plays) await refreshPlay(env, id);
  return rows.length;
}

export { dayRows };
