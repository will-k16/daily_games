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
  { pet: 'race', game: 'Life-Line', kind: 'jerboa', pic: l => racePortrait(l, {}) }
];

// The real animals. Statuses are the IUCN Red List's; photos are from Wikimedia Commons (credited under each photo).
const WILD = [
  { pet: 'mel', species: 'Chapman\'s pygmy chameleon', where: 'Malawi', status: 'Critically endangered', cls: 'cr',
    stat: '80%', statLabel: 'of its forest home is gone', line: 'A chameleon smaller than your thumb, found in just a few patches of forest in the Malawi Hills.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Cameroon_Stumptail_Chameleon_%28Rhampholeon_spectrum%29_%287668008064%29.jpg/500px-Cameroon_Stumptail_Chameleon_%28Rhampholeon_spectrum%29_%287668008064%29.jpg',
    credit: 'Pictured: a close cousin (no free photo of Chapman\'s exists yet). Bernard Dupont, CC BY-SA 2.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Cameroon_Stumptail_Chameleon_(Rhampholeon_spectrum)_(7668008064).jpg',
    org: 'BINCO', url: 'https://binco.eu/projects/malawi/matandwe-forest-reserve/' },
  { pet: 'skipper', species: 'Walia ibex', where: 'Ethiopia', status: 'Critically endangered', cls: 'cr',
    stat: '≈270', statLabel: 'left in the wild', line: 'A cliff-climbing goat that lives only in Ethiopia\'s Simien Mountains.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Walia_ibex_3.jpg/500px-Walia_ibex_3.jpg',
    credit: 'Leonard A. Floyd, CC0', creditUrl: 'https://commons.wikimedia.org/wiki/File:Walia_ibex_3.jpg',
    org: 'African Wildlife Foundation', url: 'https://www.awf.org/donate' },
  { pet: 'polly', species: 'Yellow-crested cockatoo', where: 'Indonesia & Timor-Leste', status: 'Critically endangered', cls: 'cr',
    stat: '<2,000', statLabel: 'left in the wild', line: 'Trapped for the pet trade until only a few island flocks were left.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Cacatua_sulphurea_330278728_%28centered%29.jpg/500px-Cacatua_sulphurea_330278728_%28centered%29.jpg',
    credit: 'Kalvin Chan, CC BY 4.0', creditUrl: 'https://commons.wikimedia.org/wiki/File:Cacatua_sulphurea_330278728_(centered).jpg',
    org: 'World Parrot Trust', url: 'https://parrots.org/projects/yellow-crested-cockatoo/' },
  { pet: 'race', species: 'Long-eared jerboa', where: 'Gobi Desert', status: 'Vulnerable in Mongolia', cls: 'vu',
    stat: '1 of 1', statLabel: 'the last of its whole subfamily', line: "The IUCN doesn't list it as endangered worldwide, but it's under real pressure across its range and rated Vulnerable in Mongolia.",
    note: "Why it matters: the EDGE of Existence programme makes it a priority because it's the only member of its entire evolutionary subfamily. If it goes extinct, that whole branch of the tree of life is gone forever.",
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Euchoreutes_naso.jpg/500px-Euchoreutes_naso.jpg',
    credit: 'Joseph Smit, public domain', creditUrl: 'https://commons.wikimedia.org/wiki/File:Euchoreutes_naso.jpg',
    org: 'ZSL EDGE of Existence', url: 'https://donate.zsl.org/edge-of-existence/' }
];

/** "Help your pets!": one real animal at a time, picked from the four pets along the top. */
function showHelp(start = 0) {
  let at = start;
  const petName = w => esc(looks[w.pet].name || DEFAULT_LOOKS[w.pet].name);
  openModal(`<div class="wildwrap"><h2>Help your pets!</h2>
    <p class="wild-intro">Every pet here has a real cousin in the wild, and <b>3 of the 4</b> are critically endangered.</p>
    <div class="wild-tabs" role="tablist">${WILD.map((w, i) => `<button type="button" role="tab" data-w="${i}"><span class="wild-tabpic"></span><b>${petName(w)}</b></button>`).join('')}</div>
    <div id="wildCard"></div>
    <p class="wild-foot">Donations go straight to each group. WK Game Suite isn't connected to them and gets nothing.</p></div>`);
  document.querySelectorAll('.wild-tabpic').forEach((el, i) => {
    const s = SHOPS.find(x => x.pet === WILD[i].pet), c = s.pic(looks[s.pet]);
    c.className = 'petpic'; el.appendChild(c);
  });
  const show = i => {
    at = (i + WILD.length) % WILD.length;
    const w = WILD[at];
    document.querySelectorAll('[data-w]').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.w) === at)));
    $('#wildCard').innerHTML = `<article class="wild">
      <figure class="wild-photo"><img src="${w.img}" alt="${esc(w.species)}"><span class="wild-st ${w.cls}">${esc(w.status)}</span>
        <figcaption><a href="${w.creditUrl}" target="_blank" rel="noopener">${esc(w.credit)}</a></figcaption></figure>
      <div class="wild-body">
        <p class="wild-kicker">${petName(w)}'s wild cousin · ${esc(w.where)}</p>
        <h3>${esc(w.species)}</h3>
        <p class="wild-stat"><b>${esc(w.stat)}</b><span>${esc(w.statLabel)}</span></p>
        <p class="wild-line">${esc(w.line)}</p>
        ${w.note ? `<p class="wild-note">${esc(w.note)}</p>` : ''}
        <a class="btn wild-give" href="${w.url}" target="_blank" rel="noopener">♥ Help with ${esc(w.org)} ↗</a>
        <button class="link wild-next" type="button" id="wildNext">Meet ${petName(WILD[(at + 1) % WILD.length])}'s cousin →</button>
      </div></article>`;
    $('#wildNext').onclick = () => show(at + 1);
  };
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => show(Number(b.dataset.w)));
  show(at);
}
$('#helpPets').onclick = () => showHelp(0);

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
