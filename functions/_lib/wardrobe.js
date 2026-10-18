// Skipper's wardrobe: clover balance, buying, and wearing. The catalog lives in public/js/wardrobe.js.
import { HttpError, nowISO, safeJson } from './util.js';
import { WARDROBE, DAY_BONUS, itemFor, itemKey, resolveLook, cleanName } from '../../public/js/wardrobe.js';

export const lookOf = player => resolveLook(safeJson((player && player.skipper) || '{}', {}));

/** Clovers earned from finished stages (same rules as cloversFor), minus what's been spent. */
export async function cloverBalance(env, playerId) {
  const db = env.DB;
  const [stages, days, spent] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN mode = 'daily' THEN score / 100 + (CASE WHEN score >= 1000 THEN 5 ELSE 0 END)
        WHEN mode = 'archive' THEN score / 200 ELSE 0 END), 0) AS n FROM plays WHERE player_id = ? AND state = 'done'`).bind(playerId).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM (SELECT z.date FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode = 'daily' AND pl.state = 'done' GROUP BY z.date HAVING COUNT(*) >= 3)`).bind(playerId).first(),
    db.prepare(`SELECT COALESCE(SUM(price), 0) AS n FROM purchases WHERE player_id = ?`).bind(playerId).first()
  ]);
  const earned = stages.n + days.n * DAY_BONUS;
  return { earned, spent: spent.n, balance: earned - spent.n };
}

async function owned(env, playerId) {
  return (await env.DB.prepare(`SELECT item FROM purchases WHERE player_id = ?`).bind(playerId).all()).results.map(r => r.item);
}

export async function get(env, who) {
  return { look: lookOf(who.player), owned: await owned(env, who.player.id), clovers: await cloverBalance(env, who.player.id) };
}

async function saveLook(env, who, look) {
  await env.DB.prepare(`UPDATE players SET skipper = ? WHERE id = ?`).bind(JSON.stringify(look), who.player.id).run();
  who.player.skipper = JSON.stringify(look);
}

export async function buy(env, who, body) {
  const slot = String(body.slot || ''), item = itemFor(slot, String(body.id || ''));
  if (!item || !item.price) throw new HttpError(400, 'That isn\'t for sale.');
  const key = itemKey(slot, item.id);
  const { earned } = await cloverBalance(env, who.player.id);
  // One statement, so two quick taps can't spend the same clovers twice.
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO purchases (player_id, item, price, created_at)
      SELECT ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(price), 0) FROM purchases WHERE player_id = ?) + ? <= ?`)
    .bind(who.player.id, key, item.price, nowISO(), who.player.id, item.price, earned).run();
  if (!r.meta.changes) {
    const mine = await owned(env, who.player.id);
    if (!mine.includes(key)) throw new HttpError(402, 'Not enough clovers yet. Keep climbing!');
  }
  // Put it on straight away (a name tag just unlocks renaming).
  if (slot !== 'name') await saveLook(env, who, { ...lookOf(who.player), [slot]: item.id });
  return get(env, who);
}

export async function wear(env, who, body) {
  const look = lookOf(who.player);
  const mine = await owned(env, who.player.id);
  const slot = String(body.slot || '');
  if (slot === 'name') {
    if (!mine.includes(itemKey('name', 'tag'))) throw new HttpError(403, 'Get the name tag first.');
    const n = cleanName(body.name);
    if (!n) throw new HttpError(400, 'Pick a name with at least one letter.');
    look.name = n;
  } else {
    const item = itemFor(slot, String(body.id || ''));
    if (!item || !WARDROBE[slot]) throw new HttpError(400, 'That isn\'t in the wardrobe.');
    if (item.price && !mine.includes(itemKey(slot, item.id))) throw new HttpError(403, 'Buy it first.');
    look[slot] = item.id;
  }
  await saveLook(env, who, look);
  return get(env, who);
}
