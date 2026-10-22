// The pet corner page: loads the three looks and shows them together in one meadow, with each pet's
// shop one tap away. Whatever you buy or put on shows up in the meadow straight away.
import { createPetsScene } from './pets-scene.js';
import { openShop, DEFAULT_LOOKS } from './shop.js';
import { bucksIcon } from './bucks.js';
import { skipperPortrait } from './pixel.js';
import { melPortrait } from './mel.js';
import { pollyPortrait } from './polly-sprites.js';
import { api } from './net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

// Left to right, the way they sit in the meadow, each with the game that pays for it.
const SHOPS = [
  { pet: 'mel', game: 'Venn', kind: 'chameleon', pic: l => melPortrait(l, { mood: 'smile' }) },
  { pet: 'skipper', game: 'Summit', kind: 'goat', pic: l => skipperPortrait('smile', false, 0, l) },
  { pet: 'polly', game: 'Polly', kind: 'cockatoo', pic: l => pollyPortrait(l, {}) }
];

let looks = { ...DEFAULT_LOOKS };
let bucks = null;
try {
  const d = await api('suite/today');
  if (d.pets) looks = Object.fromEntries(Object.keys(DEFAULT_LOOKS).map(k => [k, { ...DEFAULT_LOOKS[k], ...d.pets[k] }]));
  bucks = d.bucks;
} catch { /* the default outfits still make a nice picture */ }

const host = $('#petsHost');
host.innerHTML = '';
const scene = createPetsScene(host, looks, { reduced });

function paintBucks() {
  $('#bucks').hidden = !bucks;
  if (bucks) $('#bucks').innerHTML = `${bucksIcon()} <b>${bucks.balance.toLocaleString('en-US')}</b>`;
}

function paintShops() {
  const box = $('#petShops');
  box.innerHTML = SHOPS.map(s => `<button class="petshop" type="button" data-pet="${s.pet}">
      <span class="petshop-pic"></span>
      <span class="petwords"><b>${esc(looks[s.pet].name || DEFAULT_LOOKS[s.pet].name)}'s shop</b><small>The ${s.kind} from ${s.game}</small></span></button>`).join('');
  SHOPS.forEach(s => {
    const btn = box.querySelector(`[data-pet="${s.pet}"]`);
    const c = s.pic(looks[s.pet]); c.className = 'petpic';
    btn.querySelector('.petshop-pic').appendChild(c);
    btn.onclick = () => openShop(s.pet, { api, toast, onChange: data => {
      looks = { ...looks, [s.pet]: { ...DEFAULT_LOOKS[s.pet], ...data.look } };
      bucks = data.bucks;
      scene.setLooks(looks);
      paintBucks(); paintShops();
    } });
  });
}
paintBucks();
paintShops();

const btn = $('#savePic');
btn.disabled = false;
btn.onclick = () => {
  scene.snapshot(6).toBlob(blob => {
    if (!blob) { toast('Couldn\'t make the picture. A screenshot works too!'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wk-pets.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
};
