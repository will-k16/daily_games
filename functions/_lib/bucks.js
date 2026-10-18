// WK Bucks: the suite-wide ledger (earned in any game, spent in any game's shop) and the two shops,
// Skipper's wardrobe (Summit) and Mel's wardrobe (Venn). Catalogs live in public/js/wardrobe.js and
// public/js/mel-wardrobe.js. Admin grants are purchases with a negative price, so the balance is
// simply earned − spent.
import { HttpError, nowISO, safeJson } from './util.js';
import { WARDROBE, DAY_BONUS, itemFor, itemKey, resolveLook, cleanName } from '../../public/js/wardrobe.js';
import { MEL_WARDROBE, melItemFor, melItemKey, resolveMelLook } from '../../public/js/mel-wardrobe.js';

export const lookOf = player => resolveLook(safeJson((player && player.skipper) || '{}', {}));
export const melLookOf = player => resolveMelLook(safeJson((player && player.mel) || '{}', {}));

/**
 * Earned from finished Summit stages and Venn rounds (same rules as bucksFor / bucksForRound), minus
 * what's been spent.
 *   Summit: 1 per 100 m on the daily, +5 for a perfect 1,000 stage, +5 for finishing all three; archive half.
 *   Venn:   floor(score / 4) per daily round, floor(score / 8) per archive round.
 */
export async function bucksBalance(env, playerId) {
  const db = env.DB;
  const [stages, days, venn, spent] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN mode = 'daily' THEN score / 100 + (CASE WHEN score >= 1000 THEN 5 ELSE 0 END)
        WHEN mode = 'archive' THEN score / 200 ELSE 0 END), 0) AS n FROM plays WHERE player_id = ? AND state = 'done'`).bind(playerId).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM (SELECT z.date FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode = 'daily' AND pl.state = 'done' GROUP BY z.date HAVING COUNT(*) >= 3)`).bind(playerId).first(),
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN mode = 'daily' THEN COALESCE(score, 0) / 4 WHEN mode = 'archive' THEN COALESCE(score, 0) / 8 ELSE 0 END), 0) AS n
        FROM venn_plays WHERE player_id = ? AND state = 'done'`).bind(playerId).first(),
    db.prepare(`SELECT COALESCE(SUM(price), 0) AS n FROM purchases WHERE player_id = ?`).bind(playerId).first()
  ]);
  const earned = stages.n + days.n * DAY_BONUS + venn.n;
  return { earned, spent: spent.n, balance: earned - spent.n };
}

async function owned(env, playerId) {
  return (await env.DB.prepare(`SELECT item FROM purchases WHERE player_id = ?`).bind(playerId).all()).results.map(r => r.item);
}

/* ───────────── Shops ───────────── */

const SHOPS = {
  skipper: { column: 'skipper', catalog: WARDROBE, itemFor, itemKey, lookOf, resolve: resolveLook },
  mel: { column: 'mel', catalog: MEL_WARDROBE, itemFor: melItemFor, itemKey: melItemKey, lookOf: melLookOf, resolve: resolveMelLook }
};

function shop(name) { return SHOPS[name]; }

export async function get(env, who, name = 'skipper') {
  const s = shop(name);
  return { look: s.lookOf(who.player), owned: await owned(env, who.player.id), bucks: await bucksBalance(env, who.player.id) };
}

async function saveLook(env, who, s, look) {
  await env.DB.prepare(`UPDATE players SET ${s.column} = ? WHERE id = ?`).bind(JSON.stringify(look), who.player.id).run();
  who.player[s.column] = JSON.stringify(look);
}

export async function buy(env, who, body, name = 'skipper') {
  const s = shop(name);
  const slot = String(body.slot || ''), item = s.itemFor(slot, String(body.id || ''));
  if (!item || !item.price) throw new HttpError(400, 'That isn\'t for sale.');
  const key = s.itemKey(slot, item.id);
  const { earned } = await bucksBalance(env, who.player.id);
  // One statement, so two quick taps can't spend the same WK Bucks twice.
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO purchases (player_id, item, price, created_at)
      SELECT ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(price), 0) FROM purchases WHERE player_id = ?) + ? <= ?`)
    .bind(who.player.id, key, item.price, nowISO(), who.player.id, item.price, earned).run();
  if (!r.meta.changes) {
    const mine = await owned(env, who.player.id);
    if (!mine.includes(key)) throw new HttpError(402, 'Not enough WK Bucks yet. Keep playing!');
  }
  // Put it on straight away (a name tag just unlocks renaming).
  if (slot !== 'name') await saveLook(env, who, s, { ...s.lookOf(who.player), [slot]: item.id });
  return get(env, who, name);
}

export async function wear(env, who, body, name = 'skipper') {
  const s = shop(name);
  const look = s.lookOf(who.player);
  const mine = await owned(env, who.player.id);
  const slot = String(body.slot || '');
  if (slot === 'name') {
    if (!mine.includes(s.itemKey('name', 'tag'))) throw new HttpError(403, 'Get the name tag first.');
    const n = cleanName(body.name);
    if (!n) throw new HttpError(400, 'Pick a name with at least one letter.');
    look.name = n;
  } else {
    const item = s.itemFor(slot, String(body.id || ''));
    if (!item || !s.catalog[slot]) throw new HttpError(400, 'That isn\'t in the wardrobe.');
    if (item.price && !mine.includes(s.itemKey(slot, item.id))) throw new HttpError(403, 'Buy it first.');
    look[slot] = item.id;
  }
  await saveLook(env, who, s, look);
  return get(env, who, name);
}
