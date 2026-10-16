import { HttpError, nowISO, todayUTC, addDays, isDate, dayIndex, clampStr, normalize } from './util.js';
import { generatePuzzles, cleanPuzzle } from './ai.js';
import { rescoreAnswer, rescorePuzzle } from './game.js';
import { PROPS } from '../../public/js/props.js';

export function requireAdmin(who) {
  if (!who.isAdmin) throw new HttpError(403, 'Admins only.');
}

export async function dashboard(env) {
  const db = env.DB, date = todayUTC(), since = new Date(Date.now() - 86400000).toISOString();
  const [players, signed, todayPlayers, rooms, ai, complaints, week] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM players`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM players WHERE google_sub IS NOT NULL`).first(),
    db.prepare(`SELECT COUNT(DISTINCT pl.player_id) AS n FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id WHERE z.date = ? AND pl.mode = 'daily'`).bind(date).first(),
    db.prepare(`SELECT z.slot, z.small_item, z.big_item, z.property, z.status, COUNT(pl.id) AS plays, AVG(pl.score) AS avg,
        SUM(pl.used_second) AS seconds FROM puzzles z LEFT JOIN plays pl ON pl.puzzle_id = z.id AND pl.mode = 'daily' AND pl.state = 'done'
        WHERE z.date = ? AND z.status IN ('approved','auto') GROUP BY z.id ORDER BY z.slot`).bind(date).all(),
    db.prepare(`SELECT provider, kind, SUM(ok) AS ok, COUNT(*) - SUM(ok) AS fail, AVG(ms) AS ms FROM ai_log WHERE created_at >= ? GROUP BY provider, kind`).bind(since).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM complaints WHERE status = 'open'`).first(),
    db.prepare(`SELECT z.date, COUNT(DISTINCT pl.player_id) AS n FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
        WHERE pl.mode = 'daily' AND z.date >= ? GROUP BY z.date ORDER BY z.date`).bind(addDays(date, -13)).all()
  ]);
  const dist = (await db.prepare(`SELECT pl.score FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
      WHERE z.date = ? AND pl.mode = 'daily' AND pl.state = 'done'`).bind(date).all()).results;
  const hist = new Array(11).fill(0);
  dist.forEach(r => hist[Math.min(10, Math.floor(r.score / 10))]++);
  const errors = (await db.prepare(`SELECT provider, kind, error, created_at FROM ai_log WHERE ok = 0 ORDER BY id DESC LIMIT 8`).all()).results;
  return {
    date, players: players.n, signedIn: signed.n, todayPlayers: todayPlayers.n,
    rooms: rooms.results, ai: ai.results, errors, openComplaints: complaints.n, hist, week: week.results
  };
}

/* ───────────── Calendar ───────────── */

export async function calendar(env, q) {
  const from = isDate(q.get('from')) ? q.get('from') : addDays(todayUTC(), -14);
  const to = isDate(q.get('to')) ? q.get('to') : addDays(todayUTC(), 30);
  const rows = (await env.DB.prepare(`
    SELECT z.*, (SELECT COUNT(*) FROM plays pl WHERE pl.puzzle_id = z.id) AS plays
    FROM puzzles z WHERE z.date BETWEEN ? AND ? AND z.status != 'unlimited' ORDER BY z.date, z.slot, z.id`).bind(from, to).all()).results;
  return { from, to, today: todayUTC(), puzzles: rows.map(adminPuzzle) };
}

function adminPuzzle(z) {
  return {
    id: z.id, date: z.date, slot: z.slot, status: z.status, property: z.property, unitLabel: z.unit_label,
    smallItem: z.small_item, smallValue: z.small_value, bigItem: z.big_item, bigValue: z.big_value,
    note: z.note, plays: z.plays || 0
  };
}

/** Writes AI drafts for each day in [from, from+days) that has no live puzzle or draft for a slot. */
export async function generateDrafts(env, body) {
  const from = isDate(body.from) ? body.from : addDays(todayUTC(), 1);
  const days = Math.max(1, Math.min(7, Number(body.days) || 3));
  const db = env.DB;
  const recent = (await db.prepare(`SELECT small_item, big_item FROM puzzles ORDER BY id DESC LIMIT 80`).all()).results.map(r => r.small_item + ' / ' + r.big_item);
  let made = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const taken = (await db.prepare(`SELECT slot FROM puzzles WHERE date = ? AND status IN ('approved','auto','draft')`).bind(date).all()).results.map(r => r.slot);
    const missing = [1, 2, 3].filter(s => !taken.includes(s));
    if (!missing.length) continue;
    const gen = await generatePuzzles(env, missing, { avoid: recent, seed: dayIndex(date) });
    const stmts = gen.map((p, j) => db.prepare(`INSERT INTO puzzles (date, slot, status, property, unit_label, small_item, small_value, big_item, big_value, note, created_at)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(date, missing[j], p.property, p.unitLabel, p.smallItem, p.smallValue, p.bigItem, p.bigValue, p.note, nowISO()));
    gen.forEach(p => recent.push(p.smallItem + ' / ' + p.bigItem));
    if (stmts.length) { await db.batch(stmts); made += stmts.length; }
  }
  return { made };
}

