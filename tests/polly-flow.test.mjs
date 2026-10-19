// Polly end to end against a real local D1 (wrangler's getPlatformProxy) with every migration applied:
// approve → auto-fill → today → lock-in (order, 409s, no real number before lock) → report → fix → rescore.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPlatformProxy } from 'wrangler';
import * as polly from '../functions/_lib/polly.js';
import * as admin from '../functions/_lib/polly-admin.js';
import { todayUTC, addDays } from '../functions/_lib/util.js';

let proxy, env, dir;
const who = id => ({ player: { id, polly: '{}' }, signedIn: false, isAdmin: false, email: '' });
const Q = (i, topic, extra = {}) => ({
  action: 'approve', topic, short: `Question ${i}?`, left_label: 'Yes', right_label: 'No', original_wording: `Do you agree with ${i}?`,
  left_raw: 40 + i, right_raw: 50 - i, unsure_raw: 10, source_id: 1, url: `https://www.pewresearch.org/q${i}`,
  poll_end_date: '2026-09-01', sample_size: 1000 + i, time_sensitive: false, ...extra
});

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wk-polly-'));
  proxy = await getPlatformProxy({ persist: { path: dir } });
  env = { ...proxy.env, POLLY_LAUNCH_DATE: addDays(todayUTC(), -3) };
  for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', f), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const s of sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await env.DB.prepare(s).run();
  }
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) await env.DB.prepare(`INSERT INTO players (id, created_at, last_seen) VALUES (?, '2026-01-01', '2026-01-01')`).bind(id).run();
}, { timeout: 60000 });

after(async () => { if (proxy) await proxy.dispose(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* still locked on Windows */ } });

test('an empty bank means no poll today', async () => {
  const t = await polly.today(env, who('a'));
  assert.equal(t.noPoll, true);
  assert.equal(t.questions.length, 0);
});

test('approving fills the next days: 1 politics max, three topics where possible', async () => {
  const topics = ['politics', 'politics', 'life', 'money', 'beliefs', 'life'];
  for (let i = 1; i <= 6; i++) {
    const r = await admin.saveQuestion(env, Q(i, topics[i - 1]));
    assert.equal(r.question.status, 'approved');
  }
  const today = todayUTC();
  const day1 = (await polly.dayRows(env, today)).map(r => r.topic);
  assert.equal(day1.length, 3);
  assert.equal(day1.filter(t => t === 'politics').length, 1);
  assert.equal(new Set(day1).size, 3);
  const day2 = (await polly.dayRows(env, addDays(today, 1))).map(r => r.topic);
  assert.equal(day2.length, 3);
  assert.ok(day2.filter(t => t === 'politics').length <= 1);
});

test('approval needs an exact poll date, and refuses polls over 10 years old', async () => {
  await assert.rejects(() => admin.saveQuestion(env, Q(20, 'life', { poll_end_date: null })), /poll end date/);
  await assert.rejects(() => admin.saveQuestion(env, Q(21, 'life', { poll_end_date: '2001-01-01' })), /over 10 years old/);
});

test('today hides the real numbers until lock-in; locks go in order, once', async () => {
  const t = await polly.today(env, who('a'));
  assert.equal(t.noPoll, false);
  assert.equal(t.questions.length, 3);
  const raw = JSON.stringify(t.questions);
  assert.ok(!/real|original|evidence|url|left_raw|topic/.test(raw), raw);
  await assert.rejects(() => polly.lock(env, who('a'), { slot: 2, guess: 50, own: 'left' }), /in order/);
  await assert.rejects(() => polly.lock(env, who('a'), { slot: 1, guess: 101 }), /0 to 100/);
  const r = await polly.lock(env, who('a'), { slot: 1, guess: 50, own: 'left' });
  assert.equal(typeof r.reveal.real, 'number');
  assert.ok(r.reveal.sample > 0 && r.reveal.url && r.reveal.original);
  assert.equal(r.reveal.crowd.few, true);
  assert.equal(r.reveal.wk.few, true);
  await assert.rejects(() => polly.lock(env, who('a'), { slot: 1, guess: 50 }), e => /already locked/.test(e.message) && e.status === 409);
});

test('five players unlock the crowd and the WK players\' split; the summary counts agreement', async () => {
  for (const p of ['b', 'c', 'd', 'e']) await polly.lock(env, who(p), { slot: 1, guess: 40, own: 'right' });
  const r = await polly.lock(env, who('f'), { slot: 1, guess: 60, own: null });
  assert.equal(r.reveal.crowd.total, 6);
  assert.equal(r.reveal.wk.n, 5);                 // the skip doesn't count
  assert.equal(r.reveal.wk.left, 20);
  await polly.lock(env, who('a'), { slot: 2, guess: 50, own: 'left' });
  const last = await polly.lock(env, who('a'), { slot: 3, guess: 50, own: 'right' });
  assert.ok(last.summary);
  assert.equal(last.day.done, 3);
  assert.equal(last.summary.crowd.few, true);      // only 1 player has finished the day
  assert.ok(last.summary.agree.of >= 2);
});

