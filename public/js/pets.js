// The pet corner page: loads the four looks and shows them together in one meadow, with each pet's
// shop one tap away. Whatever you buy or put on shows up in the meadow straight away. "Help your pets!"
// introduces the real animals behind them, with a link to a group working to save each one.
import { createPetsScene } from './pets-scene.js';
import { openShop, DEFAULT_LOOKS } from './shop.js';
import { bucksIcon } from './bucks.js';
import { skipperPortrait } from './pixel.js';
import { melPortrait } from './mel.js';
import { pollyPortrait } from './polly-sprites.js';
import { racePortrait } from './race.js';
import { openModal } from './modal.js';
import { api } from './net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

// Left to right, the way they sit in the meadow, each with the game that pays for it.
const SHOPS = [
  { pet: 'mel', game: 'Venn', kind: 'chameleon', pic: l => melPortrait(l, { mood: 'smile' }) },
  { pet: 'skipper', game: 'Summit', kind: 'goat', pic: l => skipperPortrait('smile', false, 0, l) },
  { pet: 'polly', game: 'Polly', kind: 'cockatoo', pic: l => pollyPortrait(l, {}) },
  { pet: 'race', game: 'Lifeline', kind: 'jerboa', pic: l => racePortrait(l, {}) }
];

// The real animals. Statuses are the IUCN Red List's; photos are from Wikimedia Commons (credited on the card).
const WILD = [
  { pet: 'mel', species: 'Chapman\'s pygmy chameleon', latin: 'Rhampholeon chapmanorum', status: 'Critically Endangered', cls: 'cr',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Cameroon_Stumptail_Chameleon_%28Rhampholeon_spectrum%29_%287668008064%29.jpg/500px-Cameroon_Stumptail_Chameleon_%28Rhampholeon_spectrum%29_%287668008064%29.jpg',
    credit: 'A close cousin, the spectral pygmy chameleon (no free photo of Chapman\'s exists yet). Photo: Bernard Dupont, CC BY-SA 2.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Cameroon_Stumptail_Chameleon_(Rhampholeon_spectrum)_(7668008064).jpg',
    fact: 'A chameleon about 5 cm long that lives only in a few forest patches in the Malawi Hills. About 80% of its forest has been cleared since the 1980s.',
    org: 'BINCO\'s Matandwe forest project', url: 'https://binco.eu/projects/malawi/matandwe-forest-reserve/' },
  { pet: 'skipper', species: 'Walia ibex', latin: 'Capra walie', status: 'Critically Endangered', cls: 'cr',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Walia_ibex_3.jpg/500px-Walia_ibex_3.jpg',
    credit: 'Photo: Leonard A. Floyd, CC0', creditUrl: 'https://commons.wikimedia.org/wiki/File:Walia_ibex_3.jpg',
    fact: 'A mountain goat found only in Ethiopia\'s Simien Mountains. Counts fell from about 865 in 2015 to roughly 270 in 2025.',
    org: 'African Wildlife Foundation (works in Simien Mountains National Park)', url: 'https://www.awf.org/donate' },
  { pet: 'polly', species: 'Yellow-crested cockatoo', latin: 'Cacatua sulphurea', status: 'Critically Endangered', cls: 'cr',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Cacatua_sulphurea_330278728_%28centered%29.jpg/500px-Cacatua_sulphurea_330278728_%28centered%29.jpg',
    credit: 'Photo: Kalvin Chan, CC BY 4.0', creditUrl: 'https://commons.wikimedia.org/wiki/File:Cacatua_sulphurea_330278728_(centered).jpg',
    fact: 'Trapping for the pet trade has left fewer than about 2,000 in the wild, on islands in Indonesia and Timor-Leste.',
    org: 'World Parrot Trust\'s yellow-crested cockatoo project', url: 'https://parrots.org/projects/yellow-crested-cockatoo/' },
  { pet: 'race', species: 'Long-eared jerboa', latin: 'Euchoreutes naso', status: 'Vulnerable in Mongolia', cls: 'vu',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Euchoreutes_naso.jpg/500px-Euchoreutes_naso.jpg',
    credit: 'Illustration: Joseph Smit, public domain', creditUrl: 'https://commons.wikimedia.org/wiki/File:Euchoreutes_naso.jpg',
    fact: 'A desert hopper of the Gobi with ears a third of its body length. Listed as Least Concern worldwide, but Vulnerable in Mongolia, and an EDGE species: one of the most unusual mammals on Earth.',
    org: 'ZSL\'s EDGE of Existence programme', url: 'https://donate.zsl.org/edge-of-existence/' }
];

function showHelp() {
  const card = w => {
    const name = esc(looks[w.pet].name || DEFAULT_LOOKS[w.pet].name);
    return `<article class="wild">
      <div class="wild-pics"><span class="wild-pet"></span><img src="${w.img}" alt="${esc(w.species)}" loading="lazy"></div>
      <h3>${name} → ${esc(w.species)}</h3>
      <p class="wild-latin"><i>${esc(w.latin)}</i> <span class="wild-st ${w.cls}">${esc(w.status)}</span></p>
      <p class="wild-fact">${esc(w.fact)}</p>
      <p class="wild-org">Helping them: <b>${esc(w.org)}</b></p>
      <a class="btn sm wild-give" href="${w.url}" target="_blank" rel="noopener">Donate ↗</a>
      <p class="wild-credit"><a href="${w.creditUrl}" target="_blank" rel="noopener">${esc(w.credit)}</a></p>
    </article>`;
  };
  openModal(`<div class="wildwrap"><h2>Help your pets!</h2>
    <p class="sub">Each pet is based on a real animal, and three of them are critically endangered. These groups are working to protect them in the wild.</p>
    <div class="wildgrid">${WILD.map(card).join('')}</div>
    <p class="sub">Links go to each group's own site. WK Game Suite isn't connected to them and gets nothing from donations.</p></div>`);
  document.querySelectorAll('.wild-pet').forEach((el, i) => {
    const s = SHOPS.find(x => x.pet === WILD[i].pet), c = s.pic(looks[s.pet]);
    c.className = 'petpic'; el.appendChild(c);
  });
}
$('#helpPets').onclick = showHelp;

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