/** Create or update a puzzle. Approving demotes any other unplayed live puzzle for that day + slot. */
export async function savePuzzle(env, body) {
  const db = env.DB;
  const id = Number(body.id) || null;
  const old = id ? await db.prepare(`SELECT * FROM puzzles WHERE id = ?`).bind(id).first() : null;
  if (id && !old) throw new HttpError(404, 'Puzzle not found.');
  const allowed = ['draft', 'approved', 'rejected'].concat(old && old.status === 'auto' ? ['auto'] : []);
  const status = allowed.includes(body.status) ? body.status : 'draft';
  if (old && old.status !== status && (status === 'draft' || status === 'rejected')) {
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM plays WHERE puzzle_id = ?`).bind(id).first();
    if (n.n > 0) throw new HttpError(409, 'People already played this puzzle, so it has to stay live.');
  }
  const date = isDate(body.date) ? body.date : null;
  const slot = [1, 2, 3].includes(Number(body.slot)) ? Number(body.slot) : null;
  if (!date || !slot) throw new HttpError(400, 'Pick a date and a room.');
  const clean = cleanPuzzle({ ...body, tier: slot });
  if (!clean) throw new HttpError(400, 'Both items need names and positive values at least 20x apart, plus a property.');
  if (!PROPS[clean.property] && !clean.unitLabel) throw new HttpError(400, 'A custom property needs a unit.');

  if (status === 'approved' || status === 'auto') {
    const live = (await db.prepare(`SELECT z.id, (SELECT COUNT(*) FROM plays pl WHERE pl.puzzle_id = z.id) AS plays FROM puzzles z
        WHERE z.date = ? AND z.slot = ? AND z.status IN ('approved','auto') AND z.id != ?`).bind(date, slot, id || 0).all()).results;
    if (live.some(l => l.plays > 0)) throw new HttpError(409, 'People already played a different puzzle in that room that day. Edit that one instead.');
    if (live.length) await db.prepare(`UPDATE puzzles SET status = 'draft' WHERE id IN (${live.map(() => '?').join(',')})`).bind(...live.map(l => l.id)).run();
  }

  const vals = [date, slot, status, clean.property, clean.unitLabel, clean.smallItem, clean.smallValue, clean.bigItem, clean.bigValue, clampStr(body.note, 200)];
  if (old) {
    if (old.date !== date || old.slot !== slot) {
      const n = await db.prepare(`SELECT COUNT(*) AS n FROM plays WHERE puzzle_id = ?`).bind(id).first();
      if (n.n > 0) throw new HttpError(409, 'People already played this puzzle, so its day and room can\'t move.');
    }
    await db.prepare(`UPDATE puzzles SET date = ?, slot = ?, status = ?, property = ?, unit_label = ?, small_item = ?, small_value = ?, big_item = ?, big_value = ?, note = ? WHERE id = ?`)
      .bind(...vals, id).run();
    if (old.small_value !== clean.smallValue || old.big_value !== clean.bigValue) await rescorePuzzle(env, id);
  } else {
    await db.prepare(`INSERT INTO puzzles (date, slot, status, property, unit_label, small_item, small_value, big_item, big_value, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...vals, nowISO()).run();
  }
  return { ok: true };
}

export async function setPuzzleStatus(env, body) {
  const z = await env.DB.prepare(`SELECT * FROM puzzles WHERE id = ?`).bind(Number(body.id)).first();
  if (!z) throw new HttpError(404, 'Puzzle not found.');
  return savePuzzle(env, {
    id: z.id, date: z.date, slot: z.slot, status: body.status, property: z.property, unitLabel: z.unit_label,
    smallItem: z.small_item, smallValue: z.small_value, bigItem: z.big_item, bigValue: z.big_value, note: z.note
  });
}

