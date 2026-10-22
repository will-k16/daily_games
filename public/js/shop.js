// One shop for every pet: Skipper (Summit), Mel (Venn) and Polly (Polly, plus her town square's decor).
// Each game opens it from its header, and the pet corner opens any of the three. Prices are in WK Bucks,
// and buying takes two taps: the first tries it on and asks.
//
//   openShop('mel', { api, toast, onChange })   onChange({ look, owned, bucks }) runs after every buy / wear / rename.
import { openModal } from './modal.js';
import { bucksIcon, bucksAmount } from './bucks.js';
import { WARDROBE, SLOTS, DEFAULT_LOOK, itemKey } from './wardrobe.js';
import { MEL_WARDROBE, MEL_SLOTS, MEL_DEFAULT_LOOK, melItemKey } from './mel-wardrobe.js';
import { POLLY_WARDROBE, POLLY_TABS, POLLY_SLOTS, POLLY_DEFAULT_LOOK, pollyItemKey } from './polly-wardrobe.js';
import { skipperPortrait } from './pixel.js';
import { melPortrait } from './mel.js';
import { pollyPortrait, hatIcon } from './polly-sprites.js';
import { drawTownStill, timeOfDay } from './polly-scene.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Swatches: what each item looks like on its button ── */
const box = bg => `<span class="sw" style="background:${bg}"></span>`;
const emoji = e => `<span class="sw em">${e}</span>`;
const TAG = emoji('🏷️');

function skipperSwatch(slot, it) {
  if (slot === 'fur') return box(it.c[0]);
  if (slot === 'cabin') return box(it.c);
  if (slot === 'scarf') return box(it.rainbow ? 'linear-gradient(90deg,#d9482b,#f2b33d,#5fae6a,#3f78c9,#7d55c7)' : `repeating-linear-gradient(90deg,${it.c[0]} 0 6px,${it.c[1]} 6px 9px)`);
  if (slot === 'hat') return emoji({ none: '🙅', beanie: '🧶', party: '🥳', cowboy: '🤠', tophat: '🎩', crown: '👑' }[it.kind]);
  if (slot === 'glasses') return emoji({ none: '👀', specs: '👓', shades: '🕶️', stars: '⭐' }[it.kind]);
  return TAG;
}

const MEL_PATTERN = {
  none: 'var(--panel2, #e9e2d2)', spots: 'radial-gradient(circle at 30% 30%, #cde98f 0 3px, transparent 4px) 0 0/10px 10px, #3d7a5a',
  stripes: 'repeating-linear-gradient(90deg, #3d7a5a 0 5px, #2b5a41 5px 7px)', speckles: 'radial-gradient(circle, #fff 0 1px, transparent 2px) 0 0/7px 7px, #3d7a5a',
  zigzag: 'linear-gradient(135deg, #f2d230 25%, transparent 25%) -5px 0/10px 10px, linear-gradient(225deg, #f2d230 25%, transparent 25%) -5px 0/10px 10px, #3d7a5a',
  camo: 'radial-gradient(circle at 30% 40%, #3a3a1e 0 5px, transparent 6px), radial-gradient(circle at 70% 70%, #c9b77a 0 4px, transparent 5px), #3d7a5a',
  rainbow: 'repeating-linear-gradient(90deg, #e5483b 0 4px, #f29a2e 4px 8px, #f2d230 8px 12px, #4bbf58 12px 16px, #3b82d6 16px 20px, #8e4fc4 20px 24px)',
  galaxy: 'radial-gradient(circle, #fff 0 1px, transparent 2px) 0 0/8px 8px, #2a1650'
};
const MEL_ICON = {
  hat: { none: '—', leaf: '🍃', flowers: '🌼', explorer: '🧢', tophat: '🎩', crown: '👑' },
  eyewear: { none: '👀', specs: '👓', shades: '🕶️', monocle: '🧐' },
  neck: { none: '—', bandana: '🟥', bowtie: '🎀', scarf: '🧣' }
};
function melSwatch(slot, it) {
  if (slot === 'skin') return box(it.c[0]);
  if (slot === 'pattern') return box(MEL_PATTERN[it.kind] || MEL_PATTERN.none);
  if (MEL_ICON[slot]) return emoji(MEL_ICON[slot][it.kind] || '·');
  return TAG;
}

const POLLY_ICON = {
  bunting: { triangles: '🔺', pennants: '🟧', lanterns: '🏮', lights: '💡' },
  fountain: { stone: '⛲', marble: '🏛️', lions: '🦁', golden: '🏆' },
  lamps: { iron: '🕯️', gas: '🔥', globe: '🔮' },
  ground: { cobbles: '🪨', brick: '🧱', herringbone: '🟫' },
  visitors: { none: '—', ducks: '🦆', dogwalker: '🐕', icecream: '🍦' }
};
const hatSrc = {};
function pollySwatch(slot, it) {
  if (slot === 'crest' || slot === 'bell') return box(it.c);
  if (slot === 'hat') {
    if (!hatSrc[it.kind]) hatSrc[it.kind] = hatIcon(POLLY_DEFAULT_LOOK, it.kind).toDataURL();
    return `<span class="sw"><img src="${hatSrc[it.kind]}" alt=""></span>`;
  }
  if (POLLY_ICON[slot]) return emoji(POLLY_ICON[slot][it.kind] || '·');
  return TAG;
}

