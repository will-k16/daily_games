// Decides WHAT each new puzzle should be about before the AI writes it, so puzzles stay varied:
// the property is chosen here (rotating, never repeated nearby), each item gets a random "world"
// to come from, and items already used are banned.
import { PROPS } from '../../public/js/props.js';
import { addDays, normalize } from './util.js';

export const WORLDS = [
  'insects and bugs', 'ocean creatures', 'birds', 'farm animals', 'dinosaurs and fossils', 'pets',
  'fruits and vegetables', 'snacks and candy', 'kitchen tools', 'restaurant dishes', 'drinks',
  'musical instruments', 'sports equipment', 'board games and toys', 'video game consoles and gadgets',
  'school supplies', 'clothing and shoes', 'jewelry and treasure', 'furniture', 'household appliances',
  'cars and trucks', 'trains, boats and planes', 'bicycles and scooters', 'spacecraft and rockets',
  'planets, moons and stars', 'weather and natural events', 'mountains, volcanoes and canyons', 'rivers, lakes and oceans',
  'famous buildings and landmarks', 'bridges and towers', 'cities and countries', 'theme parks and stadiums',
  'ancient history', 'famous artworks', 'books and movies', 'trees and plants', 'the human body', 'tools and hardware',
  'money and coins', 'holidays and celebrations', 'office and technology', 'medical equipment', 'construction machines'
];

function weightedPick(items) {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of items) { if ((r -= x.w) <= 0) return x.v; }
  return items[items.length - 1].v;
}

/** Words that don't change what an item is ("an adult house mouse" ≈ "a house mouse"). */
const FILLER = /\b(adult|typical|standard|average|regular|common|ordinary|full[- ]?grown|fully[- ]grown|large|small|big|little|tiny|giant|single|whole|new|modern|wild|domestic|grown|mature|baby|young|old|full|empty|empty|one|of|the)\b/g;
export const itemCore = s => normalize(s).replace(FILLER, ' ').replace(/s\b/g, '').replace(/\s+/g, ' ').trim();

/** Item names from the most recent puzzles of any status (drafts and rejected ones too). */
export async function recentItems(env, limit = 240) {
  const rows = (await env.DB.prepare(`SELECT small_item, big_item FROM puzzles ORDER BY id DESC LIMIT ?`).bind(limit).all()).results;
  const out = [];
  rows.forEach(r => { out.push(r.small_item, r.big_item); });
  return [...new Set(out)];
}

/**
 * Returns one spec per slot: { tier, property, worlds: [[3 small-item ideas], [3 big-item ideas]] }.
 * date may be null (unlimited mode): then only recent history is used.
 */
export async function planSpecs(env, date, slots) {
  const db = env.DB;
  let near = [];
  if (date) {
    near = (await db.prepare(`SELECT date, slot, property FROM puzzles WHERE date BETWEEN ? AND ? AND status != 'rejected'`)
      .bind(addDays(date, -10), addDays(date, 10)).all()).results;
  } else {
    near = (await db.prepare(`SELECT date, slot, property FROM puzzles WHERE status != 'rejected' ORDER BY id DESC LIMIT 12`).all()).results;
  }
  const dist = r => (date && r.date ? Math.abs((new Date(r.date) - new Date(date)) / 86400000) : 1);
  const sameDay = new Set(near.filter(r => date && r.date === date && !slots.includes(r.slot)).map(r => r.property));
  const chosen = new Set();
  const keys = Object.keys(PROPS);

  return slots.map(slot => {
    const options = keys.filter(k => !sameDay.has(k) && !chosen.has(k)).map(k => {
      let w = PROPS[k].tier === slot ? 3 : 1;                          // lean toward the room's difficulty…
      near.forEach(r => {
        if (r.property !== k) return;
        const d = dist(r);
        if (d <= 2) w *= 0.0001;                                         // …never repeat within 2 days if anything else is left,
        else if (d <= 3) w *= 0.08;                                      // almost never within 3,
        else if (d <= 7) w *= 0.4;
        if (r.slot === slot && d <= 10) w *= 0.5;                        // and rarely the same room twice in a stretch.
      });
      return { v: k, w };
    });
    const property = weightedPick(options.length ? options : keys.map(k => ({ v: k, w: 1 })));
    chosen.add(property);
    const shuffled = WORLDS.slice().sort(() => Math.random() - 0.5);
    // Open-ended properties (weight, height…) get random worlds for variety; narrow ones (word count…) don't,
    // because forcing a world there produces nonsense like "the word count of a pigeon".
    return { tier: slot, property, worlds: PROPS[property] && PROPS[property].fits ? null : [shuffled.slice(0, 3), shuffled.slice(3, 6)] };
  });
}
