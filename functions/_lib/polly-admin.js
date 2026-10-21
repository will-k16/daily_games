// Admin for Polly: the dashboard, adding questions (URL → AI → server check, pasted text, or by hand),
// the bank (edit / approve / reject / retire), the calendar (auto-fill, swap, move, pin, unschedule),
// reports (fix / dismiss / retire) and the source allowlist.
import { HttpError, nowISO, todayUTC, addDays, isDate, clampStr, safeJson } from './util.js';
import { activeSources, sourceForUrl, fetchPage, extractCandidates, checkCandidate, cleanCandidate, numbersIn, PAGE_CHARS, TOPICS } from './polly-ai.js';
import { autoFill, rescoreQuestion, fitsDay, pollyNumber, BANK_LOW_DAYS, HORIZON, REASONS } from './polly.js';
import { SLOTS, SHORT_MAX, LABEL_MAX, QUESTION_MAX, DAY_MAX, staleReason, tooOld } from '../../public/js/polly-score.js';
import { spread } from '../../public/js/charts.js';

const ENTRIES = ['auto-checked', 'admin-pasted', 'admin-entered'];
const STATUSES = ['draft', 'approved', 'rejected', 'retired'];

export async function allSources(env) {
  return (await env.DB.prepare(`SELECT * FROM polly_sources ORDER BY name`).all()).results.map(s => ({ ...s, domains: safeJson(s.domains, []) }));
}

function adminQ(q, sources = []) {
  const s = sources.find(x => x.id === q.source_id);
  return { ...q, time_sensitive: !!q.time_sensitive, source: s ? s.name : '' };
}

/* ───────────── Dashboard ───────────── */

/** Approved questions that have never run (scheduled or not), and how many days they cover. */
export async function bankInfo(env) {
  const today = todayUTC();
  const rows = (await env.DB.prepare(`SELECT q.time_sensitive, q.poll_end_date, NOT EXISTS (SELECT 1 FROM polly_schedule s WHERE s.question_id = q.id) AS unscheduled
      FROM polly_questions q WHERE q.status = 'approved' AND q.last_run_date IS NULL`).all()).results;
  // Questions already too old to run (time-sensitive past 3 months, or over 10 years) can't fill a day, so they don't count.
  const usable = rows.filter(r => !staleReason(r, today));
  const n = usable.length;
  return { fresh: n, unscheduled: usable.filter(r => r.unscheduled).length, expired: rows.length - n, days: Math.floor(n / SLOTS), low: n < BANK_LOW_DAYS * SLOTS };
}

async function staleList(env, from, to) {
  const rows = (await env.DB.prepare(`SELECT s.date, s.slot, q.id, q.short, q.time_sensitive, q.poll_end_date FROM polly_schedule s
      JOIN polly_questions q ON q.id = s.question_id WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.slot`).bind(from, to).all()).results;
  return rows.map(r => ({ ...r, why: staleReason(r, r.date) })).filter(r => r.why);
}

