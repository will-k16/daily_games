// Race's shop: the jerboa from Lifeline, paid in WK Bucks. Shared by browser + API, same shape as the
// other pets' catalogs. Purchase keys start with "race:" so they never clash. Price 0 = everyone has it.
import { cleanName } from './wardrobe.js';

export const RACE_SLOTS = [
  { key: 'fur', name: 'Fur' },
  { key: 'hat', name: 'Hat' },
  { key: 'socks', name: 'Socks' },
  { key: 'trail', name: 'Jump trail' },
  { key: 'name', name: 'Name' }
];

// Fur: [back, shade, belly]
export const RACE_WARDROBE = {
  fur: [
    { id: 'sand', name: 'Desert sand', price: 0, c: ['#d9b07a', '#b48654', '#f6e8cf'] },
    { id: 'cinnamon', name: 'Cinnamon', price: 25, c: ['#c47a45', '#97582c', '#f2d6b8'] },
    { id: 'cocoa', name: 'Cocoa', price: 30, c: ['#8a5f43', '#68442e', '#e7d2bf'] },
    { id: 'ash', name: 'Ash grey', price: 30, c: ['#a9a49c', '#827d76', '#ece9e3'] },
    { id: 'snow', name: 'Snow', price: 40, c: ['#f4f1ea', '#d6cfc1', '#ffffff'] },
    { id: 'golden', name: 'Golden', price: 50, c: ['#e8b93a', '#bb8d1f', '#fbeab4'] },
    { id: 'rose', name: 'Rose', price: 50, c: ['#e9a3b4', '#c97a8d', '#fbe3ea'] },
    { id: 'midnight', name: 'Midnight', price: 60, c: ['#4a4766', '#34314d', '#a9a5c9'] },
    { id: 'mint', name: 'Mint', price: 60, c: ['#8fd1b4', '#62a98a', '#e1f5ec'] }
  ],
  hat: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'fez', name: 'Fez', price: 15, kind: 'fez' },
    { id: 'party', name: 'Party hat', price: 20, kind: 'party' },
    { id: 'propeller', name: 'Propeller cap', price: 30, kind: 'propeller' },
    { id: 'explorer', name: 'Explorer helmet', price: 35, kind: 'explorer' },
    { id: 'cowboy', name: 'Cowboy hat', price: 40, kind: 'cowboy' },
    { id: 'graduate', name: 'Graduation cap', price: 45, kind: 'graduate' },
    { id: 'wizard', name: 'Wizard hat', price: 60, kind: 'wizard' },
    { id: 'tophat', name: 'Top hat', price: 60, kind: 'tophat' },
    { id: 'crown', name: 'Crown', price: 120, kind: 'crown' }
  ],
  socks: [
    { id: 'none', name: 'Bare feet', price: 0, kind: 'none' },
    { id: 'white', name: 'White', price: 10, kind: 'plain', c: ['#ffffff', '#d9d4ca'] },
    { id: 'red', name: 'Red', price: 15, kind: 'plain', c: ['#d9412b', '#a32d1c'] },
    { id: 'blue', name: 'Blue', price: 15, kind: 'plain', c: ['#3b82d6', '#2a5fa0'] },
    { id: 'stripes', name: 'Candy stripes', price: 25, kind: 'stripes', c: ['#ffffff', '#d9412b'] },
    { id: 'green', name: 'Green stripes', price: 25, kind: 'stripes', c: ['#e8f5d6', '#3f8a4f'] },
    { id: 'gold', name: 'Gold', price: 40, kind: 'plain', c: ['#f2c13d', '#c8901f'] },
    { id: 'rainbow', name: 'Rainbow', price: 50, kind: 'rainbow' }
  ],
  trail: [
    { id: 'white', name: 'White', price: 0, c: '#ffffff' },
    { id: 'gold', name: 'Gold', price: 20, c: '#f2c13d' },
    { id: 'sky', name: 'Sky blue', price: 20, c: '#7cc4f2' },
    { id: 'pink', name: 'Pink', price: 20, c: '#f28cb1' },
    { id: 'lime', name: 'Lime', price: 25, c: '#9be15d' },
    { id: 'red', name: 'Red', price: 25, c: '#ef5a3c' },
    { id: 'rainbow', name: 'Rainbow', price: 60, c: '#ffffff', rainbow: true }
  ],
  name: [
    { id: 'tag', name: 'Name tag', price: 20 }
  ]
};

export const RAINBOW = ['#e5483b', '#f29a2e', '#f2d230', '#4bbf58', '#3b82d6', '#8e4fc4'];
export const RACE_DEFAULT_NAME = 'Race';
export const RACE_DEFAULT_LOOK = { fur: 'sand', hat: 'none', socks: 'none', trail: 'white', name: RACE_DEFAULT_NAME };
const WEAR_SLOTS = ['fur', 'hat', 'socks', 'trail'];

export const raceItemKey = (slot, id) => 'race:' + slot + ':' + id;
export function raceItemFor(slot, id) { return (RACE_WARDROBE[slot] || []).find(x => x.id === id) || null; }

/** Fills in defaults and drops anything that isn't in the catalog. */
export function resolveRaceLook(look) {
  const out = { ...RACE_DEFAULT_LOOK };
  if (look && typeof look === 'object') {
    for (const slot of WEAR_SLOTS) if (raceItemFor(slot, look[slot])) out[slot] = look[slot];
    const n = cleanName(look.name);
    if (n) out.name = n;
  }
  return out;
}

export { cleanName };
