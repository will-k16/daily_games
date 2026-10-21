// Admin for Venn: the calendar of drafts (approve / edit / reject, par), complaints, and the judgment
// cache editor. Every change to a judgment or par rescores the plays it touches.
import { HttpError, nowISO, todayUTC, addDays, isDate, dayIndex, clampStr, normalize, safeJson } from './util.js';
import { generateVennPuzzle, fallbackVennPuzzle, vennHistory, catKey } from './venn-ai.js';
import { insertPuzzle, rescorePuzzle, saveJudgment as storeJudgment, getJudgment, vennNumber } from './venn.js';
import { parFor, MIN_ANSWERS, ROUND_MAX, DAY_MAX } from '../../public/js/venn-score.js';
import { spread } from '../../public/js/charts.js';

const LIVE = `status IN ('approved','auto')`;

function adminPuzzle(z, env) {
  return {
    id: z.id, date: z.date, round: z.round, status: z.status, circles: safeJson(z.circles, []), par: z.par, typical: z.typical,
    answers: safeJson(z.answers, []), note: z.note, plays: z.plays || 0, number: z.date ? vennNumber(env, z.date) : null
  };
}

export async function calendar(env, q) {
  const from = isDate(q.get('from')) ? q.get('from') : addDays(todayUTC(), -14);
  const to = isDate(q.get('to')) ? q.get('to') : addDays(todayUTC(), 30);
  const rows = (await env.DB.prepare(`
    SELECT z.*, (SELECT COUNT(*) FROM venn_plays pl WHERE pl.puzzle_id = z.id) AS plays
    FROM venn_puzzles z WHERE z.date BETWEEN ? AND ? AND z.status != 'unlimited' ORDER BY z.date, z.round, z.id`).bind(from, to).all()).results;
  return { from, to, today: todayUTC(), puzzles: rows.map(z => adminPuzzle(z, env)) };
}

/** AI drafts: either one (date + round, what the admin page sends, one at a time) or every empty round in [from, from + days). */
export async function generate(env, body) {
  const db = env.DB;
  const one = isDate(body.date) && [1, 2].includes(Number(body.round));
  const jobs = [];
  if (one) {
    const live = await db.prepare(`SELECT z.id, (SELECT COUNT(*) FROM venn_plays pl WHERE pl.puzzle_id = z.id) AS plays FROM venn_puzzles z
        WHERE z.date = ? AND z.round = ? AND z.${LIVE}`).bind(body.date, Number(body.round)).first();
    if (live && live.plays > 0) throw new HttpError(409, 'People already played this round that day.');
    jobs.push([body.date, Number(body.round)]);
  } else {
    const from = isDate(body.from) ? body.from : addDays(todayUTC(), 1);
    const days = Math.max(1, Math.min(7, Number(body.days) || 3));
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      const taken = (await db.prepare(`SELECT round FROM venn_puzzles WHERE date = ? AND status IN ('approved','auto','draft')`).bind(date).all()).results.map(r => r.round);
      [1, 2].filter(r => !taken.includes(r)).forEach(r => jobs.push([date, r]));
    }
  }
  let made = 0, fromBank = 0, last = null;
  for (const [date, round] of jobs) {
    const history = await vennHistory(env, date);
    // If the AI is busy or its drafts don't pass the checks, a puzzle from the built-in bank becomes the
    // draft instead (marked in its note), so Generate always produces something to review.
    let p = await generateVennPuzzle(env, round, date, history);
    if (!p) { p = fallbackVennPuzzle(round, dayIndex(date) + Math.floor(Math.random() * 7), history); p.note = 'AI was busy, so this one is from the built-in bank.'; fromBank++; }
    last = await insertPuzzle(env, date, 'draft', p);
    made++;
  }
  return { made, fromBank, puzzle: last ? adminPuzzle(last, env) : null };
}