export async function dashboard(env) {
  const db = env.DB, date = todayUTC(), from = addDays(date, -13);
  const [players, finished, ever, slots, open, bank, stale, week, qScores, dayTotals, upcoming, auto] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM polly_plays WHERE date = ? AND mode = 'daily' AND done > 0`).bind(date).first(),
    db.prepare(`SELECT COUNT(*) AS n, AVG(total) AS avg FROM polly_plays WHERE date = ? AND mode = 'daily' AND done >= ?`).bind(date, SLOTS).first(),
    db.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM polly_plays WHERE mode IN ('daily','archive') AND done > 0`).first(),
    db.prepare(`SELECT s.slot, s.reused, q.id, q.short, q.left_label, q.right_label, q.real, q.topic, q.url, COUNT(g.id) AS plays, AVG(g.score) AS avg, AVG(ABS(g.guess - g.real)) AS miss,
          SUM(g.own = 'left') AS sideL, SUM(g.own = 'right') AS sideR, SUM(g.own IS NULL) AS skipped
        FROM polly_schedule s JOIN polly_questions q ON q.id = s.question_id
        LEFT JOIN polly_guesses g ON g.question_id = q.id AND g.slot = s.slot AND g.play_id IN (SELECT id FROM polly_plays WHERE date = ? AND mode = 'daily')
        WHERE s.date = ? GROUP BY s.slot ORDER BY s.slot`).bind(date, date).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM polly_reports WHERE status = 'open'`).first(),
    bankInfo(env),
    staleList(env, date, addDays(date, HORIZON - 1)),
    db.prepare(`SELECT date, COUNT(DISTINCT player_id) AS n FROM polly_plays WHERE mode = 'daily' AND done > 0 AND date >= ? GROUP BY date`).bind(from).all(),
    db.prepare(`SELECT g.score FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE pl.date = ? AND pl.mode = 'daily'`).bind(date).all(),
    db.prepare(`SELECT total FROM polly_plays WHERE date = ? AND mode = 'daily' AND done >= ?`).bind(date, SLOTS).all(),
    db.prepare(`SELECT s.date, COUNT(*) AS n FROM polly_schedule s WHERE s.date > ? AND s.date <= ? GROUP BY s.date`).bind(date, addDays(date, 7)).all(),
    db.prepare(`SELECT (SELECT COUNT(*) FROM polly_pages WHERE status = 'queued') AS queued,
          (SELECT value FROM polly_meta WHERE key = 'last_run') AS lastRun,
          (SELECT COUNT(*) FROM polly_questions WHERE status = 'draft') AS drafts,
          (SELECT COUNT(*) FROM polly_questions WHERE status = 'approved' AND entry = 'auto-checked' AND approved_at >= ?) AS autoWeek`).bind(addDays(date, -7)).first()
  ]);
  const byDate = Object.fromEntries(week.results.map(w => [w.date, w.n]));
  const rHist = spread(qScores.results.map(r => r.score), QUESTION_MAX), dHist = spread(dayTotals.results.map(r => r.total), DAY_MAX);
  const full = Object.fromEntries(upcoming.results.map(u => [u.date, u.n]));
  const gaps = Array.from({ length: 7 }, (_, i) => addDays(date, i + 1)).filter(d => (full[d] || 0) < SLOTS);
  return {
    date, number: pollyNumber(env, date), players: players.n, finished: finished.n, avgDay: finished.avg == null ? null : Math.round(finished.avg),
    ever: ever.n, slots: slots.results, openReports: open.n, bank, stale,
    week: Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)).map(d => ({ date: d, n: byDate[d] || 0 })),
    rHist, dHist, gaps, auto
  };
}

/* ───────────── Adding questions ───────────── */

/** URL (fetched by the server) or pasted text → AI candidates → server check. Nothing is saved yet. */
export async function extract(env, body) {
  const sources = await activeSources(env);
  const url = String(body.url || '').trim();
  const pasted = typeof body.text === 'string' && body.text.trim().length > 0;
  let src = sourceForUrl(sources, url);
  if (!url) throw new HttpError(400, 'Paste the poll page\'s URL.');
  if (!src) throw new HttpError(400, 'That site isn\'t on the allowlist. Add it under Sources first.');
  if (pasted) {
    const picked = sources.find(s => s.id === Number(body.sourceId));
    if (!picked) throw new HttpError(400, 'Pick the source from the list.');
    if (!sourceForUrl([picked], url)) throw new HttpError(400, `That URL isn't on ${picked.name}'s site.`);
    src = picked;
  }
  const text = pasted ? String(body.text).replace(/\r/g, '').slice(0, PAGE_CHARS) : await fetchPage(env, url, sources);
  if (text.length < 120) throw new HttpError(422, 'The page has almost no text. If the numbers are in a chart or PDF, paste the text or enter it by hand.');
  const raw = await extractCandidates(env, { source: src.name, url, text });
  const known = (await env.DB.prepare(`SELECT original_wording FROM polly_questions WHERE url = ?`).bind(url).all()).results.map(r => r.original_wording.toLowerCase());
  const candidates = [], failed = [];
  raw.forEach(c => {
    const chk = checkCandidate(c, text);
    const base = { ...chk.q, source_id: src.id, url, dateChecked: chk.dateChecked, sampleChecked: chk.sampleChecked, tooLong: chk.tooLong, already: known.includes(chk.q.original_wording.toLowerCase()) };
    if (chk.ok) candidates.push({ ...base, entry: pasted ? 'admin-pasted' : 'auto-checked' });
    else failed.push({ ...base, reasons: chk.reasons });
  });
  return { source: { id: src.id, name: src.name }, url, chars: text.length, candidates, failed };
}

/**
 * Turns admin input into stored fields. `entry` keeps its auto-checked / admin-pasted mark only while both sides'
 * numbers are still written in the evidence; an edit that breaks that makes it admin-entered.
 */
export function fieldsFrom(body, sources, fallbackEntry = 'admin-entered') {
  const c = cleanCandidate(body);
  const src = sources.find(s => s.id === Number(body.source_id));
  let entry = ENTRIES.includes(body.entry) ? body.entry : fallbackEntry;
  if (entry !== 'admin-entered') {
    const ev = numbersIn(c.evidence);
    // The right side may be "everyone else" (100 minus a one-share result), so only it can be off the page.
    const rightOk = c.right_raw != null && (ev.includes(c.right_raw) || Math.abs(c.left_raw + c.right_raw - 100) < 0.05);
    if (c.left_raw == null || !ev.includes(c.left_raw) || !rightOk) entry = 'admin-entered';
  }
  return {
    topic: TOPICS.includes(c.topic) ? c.topic : 'life', short: c.short, left_label: c.left_label, right_label: c.right_label,
    original_wording: c.original_wording, left_raw: c.left_raw, right_raw: c.right_raw, unsure_raw: c.unsure_raw, real: c.real,
    source_id: src ? src.id : null, url: clampStr(body.url, 500), poll_end_date: c.poll_end_date, sample_size: c.sample_size,
    time_sensitive: c.time_sensitive ? 1 : 0, ts_reason: c.ts_reason, entry, evidence: c.evidence
  };
}

/** What's still missing before a question can be approved ([] = ready). */
export function approvalProblems(f, sources, date = todayUTC()) {
  const out = [];
  if (!f.short) out.push('short wording'); else if (f.short.length > SHORT_MAX) out.push(`short wording over ${SHORT_MAX} characters`);
  if (!f.left_label || f.left_label.length > LABEL_MAX) out.push(`left label (1–${LABEL_MAX} characters)`);
  if (!f.right_label || f.right_label.length > LABEL_MAX) out.push(`right label (1–${LABEL_MAX} characters)`);
  if (f.left_raw == null || f.right_raw == null || f.real == null) out.push('both raw numbers');
  if (!f.original_wording) out.push('original wording');
  const src = sources.find(s => s.id === f.source_id);
  if (!src) out.push('source');
  if (!f.url) out.push('URL'); else if (src && !sourceForUrl([src], f.url)) out.push('a URL on the source\'s site');
  if (!f.poll_end_date) out.push('poll end date (exact day)');
  if (!f.sample_size) out.push('sample size');
  if (!TOPICS.includes(f.topic)) out.push('topic');
  if (f.poll_end_date && tooOld(f.poll_end_date, date)) out.push('Poll is over 10 years old.');
  return out;
}

export async function saveDrafts(env, body) {
  const sources = await allSources(env);
  const list = Array.isArray(body.candidates) ? body.candidates.slice(0, 20) : [];
  if (!list.length) throw new HttpError(400, 'Tick at least one.');
  const stmts = [];
  for (const c of list) {
    const f = fieldsFrom(c, sources, 'admin-entered');
    const src = sources.find(s => s.id === f.source_id);
    if (!src || !sourceForUrl([src], f.url)) throw new HttpError(400, 'Every draft needs an allowlisted source and URL.');
    stmts.push(insertQ(env, f, 'draft'));
  }
  await env.DB.batch(stmts);
  return { saved: stmts.length };
}

export function insertQ(env, f, status) {
  return env.DB.prepare(`INSERT INTO polly_questions (status, topic, short, left_label, right_label, original_wording, left_raw, right_raw, unsure_raw, real,
      source_id, url, poll_end_date, sample_size, time_sensitive, ts_reason, entry, evidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(status, f.topic, f.short, f.left_label, f.right_label, f.original_wording, f.left_raw, f.right_raw, f.unsure_raw, f.real,
      f.source_id, f.url, f.poll_end_date, f.sample_size, f.time_sensitive, f.ts_reason, f.entry, f.evidence, nowISO());
}