/* ── Portraits: drawn every 220 ms, reading the look each frame so a hovered item shows right away ── */
let portraitTimer = 0;
function animate(cv, frame) {
  const ctx = cv.getContext('2d');
  let n = 0;
  const draw = () => { ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(frame(n), 0, 0); };
  draw();
  clearInterval(portraitTimer);
  portraitTimer = setInterval(() => { if (!cv.isConnected) { clearInterval(portraitTimer); return; } n++; draw(); }, 220);
}

/* ── The three shops ── */
export const PETS = {
  skipper: {
    game: 'Summit', noun: 'goat', defaultName: 'Skipper', path: 'skipper', catalog: WARDROBE, key: itemKey, swatch: skipperSwatch,
    groups: [{ key: 'skipper', slots: SLOTS.map(s => s.key) }], slotName: k => SLOTS.find(s => s.key === k).name,
    pays: 'Summit pays 1 WK Buck for every 100 m you climb on the daily (bonus 5 for a perfect stage, and 5 more for finishing all three). Past days pay half.',
    canvas: () => [46, 46], cls: () => 'sm',
    paint: (cv, look) => animate(cv, n => skipperPortrait('smile', n % 14 === 0, n % 9 === 0 ? 1 : 0, look()))
  },
  mel: {
    game: 'Venn', noun: 'chameleon', defaultName: 'Mel', path: 'mel', catalog: MEL_WARDROBE, key: melItemKey, swatch: melSwatch,
    groups: [{ key: 'mel', slots: MEL_SLOTS.map(s => s.key) }], slotName: k => MEL_SLOTS.find(s => s.key === k).name,
    pays: 'Venn pays a quarter of each round\'s score on the daily (25 for a perfect round), and half that on past days.',
    canvas: () => [56, 44], cls: () => 'sm',
    paint: (cv, look) => animate(cv, n => melPortrait(look(), { mood: 'smile', blink: n % 14 === 0 }))
  },
  polly: {
    game: 'Polly', noun: 'cockatoo', defaultName: 'Polly', path: 'polly', catalog: POLLY_WARDROBE, key: pollyItemKey, swatch: pollySwatch,
    groups: POLLY_TABS.map(g => ({ key: g.key, name: g.name, slots: g.slots })), slotName: k => POLLY_SLOTS.find(s => s.key === k).name,
    pays: 'Each daily question pays 1 WK Buck for every 7 points, plus 8 for answering all three (50 for a perfect day), and half that on past days.',
    townNote: 'Town decor changes the square for you only.',
    canvas: g => (g === 'town' ? [320, 150] : [56, 44]), cls: g => (g === 'town' ? 'town' : 'sm'),
    paint: (cv, look, g) => {
      if (g === 'town') { clearInterval(portraitTimer); drawTownStill(cv, look(), timeOfDay()); return; }
      animate(cv, n => pollyPortrait(look(), { crest: 'half', blink: n % 16 === 0 }));
    }
  }
};
export const DEFAULT_LOOKS = { skipper: DEFAULT_LOOK, mel: MEL_DEFAULT_LOOK, polly: POLLY_DEFAULT_LOOK };

/** The pet's name, ready for HTML. */
const nameOf = (pet, look) => esc((look && look.name) || PETS[pet].defaultName);

