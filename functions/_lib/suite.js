// WK Game Suite: the home page's data (per-game status and streaks, the WK streak, WK Bucks) and the
// combined daily share text.
import { todayUTC, addDays, isDate, dayIndex } from './util.js';
import * as game from './game.js';
import * as venn from './venn.js';
import { bucksBalance } from './bucks.js';
import { summitShareText } from '../../public/js/score.js';
import { vennShareText } from '../../public/js/venn-score.js';

const NEW_DAYS = 14;

/** Days with at least one finished daily stage or round of any game. */
async function wkStreak(env, who) {
  const db = env.DB;
  const [s, v] = await Promise.all([
    db.prepare(`SELECT DISTINCT z.date AS d FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode = 'daily' AND pl.state = 'done' AND z.date IS NOT NULL`).bind(who.player.id).all(),
    db.prepare(`SELECT DISTINCT z.date AS d FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode = 'daily' AND pl.state = 'done' AND z.date IS NOT NULL`).bind(who.player.id).all()
  ]);
  return venn.streaks([...s.results, ...v.results].map(r => r.d));
}

export async function today(env, who) {
  const date = todayUTC();
  const [summit, vennDay, summitStats, vennStats, wk, bucks] = await Promise.all([
    game.dayStatus(env, who, date), venn.dayStatus(env, who, date),
    game.stats(env, who), venn.stats(env, who), wkStreak(env, who), bucksBalance(env, who.player.id)
  ]);
  const launch = isDate(env.VENN_LAUNCH_DATE) ? env.VENN_LAUNCH_DATE : date;
  return {
    date, nextReset: addDays(date, 1) + 'T00:00:00Z',
    me: { signedIn: who.signedIn, email: who.email, isAdmin: who.isAdmin, hasPassword: who.hasPassword },
    bucks, wkStreak: wk.streak,
    games: [
      { key: 'venn', number: vennDay.number, done: vennDay.done, of: 2, total: vennDay.total, max: 200, streak: vennStats.streak,
        isNew: dayIndex(date) - dayIndex(launch) < NEW_DAYS },
      { key: 'summit', number: summit.number, done: summit.done, of: 3, total: summit.total, max: 3000, streak: summitStats.streak, isNew: false }
    ]
  };
}

/** Every game played today (finished stages/rounds only), then one link to the suite. */
export async function share(env, who, host) {
  const date = todayUTC();
  const [summit, vennDay] = await Promise.all([game.dayStatus(env, who, date), venn.dayStatus(env, who, date)]);
  const parts = [];
  if (vennDay.done) parts.push(vennShareText({ number: vennDay.number, rounds: vennDay.rounds }));
  if (summit.done) parts.push(summitShareText({ number: summit.number, rooms: summit.rooms }));
  if (!parts.length) return { text: '', games: 0 };
  return { text: parts.join('\n\n') + '\n\n' + host, games: parts.length };
}