/* ───────────── One question: save / approve / reject / retire ───────────── */

/** Pulls a question from today (if nobody has answered it yet) and every later day. */
async function unscheduleAhead(env, id) {
  const today = todayUTC();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM polly_schedule WHERE question_id = ? AND date > ?`).bind(id, today),
    env.DB.prepare(`DELETE FROM polly_schedule WHERE question_id = ? AND date = ? AND NOT EXISTS
        (SELECT 1 FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE g.question_id = ? AND pl.date = ?)`).bind(id, today, id, today)
  ]);
}

/**
 * body: { id?, action: save | approve | reject | retire | draft, ...fields }. A new question (no id) is entered
 * by hand. Changing the split of a question people already answered rescores every play of it.
 */
export async function saveQuestion(env, body) {
  const db = env.DB, sources = await allSources(env);
  const id = Number(body.id) || null;
  const old = id ? await db.prepare(`SELECT * FROM polly_questions WHERE id = ?`).bind(id).first() : null;
  if (id && !old) throw new HttpError(404, 'Question not found.');
  const action = ['save', 'approve', 'reject', 'retire', 'draft'].includes(body.action) ? body.action : 'save';
  const used = old ? (await db.prepare(`SELECT COUNT(*) AS n FROM polly_guesses WHERE question_id = ?`).bind(id).first()).n : 0;

  let f;
  if (body.fields === false && old) f = { ...old };   // status change only
  else {
    f = fieldsFrom({ ...(old || {}), ...body, entry: old ? old.entry : 'admin-entered' }, sources, 'admin-entered');
    if (f.short.length > SHORT_MAX) throw new HttpError(400, `Keep the short wording to ${SHORT_MAX} characters.`);
    if (f.left_label.length > LABEL_MAX || f.right_label.length > LABEL_MAX) throw new HttpError(400, `Keep each label to ${LABEL_MAX} characters.`);
    if ([f.left_raw, f.right_raw, f.unsure_raw].some(v => v != null && (v < 0 || v > 100))) throw new HttpError(400, 'Raw numbers are percentages (0–100).');
  }
  let status = old ? old.status : 'draft';
  const warnings = [];
  if (action === 'approve') {
    const problems = approvalProblems(f, sources);
    if (problems.length) throw new HttpError(400, problems.includes('Poll is over 10 years old.') ? 'Poll is over 10 years old.' : 'Still needed to approve: ' + problems.join(', ') + '.');
    status = 'approved';
  } else if (action === 'reject') {
    if (used) throw new HttpError(409, 'People already answered this one. Retire it instead.');
    status = 'rejected';
  } else if (action === 'retire') status = 'retired';
  else if (action === 'draft') {
    if (used) throw new HttpError(409, 'People already answered this one, so it stays approved. Retire it instead.');
    status = 'draft';
  }
  if (status === 'approved' && f.poll_end_date && tooOld(f.poll_end_date, todayUTC())) warnings.push('Poll is over 10 years old.');

  let qid = id, rescored = 0;
  if (old) {
    await db.prepare(`UPDATE polly_questions SET status = ?, topic = ?, short = ?, left_label = ?, right_label = ?, original_wording = ?, left_raw = ?, right_raw = ?,
        unsure_raw = ?, real = ?, source_id = ?, url = ?, poll_end_date = ?, sample_size = ?, time_sensitive = ?, ts_reason = ?, entry = ?, evidence = ?,
        approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END WHERE id = ?`)
      .bind(status, f.topic, f.short, f.left_label, f.right_label, f.original_wording, f.left_raw, f.right_raw, f.unsure_raw, f.real,
        f.source_id, f.url, f.poll_end_date, f.sample_size, f.time_sensitive ? 1 : 0, f.ts_reason, f.entry, f.evidence, status, nowISO(), id).run();
    if (used && f.real != null && f.real !== old.real) rescored = await rescoreQuestion(env, id, f.real);
  } else {
    const row = await insertQ(env, f, status).run();
    qid = row.meta.last_row_id;
    if (status === 'approved') await db.prepare(`UPDATE polly_questions SET approved_at = ? WHERE id = ?`).bind(nowISO(), qid).run();
  }
  if (status !== 'approved') await unscheduleAhead(env, qid);
  if (status === 'approved' || action === 'retire' || action === 'reject') await autoFill(env);
  const q = await db.prepare(`SELECT * FROM polly_questions WHERE id = ?`).bind(qid).first();
  return { ok: true, question: adminQ(q, sources), rescored, warnings };
}

/* ───────────── Bank ───────────── */

export async function bank(env, q) {
  const sources = await allSources(env), today = todayUTC();
  const status = STATUSES.includes(q.get('status')) ? q.get('status') : null;
  const topic = TOPICS.includes(q.get('topic')) ? q.get('topic') : null;
  const entry = ENTRIES.includes(q.get('entry')) ? q.get('entry') : null;
  const ts = q.get('ts') === '1' ? 1 : q.get('ts') === '0' ? 0 : null;
  const needle = clampStr(q.get('q'), 80).toLowerCase();
  const rows = (await env.DB.prepare(`SELECT q.*,
        (SELECT MIN(s.date) FROM polly_schedule s WHERE s.question_id = q.id AND s.date >= ?) AS next_date,
        (SELECT COUNT(*) FROM polly_schedule s WHERE s.question_id = q.id AND s.date <= ?) AS runs,
        (SELECT COUNT(*) FROM polly_guesses g WHERE g.question_id = q.id) AS answers
      FROM polly_questions q
      WHERE (? IS NULL OR q.status = ?) AND (? IS NULL OR q.topic = ?) AND (? IS NULL OR q.entry = ?) AND (? IS NULL OR q.time_sensitive = ?)
        AND (? = '' OR lower(q.short) LIKE ? OR lower(q.original_wording) LIKE ? OR lower(q.url) LIKE ?)
      ORDER BY CASE q.status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, q.id DESC LIMIT 400`)
    .bind(today, today, status, status, topic, topic, entry, entry, ts, ts, needle, `%${needle}%`, `%${needle}%`, `%${needle}%`).all()).results;
  return {
    today, questions: rows.map(r => ({ ...adminQ(r, sources), problems: approvalProblems({ ...r }, sources, today), stale: r.next_date ? staleReason(r, r.next_date) : '' })),
    sources: sources.map(s => ({ id: s.id, name: s.name, domains: s.domains, active: !!s.active })), bank: await bankInfo(env)
  };
}

/* ───────────── Calendar ───────────── */

export async function calendar(env) {
  const today = todayUTC();
  await autoFill(env, today);
  const from = addDays(today, -14), to = addDays(today, HORIZON - 1);
  const rows = (await env.DB.prepare(`SELECT s.date, s.slot, s.pinned, s.reused, q.id, q.short, q.topic, q.url, q.time_sensitive, q.poll_end_date, q.status,
        (SELECT COUNT(*) FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE pl.date = s.date AND g.slot = s.slot) AS answers
      FROM polly_schedule s JOIN polly_questions q ON q.id = s.question_id WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.slot`).bind(from, to).all()).results;
  const unscheduled = (await env.DB.prepare(`SELECT q.id, q.short, q.topic, q.url, q.time_sensitive, q.poll_end_date FROM polly_questions q WHERE q.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM polly_schedule s WHERE s.question_id = q.id) ORDER BY q.approved_at, q.id`).all()).results;
  return {
    today, from, to, number: pollyNumber(env, today),
    slots: rows.map(r => ({ ...r, time_sensitive: !!r.time_sensitive, stale: staleReason(r, r.date) })),
    unscheduled, bank: await bankInfo(env)
  };
}

/** Today's slot is locked once anyone has answered it; past days never change. */
async function checkEditable(env, date, slot) {
  const today = todayUTC();
  if (!isDate(date) || ![1, 2, 3].includes(slot)) throw new HttpError(400, 'Pick a day and a slot.');
  if (date < today) throw new HttpError(409, 'Past days can\'t change.');
  if (date === today) {
    const n = await env.DB.prepare(`SELECT 1 FROM polly_guesses g JOIN polly_plays pl ON pl.id = g.play_id WHERE pl.date = ? AND g.slot = ? LIMIT 1`).bind(date, slot).first();
    if (n) throw new HttpError(409, 'People already answered that slot today.');
  }
}

async function dayRules(env, date) {
  const day = (await env.DB.prepare(`SELECT q.id, q.topic, q.url FROM polly_schedule s JOIN polly_questions q ON q.id = s.question_id WHERE s.date = ?`).bind(date).all()).results;
  const bad = day.some((q, i) => !fitsDay(q, day.slice(0, i)));
  return bad ? `${date} now breaks a day rule (two politics questions or two from the same URL).` : '';
}

/** body: { action: swap | move | pin | unpin | unschedule | assign, a: { date, slot }, b: { date, slot }, questionId } */
export async function schedule(env, body) {
  const db = env.DB;
  const a = body.a || {}, b = body.b || {};
  const A = { date: String(a.date || ''), slot: Number(a.slot) }, B = { date: String(b.date || ''), slot: Number(b.slot) };
  const get = p => db.prepare(`SELECT * FROM polly_schedule WHERE date = ? AND slot = ?`).bind(p.date, p.slot).first();
  const action = String(body.action || '');
  await checkEditable(env, A.date, A.slot);
  const ra = await get(A);
  if (action === 'pin' || action === 'unpin') {
    if (!ra) throw new HttpError(404, 'That slot is empty.');
    await db.prepare(`UPDATE polly_schedule SET pinned = ? WHERE date = ? AND slot = ?`).bind(action === 'pin' ? 1 : 0, A.date, A.slot).run();
    return { ok: true };
  }
  if (action === 'unschedule') {
    if (!ra) throw new HttpError(404, 'That slot is empty.');
    // It goes to the back of the line: the slot takes the question from the furthest-out scheduled day (one that
    // fits this day's rules), and auto-fill then puts the unscheduled question at the end of the schedule.
    await db.batch([
      db.prepare(`DELETE FROM polly_schedule WHERE date = ? AND slot = ?`).bind(A.date, A.slot),
      db.prepare(`UPDATE polly_questions SET approved_at = ? WHERE id = ?`).bind(nowISO(), ra.question_id)
    ]);
    const day = (await db.prepare(`SELECT q.id, q.topic, q.url FROM polly_schedule s JOIN polly_questions q ON q.id = s.question_id WHERE s.date = ?`).bind(A.date).all()).results;
    const later = (await db.prepare(`SELECT s.date, s.slot, q.id, q.topic, q.url, q.time_sensitive, q.poll_end_date FROM polly_schedule s JOIN polly_questions q ON q.id = s.question_id
        WHERE s.date > ? AND s.date != ? AND s.pinned = 0 AND s.reused = 0 AND q.id != ? ORDER BY s.date DESC, s.slot DESC LIMIT 200`).bind(todayUTC(), A.date, ra.question_id).all()).results;
    const pull = later.find(c => fitsDay(c, day) && !staleReason(c, A.date));
    if (pull) {
      await db.batch([
        db.prepare(`DELETE FROM polly_schedule WHERE date = ? AND slot = ?`).bind(pull.date, pull.slot),
        db.prepare(`INSERT INTO polly_schedule (date, slot, question_id, pinned, reused) VALUES (?, ?, ?, 0, 0)`).bind(A.date, A.slot, pull.id)
      ]);
    }
    await autoFill(env);
    const now = await get(A);
    return { ok: true, warning: !now ? 'Back in the bank. Nothing else in the bank fits that slot, so it stays empty for now.'
      : now.question_id === ra.question_id ? 'Back in the bank, but it was the only question that fits, so it went straight back in. Retire it to remove it for good.' : '' };
  }
  if (action === 'assign') {
    if (ra) throw new HttpError(409, 'That slot is taken. Unschedule it first.');
    const q = await db.prepare(`SELECT id FROM polly_questions WHERE id = ? AND status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM polly_schedule s WHERE s.question_id = polly_questions.id)`).bind(Number(body.questionId)).first();
    if (!q) throw new HttpError(404, 'That question isn\'t in the bank.');
    await db.prepare(`INSERT INTO polly_schedule (date, slot, question_id, pinned, reused) VALUES (?, ?, ?, 1, 0)`).bind(A.date, A.slot, q.id).run();
    return { ok: true, warning: await dayRules(env, A.date) };
  }
  if (action === 'swap' || action === 'move') {
    await checkEditable(env, B.date, B.slot);
    if (A.date === B.date && A.slot === B.slot) return { ok: true };
    const rb = await get(B);
    if (!ra && !rb) throw new HttpError(404, 'Both slots are empty.');
    const put = (p, r) => db.prepare(`INSERT INTO polly_schedule (date, slot, question_id, pinned, reused) VALUES (?, ?, ?, ?, ?)`).bind(p.date, p.slot, r.question_id, r.pinned, r.reused);
    const stmts = [db.prepare(`DELETE FROM polly_schedule WHERE (date = ? AND slot = ?) OR (date = ? AND slot = ?)`).bind(A.date, A.slot, B.date, B.slot)];
    if (ra) stmts.push(put(B, ra));
    if (rb) stmts.push(put(A, rb));
    await db.batch(stmts);
    const warn = [await dayRules(env, A.date), A.date !== B.date ? await dayRules(env, B.date) : ''].filter(Boolean).join(' ');
    return { ok: true, warning: warn };
  }
  throw new HttpError(400, 'Unknown action.');
}

/* ───────────── Reports ───────────── */

export async function reports(env, q) {
  const status = ['open', 'fixed', 'dismissed', 'retired'].includes(q.get('status')) ? q.get('status') : 'open';
  const sources = await allSources(env);
  const rows = (await env.DB.prepare(`SELECT rp.*, g.guess, g.own, g.real AS guess_real, g.score, pl.date AS play_date, pl.mode, q.id AS question_id,
        (SELECT COUNT(*) FROM polly_reports r2 JOIN polly_guesses g2 ON g2.id = r2.guess_id WHERE g2.question_id = q.id AND r2.status = 'open') AS open_on_question
      FROM polly_reports rp JOIN polly_guesses g ON g.id = rp.guess_id JOIN polly_plays pl ON pl.id = g.play_id JOIN polly_questions q ON q.id = g.question_id
      WHERE rp.status = ? ORDER BY rp.id DESC LIMIT 200`).bind(status).all()).results;
  const qs = {};
  for (const r of rows) {
    if (!qs[r.question_id]) qs[r.question_id] = adminQ(await env.DB.prepare(`SELECT * FROM polly_questions WHERE id = ?`).bind(r.question_id).first(), sources);
  }
  return { reports: rows.map(r => ({ ...r, reasonText: REASONS[r.reason] || r.reason, question: qs[r.question_id] })), sources: sources.map(s => ({ id: s.id, name: s.name })) };
}

/** Fix (edit any field; a changed split rescores every play), dismiss, or retire. Every open report on the question is resolved the same way. */
export async function resolveReport(env, body) {
  const db = env.DB;
  const rp = await db.prepare(`SELECT rp.*, g.question_id FROM polly_reports rp JOIN polly_guesses g ON g.id = rp.guess_id WHERE rp.id = ?`).bind(Number(body.id)).first();
  if (!rp) throw new HttpError(404, 'Report not found.');
  const action = ['fix', 'dismiss', 'retire'].includes(body.action) ? body.action : null;
  if (!action) throw new HttpError(400, 'Fix, dismiss or retire?');
  let out = { ok: true, rescored: 0 };
  if (action === 'fix') out = await saveQuestion(env, { ...(body.fields || {}), id: rp.question_id, action: 'save' });
  if (action === 'retire') out = await saveQuestion(env, { id: rp.question_id, action: 'retire', fields: false });
  const status = { fix: 'fixed', dismiss: 'dismissed', retire: 'retired' }[action];
  await db.prepare(`UPDATE polly_reports SET status = ?, admin_note = ?, resolved_at = ?, seen = 0
      WHERE (id = ? OR status = 'open') AND guess_id IN (SELECT id FROM polly_guesses WHERE question_id = ?)`)
    .bind(status, clampStr(body.adminNote, 300), nowISO(), rp.id, rp.question_id).run();
  return { ok: true, rescored: out.rescored || 0 };
}

/* ───────────── Sources (the allowlist) ───────────── */

export async function sources(env) {
  const rows = (await env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM polly_questions q WHERE q.source_id = s.id) AS questions FROM polly_sources s ORDER BY s.name`).all()).results;
  return { sources: rows.map(s => ({ ...s, domains: safeJson(s.domains, []), active: !!s.active })) };
}