export async function deletePuzzle(env, body) {
  const id = Number(body.id);
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM plays WHERE puzzle_id = ?`).bind(id).first();
  if (n.n > 0) throw new HttpError(409, 'People already played this one. Reject it instead of deleting.');
  await env.DB.prepare(`DELETE FROM puzzles WHERE id = ?`).bind(id).run();
  return { ok: true };
}

/* ───────────── Complaints ───────────── */

export async function complaints(env, q) {
  const status = ['open', 'accepted', 'rejected'].includes(q.get('status')) ? q.get('status') : 'open';
  const rows = (await env.DB.prepare(`
    SELECT c.*, g.input, g.name, g.value, g.raw_score, g.score, g.attempt, g.answer_key,
      z.date, z.slot, z.property, z.unit_label, z.small_item, z.small_value, z.big_item, z.big_value,
      (SELECT COUNT(*) FROM guesses g2 WHERE g2.answer_key = g.answer_key) AS uses
    FROM complaints c JOIN guesses g ON g.id = c.guess_id JOIN plays pl ON pl.id = g.play_id JOIN puzzles z ON z.id = pl.puzzle_id
    WHERE c.status = ? ORDER BY c.id DESC LIMIT 200`).bind(status).all()).results;
  return { complaints: rows };
}

export async function resolveComplaint(env, body) {
  const db = env.DB;
  const c = await db.prepare(`SELECT c.*, g.answer_key FROM complaints c JOIN guesses g ON g.id = c.guess_id WHERE c.id = ?`).bind(Number(body.id)).first();
  if (!c) throw new HttpError(404, 'Complaint not found.');
  const accept = !!body.accept;
  let rescored = 0;
  if (accept && body.value !== undefined && body.value !== '') {
    const v = Number(body.value);
    if (!(v > 0)) throw new HttpError(400, 'The corrected value must be a positive number.');
    await db.prepare(`UPDATE answers SET value = ?, name = COALESCE(NULLIF(?, ''), name), status = 'ok', source = 'admin', updated_at = ? WHERE key = ?`)
      .bind(v, clampStr(body.name, 120), nowISO(), c.answer_key).run();
    rescored = await rescoreAnswer(env, c.answer_key);
  }
  // Resolve every open complaint about the same answer the same way.
  await db.prepare(`UPDATE complaints SET status = ?, admin_note = ?, resolved_at = ?, seen = 0
      WHERE status = 'open' AND guess_id IN (SELECT id FROM guesses WHERE answer_key = ?)`)
    .bind(accept ? 'accepted' : 'rejected', clampStr(body.adminNote, 300), nowISO(), c.answer_key).run();
  await db.prepare(`UPDATE complaints SET status = ?, admin_note = ?, resolved_at = ?, seen = 0 WHERE id = ?`)
    .bind(accept ? 'accepted' : 'rejected', clampStr(body.adminNote, 300), nowISO(), c.id).run();
  return { ok: true, rescored };
}

/* ───────────── Answer cache ───────────── */

export async function answers(env, q) {
  const needle = normalize(q.get('q') || '');
  const pending = q.get('pending') === '1';
  let rows;
  if (pending) {
    // Answers that would show in "top answers" if approved: used once, not approved, scored well.
    rows = (await env.DB.prepare(`
      SELECT a.*, COUNT(DISTINCT pl.player_id) AS players, MAX(g.raw_score) AS best FROM answers a
      JOIN guesses g ON g.answer_key = a.key JOIN plays pl ON pl.id = g.play_id
      WHERE a.status = 'ok' AND a.approved = 0 AND a.flagged = 0 AND g.out_of_range = 0 AND pl.mode = 'daily'
      GROUP BY a.key HAVING players < 2 ORDER BY best DESC LIMIT 100`).all()).results;
  } else {
    rows = (await env.DB.prepare(`
      SELECT a.*, (SELECT COUNT(*) FROM guesses g WHERE g.answer_key = a.key) AS uses FROM answers a
      WHERE (? = '' OR a.norm LIKE ? OR a.name LIKE ?) ORDER BY a.updated_at DESC LIMIT 200`)
      .bind(needle, '%' + needle + '%', '%' + needle + '%').all()).results;
  }
  return { answers: rows };
}

export async function saveAnswer(env, body) {
  const db = env.DB;
  const a = await db.prepare(`SELECT * FROM answers WHERE key = ?`).bind(String(body.key || '')).first();
  if (!a) throw new HttpError(404, 'Answer not found.');
  const status = ['ok', 'vague', 'invalid'].includes(body.status) ? body.status : a.status;
  const value = body.value === undefined ? a.value : Number(body.value);
  if (status === 'ok' && !(value > 0)) throw new HttpError(400, 'Value must be a positive number.');
  await db.prepare(`UPDATE answers SET name = ?, value = ?, status = ?, approved = ?, flagged = ?, source = 'admin', updated_at = ? WHERE key = ?`)
    .bind(body.name === undefined ? a.name : clampStr(body.name, 120), value || 0, status,
      body.approved === undefined ? a.approved : (body.approved ? 1 : 0),
      body.flagged === undefined ? a.flagged : (body.flagged ? 1 : 0), nowISO(), a.key).run();
  const changed = value !== a.value || status !== a.status;
  const rescored = changed && body.rescore !== false ? await rescoreAnswer(env, a.key) : 0;
  return { ok: true, rescored };
}

export async function deleteAnswer(env, body) {
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM guesses WHERE answer_key = ?`).bind(String(body.key || '')).first();
  if (n.n > 0) throw new HttpError(409, 'Guesses use this answer. Edit it instead.');
  await env.DB.prepare(`DELETE FROM answers WHERE key = ?`).bind(String(body.key || '')).run();
  return { ok: true };
}
