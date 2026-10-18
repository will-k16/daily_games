// Mel's wardrobe: everything a player can buy for Mel with WK Bucks. Shared by browser + API, same
// shape as Skipper's (public/js/wardrobe.js). Purchase keys start with "mel:" so they never clash
// with Skipper's. Price 0 = everyone has it.
import { cleanName } from './wardrobe.js';

export const MEL_SLOTS = [
  { key: 'skin', name: 'Skin' },
  { key: 'pattern', name: 'Pattern' },
  { key: 'hat', name: 'Hat' },
  { key: 'eyewear', name: 'Eyewear' },
  { key: 'neck', name: 'Neck' },
  { key: 'name', name: 'Name' }
];

// Skin colors: [body, shade, belly/highlight]
export const MEL_WARDROBE = {
  skin: [
    { id: 'fern', name: 'Fern', price: 0, c: ['#3d7a5a', '#2b5a41', '#7fb48f'] },
    { id: 'lime', name: 'Lime', price: 30, c: ['#8cc63f', '#64952a', '#cde98f'] },
    { id: 'teal', name: 'Teal', price: 30, c: ['#2a9d8f', '#1d7268', '#86d3c8'] },
    { id: 'sunset', name: 'Sunset orange', price: 30, c: ['#e8743b', '#b55425', '#f6b98a'] },
    { id: 'sky', name: 'Sky blue', price: 40, c: ['#5aa9e6', '#3c7fb5', '#b3daf6'] },
    { id: 'ruby', name: 'Ruby', price: 40, c: ['#c0304a', '#8e1f34', '#ec8a9a'] },
    { id: 'berry', name: 'Berry purple', price: 50, c: ['#8e3fa0', '#652b73', '#cf9bdb'] },
    { id: 'midnight', name: 'Midnight', price: 60, c: ['#2c3550', '#1c2236', '#6b7699'] }
  ],
  pattern: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'spots', name: 'Spots', price: 25, kind: 'spots' },
    { id: 'stripes', name: 'Stripes', price: 25, kind: 'stripes' },
    { id: 'speckles', name: 'Speckles', price: 30, kind: 'speckles' },
    { id: 'zigzag', name: 'Zigzag', price: 35, kind: 'zigzag' },
    { id: 'camo', name: 'Camo', price: 50, kind: 'camo' },
    { id: 'rainbow', name: 'Rainbow bands', price: 80, kind: 'rainbow' },
    { id: 'galaxy', name: 'Galaxy', price: 90, kind: 'galaxy' }
  ],
  hat: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'leaf', name: 'Leaf hat', price: 15, kind: 'leaf' },
    { id: 'flowers', name: 'Flower crown', price: 25, kind: 'flowers' },
    { id: 'explorer', name: 'Explorer hat', price: 40, kind: 'explorer' },
    { id: 'tophat', name: 'Tiny top hat', price: 60, kind: 'tophat' },
    { id: 'crown', name: 'Crown', price: 120, kind: 'crown' }
  ],
  eyewear: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'specs', name: 'Round specs', price: 20, kind: 'specs' },
    { id: 'shades', name: 'Sunglasses', price: 35, kind: 'shades' },
    { id: 'monocle', name: 'Monocle', price: 45, kind: 'monocle' }
  ],
  neck: [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'bandana', name: 'Bandana', price: 15, kind: 'bandana', c: '#d9412b' },
    { id: 'bowtie', name: 'Bowtie', price: 20, kind: 'bowtie', c: '#f2c230' },
    { id: 'scarf', name: 'Scarf', price: 20, kind: 'scarf', c: '#3b82d6' }
  ],
  name: [
    { id: 'tag', name: 'Name tag', price: 20 }
  ]
};

export const MEL_DEFAULT_NAME = 'Mel';
export const MEL_DEFAULT_LOOK = { skin: 'fern', pattern: 'none', hat: 'none', eyewear: 'none', neck: 'none', name: MEL_DEFAULT_NAME };
const WEAR_SLOTS = ['skin', 'pattern', 'hat', 'eyewear', 'neck'];

export const melItemKey = (slot, id) => 'mel:' + slot + ':' + id;
export function melItemFor(slot, id) { return (MEL_WARDROBE[slot] || []).find(x => x.id === id) || null; }

/** Fills in defaults and drops anything that isn't in the catalog. */
export function resolveMelLook(look) {
  const out = { ...MEL_DEFAULT_LOOK };
  if (look && typeof look === 'object') {
    for (const slot of WEAR_SLOTS) if (melItemFor(slot, look[slot])) out[slot] = look[slot];
    const n = cleanName(look.name);
    if (n) out.name = n;
  }
  return out;
}

export { cleanName };