export async function openShop(pet, { api, toast, onChange = () => {} }) {
  const P = PETS[pet];
  openModal(`<div class="shop shop-${pet}"><h2>${nameOf(pet)}'s shop</h2><div class="shimmer">Opening the shop…</div></div>`);
  let w;
  try { w = await api(P.path); } catch (e) { openModal(`<div class="shop shop-${pet}"><h2>Shop</h2><div class="note bad">${esc(e.message)}</div></div>`); return; }
  let group = P.groups[0].key, tab = P.groups[0].slots[0], preview = null, confirming = null;
  const apply = data => { w = data; onChange(data); };
  const owns = (slot, it) => !it.price || w.owned.includes(P.key(slot, it.id));
  const shown = () => (preview ? { ...w.look, ...preview } : w.look);
  const town = () => group === 'town';
  const paint = () => P.paint($('#wardCv'), shown, group);

  const draw = () => {
    const items = P.catalog[tab];
    const list = tab === 'name'
      ? (owns('name', items[0])
        ? `<form class="namebox" id="nameForm"><input class="pin" name="n" maxlength="16" value="${esc(w.look.name)}" aria-label="Name"><button class="btn sm" type="submit">Save name</button></form>
           <p class="sub">Only you see this name.</p>`
        : `<p class="sub">Get the name tag to call your ${P.noun} whatever you like. Only you see the name.</p>
           <div class="witems">${itemHTML('name', items[0])}</div>`)
      : `<div class="witems">${items.map(it => itemHTML(tab, it)).join('')}</div>`;
    const slots = P.groups.find(g => g.key === group).slots;
    const [cw, ch] = P.canvas(group);
    $('#modalBody').innerHTML = `<div class="shop shop-${pet}"><h2>${nameOf(pet, w.look)}'s shop</h2>
      ${P.groups.length > 1 ? `<div class="wtabs big">${P.groups.map(g => `<button type="button" data-group="${g.key}" class="${g.key === group ? 'on' : ''}">${esc(g.key === pet ? w.look.name || g.name : g.name)}</button>`).join('')}</div>` : ''}
      <div class="wtop"><div class="portrait ${P.cls(group)}"><canvas id="wardCv" width="${cw}" height="${ch}"></canvas></div>
        <div><div class="wbal">${bucksIcon()} <b>${w.bucks.balance}</b> WK ${w.bucks.balance === 1 ? 'Buck' : 'Bucks'}</div>
          <p class="sub">${town() ? P.townNote : `${P.pays} WK Bucks work in every game's shop.`}</p></div></div>
      <div class="wtabs">${slots.map(k => `<button type="button" data-wtab="${k}" class="${k === tab ? 'on' : ''}">${esc(P.slotName(k))}</button>`).join('')}</div>
      <div class="msg" id="wmsg"></div>
      ${list}</div>`;
    paint();
    document.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { group = b.dataset.group; tab = P.groups.find(g => g.key === group).slots[0]; preview = null; confirming = null; draw(); });
    document.querySelectorAll('[data-wtab]').forEach(b => b.onclick = () => { tab = b.dataset.wtab; preview = null; confirming = null; draw(); });
    document.querySelectorAll('[data-wid]').forEach(b => {
      const slot = b.dataset.wslot, it = P.catalog[slot].find(x => x.id === b.dataset.wid);
      if (slot !== 'name') {
        // The town is a still picture, so it's redrawn on hover; the pets redraw themselves every frame.
        b.onmouseenter = () => { preview = { [slot]: it.id }; if (town()) paint(); };
        b.onmouseleave = () => { preview = confirming ? preview : null; if (town()) paint(); };
        b.onfocus = b.onmouseenter; b.onblur = b.onmouseleave;
      }
      b.onclick = () => act(slot, it, b);
    });
    const nf = $('#nameForm');
    if (nf) nf.onsubmit = async e => {
      e.preventDefault();
      try { apply(await api(P.path + '/wear', { slot: 'name', name: nf.n.value })); toast(`Say hi to ${w.look.name}!`); draw(); }
      catch (err) { $('#wmsg').innerHTML = `<div class="note bad">${esc(err.message)}</div>`; }
    };
  };

  function itemHTML(slot, it) {
    const own = owns(slot, it), on = slot !== 'name' && w.look[slot] === it.id;
    const asking = confirming === P.key(slot, it.id);
    const label = on ? (town() ? 'In use' : 'Wearing') : own ? (slot === 'name' ? 'Yours' : town() ? 'Use' : 'Wear') : asking ? `Buy for ${bucksAmount(it.price)}?` : bucksAmount(it.price);
    const short = !own && it.price > w.bucks.balance;
    return `<button type="button" class="witem ${on ? 'on' : ''} ${short ? 'short' : ''} ${asking ? 'ask' : ''}" data-wslot="${slot}" data-wid="${it.id}">
      ${P.swatch(slot, it)}<span class="wn">${esc(it.name)}</span><span class="wp">${label}</span></button>`;
  }

  async function act(slot, it, b) {
    const own = owns(slot, it);
    if (slot !== 'name' && w.look[slot] === it.id) return;
    if (!own && it.price > w.bucks.balance) {
      const need = it.price - w.bucks.balance;
      $('#wmsg').innerHTML = `<div class="note warn">You need ${need} more WK ${need === 1 ? 'Buck' : 'Bucks'} for that. Keep playing!</div>`;
      return;
    }
    if (!own && confirming !== P.key(slot, it.id)) {
      confirming = P.key(slot, it.id);
      preview = slot === 'name' ? null : { [slot]: it.id };
      draw();
      return;
    }
    confirming = null;
    b.disabled = true;
    try {
      apply(await api(own ? P.path + '/wear' : P.path + '/buy', { slot, id: it.id }));
      preview = null;
      if (!own) toast(slot === 'name' ? 'Name tag unlocked. Pick a name!' : `${it.name}: yours!`);
      draw();
    } catch (e) { b.disabled = false; $('#wmsg').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
  }
  draw();
}