const cleanDomain = d => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').replace(/\.$/, '');

/** body: { id?, name, domains (list or comma-separated), active, remove } */
export async function saveSource(env, body) {
  const db = env.DB, id = Number(body.id) || null;
  if (body.remove && id) {
    const used = await db.prepare(`SELECT COUNT(*) AS n FROM polly_questions WHERE source_id = ?`).bind(id).first();
    if (used.n) throw new HttpError(409, 'Questions use this source. Turn it off instead.');
    await db.prepare(`DELETE FROM polly_sources WHERE id = ?`).bind(id).run();
    return sources(env);
  }
  const name = clampStr(body.name, 80);
  const list = (Array.isArray(body.domains) ? body.domains : String(body.domains || '').split(/[\s,]+/)).map(cleanDomain)
    .filter(d => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
  if (!name) throw new HttpError(400, 'Give the source a name.');
  if (!list.length) throw new HttpError(400, 'Add at least one domain, like pewresearch.org.');
  const domains = JSON.stringify([...new Set(list)]), active = body.active === false ? 0 : 1;
  if (id) await db.prepare(`UPDATE polly_sources SET name = ?, domains = ?, active = ? WHERE id = ?`).bind(name, domains, active, id).run();
  else await db.prepare(`INSERT INTO polly_sources (name, domains, active, created_at) VALUES (?, ?, ?, ?)`).bind(name, domains, active, nowISO()).run();
  return sources(env);
}