test('a fix that changes the split rescores every play; the reporter gets a note', async () => {
  const t = await polly.today(env, who('b'));
  const rev = t.questions[0].reveal;
  await polly.report(env, who('b'), { guessId: rev.guessId, reason: 'wrong' });
  assert.deepEqual(await polly.report(env, who('b'), { guessId: rev.guessId, reason: 'wrong' }), { ok: true, already: true });
  await assert.rejects(() => polly.report(env, who('c'), { guessId: rev.guessId, reason: 'wrong' }), /not found/);
  const list = await admin.reports(env, new URLSearchParams());
  assert.equal(list.reports.length, 1);
  const qid = list.reports[0].question_id;
  // b guessed 40; make the real split 40 → b scores 100.
  const r = await admin.resolveReport(env, { id: list.reports[0].id, action: 'fix', fields: { left_raw: 40, right_raw: 60, unsure_raw: 0 } });
  assert.ok(r.rescored >= 6);
  const after = await polly.today(env, who('b'));
  assert.equal(after.questions[0].reveal.real, 40);
  assert.equal(after.questions[0].reveal.score, 100);
  assert.deepEqual(after.notifications, [{ status: 'fixed', short: after.questions[0].short }]);
  assert.equal((await polly.today(env, who('b'))).notifications.length, 0);
  const q = await env.DB.prepare(`SELECT real FROM polly_questions WHERE id = ?`).bind(qid).first();
  assert.equal(q.real, 40);
});

test('stats: average miss, lean and agreement', async () => {
  const s = await polly.stats(env, who('a'));
  assert.equal(s.played, 1);
  assert.equal(s.streak, 1);
  assert.equal(s.questions, 3);
  assert.equal(typeof s.avgMiss, 'number');
  assert.equal(typeof s.lean, 'number');
});

test('calendar swap, pin and unschedule; past days and answered slots are locked', async () => {
  const tomorrow = addDays(todayUTC(), 1), next = addDays(todayUTC(), 2);
  const before = await polly.dayRows(env, tomorrow);
  await admin.schedule(env, { action: 'swap', a: { date: tomorrow, slot: 1 }, b: { date: tomorrow, slot: 2 } });
  const after = await polly.dayRows(env, tomorrow);
  assert.equal(after[0].id, before[1].id);
  await admin.schedule(env, { action: 'pin', a: { date: tomorrow, slot: 1 } });
  assert.equal((await polly.dayRows(env, tomorrow))[0].pinned, 1);
  await admin.schedule(env, { action: 'move', a: { date: tomorrow, slot: 3 }, b: { date: next, slot: 1 } });
  assert.equal((await polly.dayRows(env, tomorrow)).length, 2);
  await assert.rejects(() => admin.schedule(env, { action: 'unschedule', a: { date: todayUTC(), slot: 1 } }), /already answered/);
  await assert.rejects(() => admin.schedule(env, { action: 'unschedule', a: { date: addDays(todayUTC(), -1), slot: 1 } }), /Past days/);
});

test('unschedule puts a different question in the slot; the old one waits at the back of the bank', async () => {
  for (let i = 30; i < 33; i++) await admin.saveQuestion(env, Q(i, ['life', 'money', 'beliefs'][i % 3]));
  await polly.autoFill(env);
  const day = (await env.DB.prepare(`SELECT date FROM polly_schedule WHERE date > ? AND pinned = 0 ORDER BY date LIMIT 1`).bind(todayUTC()).first()).date;
  const before = (await polly.dayRows(env, day))[0];
  assert.ok(before, 'the day has a question');
  const r = await admin.schedule(env, { action: 'unschedule', a: { date: day, slot: before.slot } });
  const after = (await polly.dayRows(env, day)).find(x => x.slot === before.slot);
  assert.ok(!after || after.id !== before.id, r.warning);
});

test('a time-sensitive question never lands on a day where it would be stale', async () => {
  const r = await admin.saveQuestion(env, Q(40, 'politics', { time_sensitive: true, poll_end_date: addDays(todayUTC(), -120) }));
  assert.equal(r.question.status, 'approved');
  await polly.autoFill(env);
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM polly_schedule WHERE question_id = ?`).bind(r.question.id).first();
  assert.equal(n.n, 0);
  const b = await admin.bankInfo(env);
  assert.ok(b.expired >= 1);
});
