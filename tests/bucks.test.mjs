// The WK Bucks ledger, run against a real local D1 database (wrangler's getPlatformProxy) with every migration applied.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPlatformProxy } from 'wrangler';
import { bucksBalance, buy } from '../functions/_lib/bucks.js';

let proxy, env, dir;
const now = '2026-10-18T12:00:00.000Z';

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wk-bucks-'));
  proxy = await getPlatformProxy({ persist: { path: dir } });
  env = proxy.env;
  for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', f), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const s of stmts) await env.DB.prepare(s).run();
  }
  const db = env.DB;
  await db.prepare(`INSERT INTO players (id, created_at, last_seen) VALUES ('p1', ?, ?)`).bind(now, now).run();
  // Summit: a full daily day (3 stages) with one perfect stage, plus an archive stage.
  for (let s = 1; s <= 3; s++) {
    await db.prepare(`INSERT INTO puzzles (id, date, slot, status, property, small_item, small_value, big_item, big_value, created_at) VALUES (?, '2026-10-18', ?, 'auto', 'weight', 'a', 1, 'b', 100, ?)`).bind(s, s, now).run();
  }
  await db.prepare(`INSERT INTO puzzles (id, date, slot, status, property, small_item, small_value, big_item, big_value, created_at) VALUES (4, '2026-10-17', 1, 'auto', 'weight', 'a', 1, 'b', 100, ?)`).bind(now).run();
  const play = (id, pz, mode, score) => db.prepare(`INSERT INTO plays (id, player_id, puzzle_id, mode, state, score, created_at) VALUES (?, 'p1', ?, ?, 'done', ?, ?)`).bind(id, pz, mode, score, now).run();
  await play(1, 1, 'daily', 1000);   // 10 + 5 perfect
  await play(2, 2, 'daily', 750);    // 7
  await play(3, 3, 'daily', 420);    // 4   (+5 for finishing all three)
  await play(4, 4, 'archive', 900);  // 4
  // Venn: a perfect daily day (100 + 100) and one archive round.
  for (const [id, round, date] of [[1, 1, '2026-10-18'], [2, 2, '2026-10-18'], [3, 1, '2026-10-17']]) {
    await db.prepare(`INSERT INTO venn_puzzles (id, date, round, status, circles, par, typical, created_at) VALUES (?, ?, ?, 'auto', '[]', 5, 9, ?)`).bind(id, date, round, now).run();
  }
  const vplay = (id, pz, mode, state, score) => db.prepare(`INSERT INTO venn_plays (id, player_id, puzzle_id, mode, state, score, created_at) VALUES (?, 'p1', ?, ?, ?, ?, ?)`).bind(id, pz, mode, state, score, now).run();
  await vplay(1, 1, 'daily', 'done', 100);
  await vplay(2, 2, 'daily', 'done', 100);
  await vplay(3, 3, 'archive', 'done', 70);   // floor(70 / 8) = 8
  // Polly: a perfect daily day (14 × 3 + 8 = 50), and one archive question with no finished day (floor(70 / 14) = 5).
  await db.prepare(`INSERT INTO polly_plays (id, player_id, date, mode, total, done, created_at) VALUES (1, 'p1', '2026-10-18', 'daily', 300, 3, ?), (2, 'p1', '2026-10-17', 'archive', 70, 1, ?)`).bind(now, now).run();
  for (const [id, play, slot, score] of [[1, 1, 1, 100], [2, 1, 2, 100], [3, 1, 3, 100], [4, 2, 1, 70]]) {
    await db.prepare(`INSERT INTO polly_guesses (id, play_id, slot, question_id, guess, real, score, created_at) VALUES (?, ?, ?, 1, 50, 50, ?, ?)`).bind(id, play, slot, score, now).run();
  }
}, { timeout: 60000 });

after(async () => { if (proxy) await proxy.dispose(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* still locked on Windows */ } });

test('earned = Summit + Venn + Polly; a perfect Venn day and a perfect Polly day are 50 each', async () => {
  const b = await bucksBalance(env, 'p1');
  assert.equal(b.earned, 15 + 7 + 4 + 5 + 4 + 50 + 8 + 50 + 5);
  assert.equal(b.spent, 0);
});

test('admin grants are negative-price purchases; buying spends from the same balance', async () => {
  await env.DB.prepare(`INSERT INTO purchases (player_id, item, price, created_at) VALUES ('p1', 'grant:1', -100, ?)`).bind(now).run();
  let b = await bucksBalance(env, 'p1');
  assert.equal(b.balance, b.earned + 100);
  const who = { player: { id: 'p1', skipper: '{}', mel: '{}', polly: '{}' } };
  const p = await buy(env, who, { slot: 'visitors', id: 'ducks' }, 'polly');
  assert.ok(p.owned.includes('polly:visitors:ducks'));
  assert.equal(p.look.visitors, 'ducks');
  await env.DB.prepare(`DELETE FROM purchases WHERE item = 'polly:visitors:ducks'`).run();
  const r = await buy(env, who, { slot: 'hat', id: 'crown' }, 'mel');
  assert.ok(r.owned.includes('mel:hat:crown'));
  assert.equal(r.look.hat, 'crown');
  b = await bucksBalance(env, 'p1');
  assert.equal(b.balance, b.earned + 100 - 120);
  await assert.rejects(() => buy(env, who, { slot: 'pattern', id: 'galaxy' }, 'mel').then(() => buy(env, who, { slot: 'hat', id: 'tophat' }, 'skipper'))
    .then(() => buy(env, who, { slot: 'cabin', id: 'gold' }, 'skipper')), /Not enough WK Bucks/);
});
