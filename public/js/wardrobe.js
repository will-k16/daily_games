// Skipper's wardrobe: everything a player can buy with WK Bucks. Shared by browser + API.
// Summit pays WK Bucks for climbing (see bucksFor); prices are in WK Bucks. Price 0 = everyone has it.

export const SLOTS = [
  { key: 'fur', name: 'Fur' },
  { key: 'hat', name: 'Hat' },
  { key: 'scarf', name: 'Scarf' },
  { key: 'glasses', name: 'Glasses' },
  { key: 'cabin', name: 'Cable car' },
  { key: 'name', name: 'Name' }
];

export const WARDROBE = {
  fur: [
    { id: 'cream', name: 'Cream', price: 0, c: ['#f7f1e5', '#e2d5bf'] },
    { id: 'ginger', name: 'Ginger', price: 30, c: ['#e7a764', '#c98543'] },
    { id: 'chocolate', name: 'Chocolate', price: 30, c: ['#94664a', '#744c34'] },
    { id: 'silver', name: 'Silver', price: 30, c: ['#cdd3db', '#aab2bd'] },
    { id: 'charcoal', name: 'Charcoal', price: 40, c: ['#6a6f78', '#52565e'] },
    { id: 'pink', name: 'Cotton candy', price: 50, c: ['#f7c6d6', '#e3a3ba'] },
    { id: 'midnight', name: 'Midnight', price: 60, c: ['#4b4766', '#37344d'] }
  ],
  hat: [
    { id: 'beanie', name: 'Red beanie', price: 0, kind: 'beanie', c: ['#d9482b', '#a8331c'] },
    { id: 'none', name: 'No hat', price: 0, kind: 'none' },
    { id: 'beanie-blue', name: 'Blue beanie', price: 15, kind: 'beanie', c: ['#3f78c9', '#2b5694'] },
    { id: 'beanie-green', name: 'Green beanie', price: 15, kind: 'beanie', c: ['#3f8a4f', '#2d6340'] },
    { id: 'party', name: 'Party hat', price: 25, kind: 'party', c: ['#f28cb1', '#ffd166'] },
    { id: 'cowboy', name: 'Cowboy hat', price: 40, kind: 'cowboy', c: ['#9a6a3c', '#6e4a28'] },
    { id: 'tophat', name: 'Top hat', price: 60, kind: 'tophat', c: ['#2a2b33', '#d9482b'] },
    { id: 'crown', name: 'Crown', price: 120, kind: 'crown', c: ['#f2c13d', '#c8901f'] }
  ],
  scarf: [
    { id: 'red', name: 'Red', price: 0, c: ['#d9482b', '#f3ead8'] },
    { id: 'blue', name: 'Blue', price: 15, c: ['#3f78c9', '#f3ead8'] },
    { id: 'green', name: 'Green', price: 15, c: ['#3f8a4f', '#f3ead8'] },
    { id: 'gold', name: 'Gold', price: 20, c: ['#f2b33d', '#fff4dc'] },
    { id: 'purple', name: 'Purple', price: 20, c: ['#7d55c7', '#f3ead8'] },
    { id: 'rainbow', name: 'Rainbow', price: 45, rainbow: true, c: ['#d9482b', '#f3ead8'] }
  ],
  glasses: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'specs', name: 'Round specs', price: 20, kind: 'specs' },
    { id: 'shades', name: 'Sunglasses', price: 35, kind: 'shades' },
    { id: 'stars', name: 'Star shades', price: 50, kind: 'stars' }
  ],
  cabin: [
    { id: 'red', name: 'Classic red', price: 0, c: '#d9482b' },
    { id: 'blue', name: 'Lake blue', price: 40, c: '#3f78c9' },
    { id: 'green', name: 'Pine green', price: 40, c: '#3f8a4f' },
    { id: 'purple', name: 'Twilight', price: 50, c: '#7d55c7' },
    { id: 'black', name: 'Night owl', price: 50, c: '#3a3f4a' },
    { id: 'gold', name: 'Gold', price: 80, c: '#e2a72e' }
  ],
  name: [
    { id: 'tag', name: 'Name tag', price: 20 }
  ]
};

export const DEFAULT_NAME = 'Skipper';
export const DEFAULT_LOOK = { fur: 'cream', hat: 'beanie', scarf: 'red', glasses: 'none', cabin: 'red', name: DEFAULT_NAME };

export const itemKey = (slot, id) => slot + ':' + id;
export function itemFor(slot, id) { return (WARDROBE[slot] || []).find(x => x.id === id) || null; }

/** Fills in defaults and drops anything that isn't in the catalog. */
export function resolveLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (look && typeof look === 'object') {
    for (const slot of ['fur', 'hat', 'scarf', 'glasses', 'cabin']) if (itemFor(slot, look[slot])) out[slot] = look[slot];
    const n = cleanName(look.name);
    if (n) out.name = n;
  }
  return out;
}

/** Letters, numbers, spaces and a little punctuation; 1–16 characters. '' if nothing usable. */
export function cleanName(s) {
  return String(s || '').replace(/[^\p{L}\p{N} '’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

/**
 * WK Bucks for one finished Summit stage: 1 per 100 m on the daily (+5 for a perfect 1,000), half on
 * the archive, none for practice. Finishing all three daily stages adds DAY_BONUS. The API's SQL in
 * functions/_lib/bucks.js counts the same way.
 */
export const DAY_BONUS = 5;
export function bucksFor(score, mode) {
  const s = Math.max(0, Number(score) || 0);
  if (mode === 'daily') return Math.floor(s / 100) + (s >= 1000 ? 5 : 0);
  if (mode === 'archive') return Math.floor(s / 200);
  return 0;
}