/** Create or update a puzzle. Approving demotes any other unplayed live puzzle for that day + round. */
export async function savePuzzle(env, body) {
  const db = env.DB;
  const id = Number(body.id) || null;
  const old = id ? await db.prepare(`SELECT * FROM venn_puzzles WHERE id = ?`).bind(id).first() : null;
  if (id && !old) throw new HttpError(404, 'Puzzle not found.');
  const plays = old ? (await db.prepare(`SELECT COUNT(*) AS n FROM venn_plays WHERE puzzle_id = ?`).bind(id).first()).n : 0;
  const allowed = ['draft', 'approved', 'rejected'].concat(old && old.status === 'auto' ? ['auto'] : []);
  const status = allowed.includes(body.status) ? body.status : 'draft';
  if (old && plays && old.status !== status && (status === 'draft' || status === 'rejected')) throw new HttpError(409, 'People already played this puzzle, so it has to stay live.');
  const date = isDate(body.date) ? body.date : null;
  const round = [1, 2].includes(Number(body.round)) ? Number(body.round) : null;
  if (!date || !round) throw new HttpError(400, 'Pick a date and a round.');
  const n = round === 2 ? 3 : 2;
  const circles = (Array.isArray(body.circles) ? body.circles : []).map(c => clampStr(c, 60).replace(/\s+/g, ' ')).filter(Boolean);
  if (circles.length !== n) throw new HttpError(400, `Round ${round} needs exactly ${n} categories.`);
  if (new Set(circles.map(catKey)).size !== n) throw new HttpError(400, 'The categories have to be different.');
  const answers = [...new Set((Array.isArray(body.answers) ? body.answers : String(body.answers || '').split('\n')).map(a => clampStr(a, 60)).filter(Boolean))];
  const typical = Math.max(0, Math.round(Number(body.typical) || (old ? old.typical : 0)));
  const par = Math.max(1, Math.round(Number(body.par) || parFor(typical, round)));
  if (old && plays && (old.date !== date || old.round !== round)) throw new HttpError(409, 'People already played this puzzle, so its day and round can\'t move.');
  if (old && plays && JSON.stringify(circles) !== old.circles) throw new HttpError(409, 'People already played this puzzle, so its categories can\'t change. Par and answers still can.');

  if (status === 'approved' || status === 'auto') {
    const live = (await db.prepare(`SELECT z.id, (SELECT COUNT(*) FROM venn_plays pl WHERE pl.puzzle_id = z.id) AS plays FROM venn_puzzles z
        WHERE z.date = ? AND z.round = ? AND z.${LIVE} AND z.id != ?`).bind(date, round, id || 0).all()).results;
    if (live.some(l => l.plays > 0)) throw new HttpError(409, 'People already played a different puzzle in that round that day. Edit that one instead.');
    if (live.length) await db.prepare(`UPDATE venn_puzzles SET status = 'draft' WHERE id IN (${live.map(() => '?').join(',')})`).bind(...live.map(l => l.id)).run();
  }
  const vals = [date, round, status, JSON.stringify(circles), par, typical, JSON.stringify(answers), clampStr(body.note, 200)];
  if (old) {
    await db.prepare(`UPDATE venn_puzzles SET date = ?, round = ?, status = ?, circles = ?, par = ?, typical = ?, answers = ?, note = ? WHERE id = ?`).bind(...vals, id).run();
    if (plays && old.par !== par) await rescorePuzzle(env, id);
  } else {
    await db.prepare(`INSERT INTO venn_puzzles (date, round, status, circles, par, typical, answers, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...vals, nowISO()).run();
  }
  return { ok: true, warning: answers.length < MIN_ANSWERS[round] ? `Only ${answers.length} answers listed (drafts need ${MIN_ANSWERS[round]}).` : '' };
}

export async function deletePuzzle(env, body) {
  const id = Number(body.id);
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM venn_plays WHERE puzzle_id = ?`).bind(id).first();
  if (n.n > 0) throw new HttpError(409, 'People already played this one. Reject it instead of deleting.');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM venn_judgments WHERE puzzle_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM venn_puzzles WHERE id = ?`).bind(id)
  ]);
  return { ok: true };
}

/* ───────────── Complaints ───────────── */

export async function complaints(env, q) {
  const status = ['open', 'accepted', 'rejected'].includes(q.get('status')) ? q.get('status') : 'open';
  const rows = (await env.DB.prepare(`
    SELECT c.*, a.input, a.norm, a.canonical, a.reason, a.fits, z.id AS puzzle_id, z.date, z.round, z.circles,
      (SELECT COUNT(*) FROM venn_answers a2 JOIN venn_plays p2 ON p2.id = a2.play_id WHERE p2.puzzle_id = z.id AND a2.norm = a.norm) AS uses
    FROM venn_complaints c JOIN venn_answers a ON a.id = c.answer_id JOIN venn_plays pl ON pl.id = a.play_id JOIN venn_puzzles z ON z.id = pl.puzzle_id
    WHERE c.status = ? ORDER BY c.id DESC LIMIT 200`).bind(status).all()).results;
  return { complaints: rows.map(r => ({ ...r, circles: safeJson(r.circles, []), fits: safeJson(r.fits, []) })) };
}

/** Accepting makes that answer ✓ for this puzzle and rescores every play that has it. */
export async function resolveComplaint(env, body) {
  const db = env.DB;
  const c = await db.prepare(`SELECT c.*, a.input, a.norm, a.canonical, pl.puzzle_id, z.circles FROM venn_complaints c JOIN venn_answers a ON a.id = c.answer_id
      JOIN venn_plays pl ON pl.id = a.play_id JOIN venn_puzzles z ON z.id = pl.puzzle_id WHERE c.id = ?`).bind(Number(body.id)).first();
  if (!c) throw new HttpError(404, 'Complaint not found.');
  const accept = !!body.accept;
  let rescored = 0;
  if (accept) {
    const n = safeJson(c.circles, []).length;
    const was = await getJudgment(env, c.puzzle_id, c.norm);
    const canonical = clampStr(body.canonical, 80) || (was && was.canonical) || c.canonical || c.input;
    await storeJudgment(env, c.puzzle_id, c.norm, { canonical, fits: Array.from({ length: n }, () => true), reason: '', suggestion: '', offensive: false, fictional: false }, 'admin');
    rescored = await rescorePuzzle(env, c.puzzle_id, c.norm);
  }
  // Resolve every open complaint about the same answer on the same puzzle the same way.
  await db.prepare(`UPDATE venn_complaints SET status = ?, admin_note = ?, resolved_at = ?, seen = 0
      WHERE status = 'open' AND answer_id IN (SELECT a.id FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id WHERE pl.puzzle_id = ? AND a.norm = ?)`)
    .bind(accept ? 'accepted' : 'rejected', clampStr(body.adminNote, 300), nowISO(), c.puzzle_id, c.norm).run();
  await db.prepare(`UPDATE venn_complaints SET status = ?, admin_note = ?, resolved_at = ?, seen = 0 WHERE id = ?`)
    .bind(accept ? 'accepted' : 'rejected', clampStr(body.adminNote, 300), nowISO(), c.id).run();
  return { ok: true, rescored };
}

/* ───────────── Judgment cache ───────────── */

export async function judgments(env, q) {
  const db = env.DB;
  const puzzleId = Number(q.get('puzzle')) || null;
  const needle = normalize(q.get('q') || '');
  const rows = (await db.prepare(`
    SELECT j.*, z.date, z.round, z.circles,
      (SELECT COUNT(*) FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id WHERE pl.puzzle_id = j.puzzle_id AND a.norm = j.norm) AS uses
    FROM venn_judgments j JOIN venn_puzzles z ON z.id = j.puzzle_id
    WHERE (? IS NULL OR j.puzzle_id = ?) AND (? = '' OR j.norm LIKE ? OR j.canonical LIKE ?)
    ORDER BY j.updated_at DESC LIMIT 300`).bind(puzzleId, puzzleId, needle, '%' + needle + '%', '%' + needle + '%').all()).results;
  return { judgments: rows.map(r => ({ ...r, fits: safeJson(r.fits, []), circles: safeJson(r.circles, []) })) };
}

/** Edit (or add) one cached verdict. Admin edits always win over the AI. */
export async function saveJudgment(env, body) {
  const db = env.DB;
  const z = await db.prepare(`SELECT * FROM venn_puzzles WHERE id = ?`).bind(Number(body.puzzleId)).first();
  if (!z) throw new HttpError(404, 'Puzzle not found.');
  const norm = normalize(body.norm || body.input || '');
  if (!norm) throw new HttpError(400, 'Type the answer this is about.');
  const n = safeJson(z.circles, []).length;
  const fits = Array.from({ length: n }, (_, i) => !!(Array.isArray(body.fits) && body.fits[i]));
  await storeJudgment(env, z.id, norm, {
    canonical: clampStr(body.canonical, 80), fits, reason: clampStr(body.reason, 100), suggestion: clampStr(body.suggestion, 60),
    offensive: !!body.offensive, fictional: !!body.fictional
  }, 'admin');
  const rescored = await rescorePuzzle(env, z.id, norm);
  return { ok: true, rescored };
}

export async function deleteJudgment(env, body) {
  const db = env.DB;
  const pid = Number(body.puzzleId), norm = String(body.norm || '');
  const used = await db.prepare(`SELECT COUNT(*) AS n FROM venn_answers a JOIN venn_plays pl ON pl.id = a.play_id WHERE pl.puzzle_id = ? AND a.norm = ?`).bind(pid, norm).first();
  if (used.n > 0) throw new HttpError(409, 'Players gave this answer. Edit it instead.');
  await db.prepare(`DELETE FROM venn_judgments WHERE puzzle_id = ? AND norm = ?`).bind(pid, norm).run();
  return { ok: true };
}

/* ───────────── Dashboard ───────────── */

/** Today's rounds and players, score spreads, 14 days of players, the judge's health, and the puzzle supply ahead. */
export async function dashboard(env) {
  const db = env.DB, date = todayUTC(), from = addDays(date, -13), since = new Date(Date.now() - 86400000).toISOString();
  const [players, finished, ever, rounds, open, week, scores, totals, ahead, judge, cached] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT pl.player_id) AS n FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id WHERE z.date = ? AND pl.mode = 'daily'`).bind(date).first(),
    db.prepare(`SELECT COUNT(*) AS n, AVG(t) AS avg FROM (SELECT pl.player_id, SUM(pl.score) AS t, COUNT(*) AS c FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
        WHERE z.date = ? AND pl.mode = 'daily' AND pl.state = 'done' GROUP BY pl.player_id HAVING c >= 2)`).bind(date).first(),
    db.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM venn_plays WHERE mode IN ('daily','archive')`).first(),
    db.prepare(`SELECT z.id, z.round, z.status, z.circles, z.par, z.typical, COUNT(pl.id) AS plays, SUM(pl.state = 'done') AS done, AVG(CASE WHEN pl.state = 'done' THEN pl.count END) AS avgCount,
          AVG(CASE WHEN pl.state = 'done' THEN pl.score END) AS avgScore, SUM(pl.state = 'done' AND pl.count >= z.par) AS madePar
        FROM venn_puzzles z LEFT JOIN venn_plays pl ON pl.puzzle_id = z.id AND pl.mode = 'daily'
        WHERE z.date = ? AND z.status IN ('approved','auto') GROUP BY z.id ORDER BY z.round`).bind(date).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM venn_complaints WHERE status = 'open'`).first(),
    db.prepare(`SELECT z.date, COUNT(DISTINCT pl.player_id) AS n FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
        WHERE pl.mode = 'daily' AND z.date >= ? GROUP BY z.date`).bind(from).all(),
    db.prepare(`SELECT pl.score FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id WHERE z.date = ? AND pl.mode = 'daily' AND pl.state = 'done'`).bind(date).all(),
    db.prepare(`SELECT SUM(pl.score) AS t FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
        WHERE z.date = ? AND pl.mode = 'daily' AND pl.state = 'done' GROUP BY pl.player_id HAVING COUNT(*) >= 2`).bind(date).all(),
    db.prepare(`SELECT date, round, status FROM venn_puzzles WHERE date > ? AND date <= ? AND status IN ('approved','auto','draft')`).bind(date, addDays(date, 7)).all(),
    db.prepare(`SELECT SUM(ok) AS ok, COUNT(*) - SUM(ok) AS fail, AVG(CASE WHEN ok = 1 THEN ms END) AS ms FROM ai_log WHERE kind = 'venn-judge' AND created_at >= ?`).bind(since).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM venn_judgments`).first()
  ]);
  const byDate = Object.fromEntries(week.results.map(w => [w.date, w.n]));
  const rHist = spread(scores.results.map(r => r.score || 0), ROUND_MAX), dHist = spread(totals.results.map(r => r.t || 0), DAY_MAX);
  // The next 7 days: each round approved, only a draft (it'll be used as-is), or empty (made on the spot).
  const next = Array.from({ length: 7 }, (_, i) => addDays(date, i + 1)).map(d => ({
    date: d,
    rounds: [1, 2].map(r => {
      const list = ahead.results.filter(a => a.date === d && a.round === r);
      return list.some(a => a.status === 'approved' || a.status === 'auto') ? 'approved' : list.length ? 'draft' : 'empty';
    })
  }));
  return {
    date, number: vennNumber(env, date), players: players.n, finished: finished.n, avgDay: finished.avg == null ? null : Math.round(finished.avg),
    ever: ever.n, openComplaints: open.n,
    rounds: rounds.results.map(r => ({ ...r, circles: safeJson(r.circles, []) })),
    week: Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)).map(d => ({ date: d, n: byDate[d] || 0 })),
    rHist, dHist, next, judge: { ok: judge.ok || 0, fail: judge.fail || 0, ms: judge.ms == null ? null : Math.round(judge.ms) }, cached: cached.n
  };
}
