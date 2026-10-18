// Polly's shop: her outfit and the town square's decor, paid in WK Bucks. Shared by browser + API,
// same shape as Skipper's (wardrobe.js) and Mel's (mel-wardrobe.js). Purchase keys start with "polly:"
// so they never clash with the others. Price 0 = everyone has it. Decor changes the square for you only.
import { cleanName } from './wardrobe.js';

export const POLLY_TABS = [
  { key: 'polly', name: 'Polly', slots: ['crest', 'hat', 'bell', 'name'] },
  { key: 'town', name: 'Town', slots: ['bunting', 'fountain', 'lamps', 'ground', 'visitors'] }
];

export const POLLY_SLOTS = [
  { key: 'crest', name: 'Crest' },
  { key: 'hat', name: 'Hat' },
  { key: 'bell', name: 'Bell' },
  { key: 'name', name: 'Name' },
  { key: 'bunting', name: 'Bunting' },
  { key: 'fountain', name: 'Fountain' },
  { key: 'lamps', name: 'Lamps' },
  { key: 'ground', name: 'Ground' },
  { key: 'visitors', name: 'Visitors' }
];

export const POLLY_WARDROBE = {
  crest: [
    { id: 'sunny', name: 'Sunny yellow', price: 0, c: '#f2c230' },
    { id: 'peach', name: 'Peach', price: 25, c: '#f6b98a' },
    { id: 'coral', name: 'Coral', price: 30, c: '#f07a5a' },
    { id: 'mint', name: 'Mint', price: 30, c: '#86d3a8' },
    { id: 'lilac', name: 'Lilac', price: 40, c: '#b9a2e0' },
    { id: 'flame', name: 'Flame', price: 50, c: '#e8452b' }
  ],
  hat: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'tricorn', name: 'Tricorn', price: 25, kind: 'tricorn' },
    { id: 'bowler', name: 'Bowler', price: 35, kind: 'bowler' },
    { id: 'tophat', name: 'Top hat', price: 60, kind: 'tophat' },
    { id: 'crown', name: 'Crown', price: 120, kind: 'crown' }
  ],
  bell: [
    { id: 'brass', name: 'Brass', price: 0, c: '#b8862e' },
    { id: 'silver', name: 'Silver', price: 30, c: '#c9ced6' },
    { id: 'gold', name: 'Gold', price: 60, c: '#f2c13d' }
  ],
  name: [
    { id: 'tag', name: 'Name tag', price: 20 }
  ],
  bunting: [
    { id: 'triangles', name: 'Triangle flags', price: 0, kind: 'triangles' },
    { id: 'pennants', name: 'Square pennants', price: 20, kind: 'pennants' },
    { id: 'lanterns', name: 'Paper lanterns', price: 40, kind: 'lanterns' },
    { id: 'lights', name: 'String lights', price: 60, kind: 'lights' }
  ],
  fountain: [
    { id: 'stone', name: 'Stone basin', price: 0, kind: 'stone' },
    { id: 'marble', name: 'Tiered marble', price: 40, kind: 'marble' },
    { id: 'lions', name: 'Lion heads', price: 60, kind: 'lions' },
    { id: 'golden', name: 'Golden', price: 100, kind: 'golden' }
  ],
  lamps: [
    { id: 'iron', name: 'Iron posts', price: 0, kind: 'iron' },
    { id: 'gas', name: 'Gas lanterns', price: 30, kind: 'gas' },
    { id: 'globe', name: 'Globe lamps', price: 40, kind: 'globe' }
  ],
  ground: [
    { id: 'cobbles', name: 'Grey cobbles', price: 0, kind: 'cobbles' },
    { id: 'brick', name: 'Red brick', price: 30, kind: 'brick' },
    { id: 'herringbone', name: 'Herringbone', price: 40, kind: 'herringbone' }
  ],
  visitors: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'ducks', name: 'Ducks', price: 25, kind: 'ducks' },
    { id: 'dogwalker', name: 'Dog walker', price: 35, kind: 'dogwalker' },
    { id: 'icecream', name: 'Ice-cream cart', price: 50, kind: 'icecream' }
  ]
};

export const POLLY_DEFAULT_NAME = 'Polly';
export const POLLY_DEFAULT_LOOK = {
  crest: 'sunny', hat: 'none', bell: 'brass', name: POLLY_DEFAULT_NAME,
  bunting: 'triangles', fountain: 'stone', lamps: 'iron', ground: 'cobbles', visitors: 'none'
};
const WEAR_SLOTS = ['crest', 'hat', 'bell', 'bunting', 'fountain', 'lamps', 'ground', 'visitors'];

export const pollyItemKey = (slot, id) => 'polly:' + slot + ':' + id;
export function pollyItemFor(slot, id) { return (POLLY_WARDROBE[slot] || []).find(x => x.id === id) || null; }

/** Fills in defaults and drops anything that isn't in the catalog. */
export function resolvePollyLook(look) {
  const out = { ...POLLY_DEFAULT_LOOK };
  if (look && typeof look === 'object') {
    for (const slot of WEAR_SLOTS) if (pollyItemFor(slot, look[slot])) out[slot] = look[slot];
    const n = cleanName(look.name);
    if (n) out.name = n;
  }
  return out;
}

export { cleanName };
