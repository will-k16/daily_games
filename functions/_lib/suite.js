// WK Game Suite: the home page's data (per-game status and streaks, the WK streak, WK Bucks) and the
// combined daily share text.
import { tipUrl, todayUTC, addDays, isDate, dayIndex, puzzleNumber } from './util.js';
import * as game from './game.js';
import * as venn from './venn.js';
import * as polly from './polly.js';
import { bucksBalance, lookOf, melLookOf, pollyLookOf } from './bucks.js';
import { summitShareText } from '../../public/js/score.js';
import { vennShareText } from '../../public/js/venn-score.js';
import { pollyShareText } from '../../public/js/polly-score.js';

const NEW_DAYS = 14;

/** Days with at least one finished daily stage or round, or one answered Polly question, of any game. */
async function wkStreak(env, who) {
  const db = env.DB;
  const [s, v, p] = await Promise.all([
    db.prepare(`SELECT DISTINCT z.date AS d FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode = 'daily' AND pl.state = 'done' AND z.date IS NOT NULL`).bind(who.player.id).all(),
    db.prepare(`SELECT DISTINCT z.date AS d FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode = 'daily' AND pl.state = 'done' AND z.date IS NOT NULL`).bind(who.player.id).all(),
    polly.wkDates(env, who)
  ]);
  return venn.streaks([...s.results.map(r => r.d), ...v.results.map(r => r.d), ...p]);
}

const isNew = (date, launch) => dayIndex(date) - dayIndex(isDate(launch) ? launch : date) < NEW_DAYS;

export async function today(env, who) {
  const date = todayUTC();
  const [summit, vennDay, pollyDay, summitStats, vennStats, pollyStats, wk, bucks] = await Promise.all([
    game.dayStatus(env, who, date), venn.dayStatus(env, who, date), polly.dayStatus(env, who, date),
    game.stats(env, who), venn.stats(env, who), polly.stats(env, who), wkStreak(env, who), bucksBalance(env, who.player.id)
  ]);
  return {
    date, nextReset: addDays(date, 1) + 'T00:00:00Z', tipUrl: tipUrl(env),
    me: { signedIn: who.signedIn, email: who.email, isAdmin: who.isAdmin, hasPassword: who.hasPassword },
    pets: { skipper: lookOf(who.player), mel: melLookOf(who.player), polly: pollyLookOf(who.player) },
    bucks, wkStreak: wk.streak,
    games: [
      { key: 'polly', number: pollyDay.number, done: pollyDay.done, of: 3, total: pollyDay.total, max: 300, streak: pollyStats.streak,
        noPoll: pollyDay.noPoll, isNew: false },
      { key: 'venn', number: vennDay.number, done: vennDay.done, of: 2, total: vennDay.total, max: 200, streak: vennStats.streak, isNew: false },
      { key: 'summit', number: summit.number, done: summit.done, of: 3, total: summit.total, max: 3000, streak: summitStats.streak, isNew: false }
    ]
  };
}

/** Every game played today (finished stages/rounds, answered Polly questions), newest game first, then one link to the suite. */
export async function share(env, who, host) {
  const date = todayUTC();
  const [summit, vennDay, pollyDay] = await Promise.all([game.dayStatus(env, who, date), venn.dayStatus(env, who, date), polly.dayStatus(env, who, date)]);
  const parts = [];
  if (pollyDay.done) parts.push(pollyShareText({ number: pollyDay.number, questions: pollyDay.questions }));
  if (vennDay.done) parts.push(vennShareText({ number: vennDay.number, rounds: vennDay.rounds }));
  if (summit.done) parts.push(summitShareText({ number: summit.number, rooms: summit.rooms }));
  if (!parts.length) return { text: '', games: 0 };
  return { text: parts.join('\n\n') + '\n\n' + host, games: parts.length };
}

/**
 * Every day this player has a result in any game, newest first: each game's day total and its per-stage /
 * round / question scores. What they played on the day wins; a day they only replayed from the archive
 * shows that replay, marked as one. Unfinished Summit stages and Venn rounds don't count yet.
 */
export async function history(env, who) {
  const db = env.DB, id = who.player.id;
  const [s, v, p] = await Promise.all([
    db.prepare(`SELECT z.date, z.slot AS part, pl.mode, pl.score FROM plays pl JOIN puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode IN ('daily','archive') AND pl.state = 'done' AND z.date IS NOT NULL`).bind(id).all(),
    db.prepare(`SELECT z.date, z.round AS part, pl.mode, pl.score, pl.count, z.par FROM venn_plays pl JOIN venn_puzzles z ON z.id = pl.puzzle_id
        WHERE pl.player_id = ? AND pl.mode IN ('daily','archive') AND pl.state = 'done' AND z.date IS NOT NULL`).bind(id).all(),
    db.prepare(`SELECT p.date, g.slot AS part, p.mode, g.score FROM polly_guesses g JOIN polly_plays p ON p.id = g.play_id
        WHERE p.player_id = ? AND p.mode IN ('daily','archive') AND p.date IS NOT NULL`).bind(id).all()
  ]);
  const games = {
    polly: { rows: p.results, parts: 3, number: d => polly.pollyNumber(env, d) },
    venn: { rows: v.results, parts: 2, number: d => venn.vennNumber(env, d) },
    summit: { rows: s.results, parts: 3, number: d => puzzleNumber(env, d) }
  };
  const days = new Map();
  for (const [key, g] of Object.entries(games)) {
    const byDate = new Map();
    g.rows.forEach(r => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); });
    for (const [date, rows] of byDate) {
      const mode = rows.some(r => r.mode === 'daily') ? 'daily' : 'archive';
      const mine = rows.filter(r => r.mode === mode);
      const parts = Array.from({ length: g.parts }, (_, i) => {
        const r = mine.find(x => x.part === i + 1);
        return r ? (key === 'venn' ? { score: r.score, count: r.count, par: r.par } : { score: r.score }) : null;
      });
      if (!days.has(date)) days.set(date, { date });
      days.get(date)[key] = { number: g.number(date), replay: mode === 'archive', done: mine.length, of: g.parts,
        total: mine.reduce((t, r) => t + (r.score || 0), 0), parts };
    }
  }
  return { today: todayUTC(), days: [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1)) };
}
