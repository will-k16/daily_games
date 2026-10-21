// The pet corner page: loads the three looks and shows them together in one meadow.
import { createPetsScene } from './pets-scene.js';
import { DEFAULT_LOOK } from './wardrobe.js';
import { MEL_DEFAULT_LOOK } from './mel-wardrobe.js';
import { POLLY_DEFAULT_LOOK } from './polly-wardrobe.js';

const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

let looks = { skipper: DEFAULT_LOOK, mel: MEL_DEFAULT_LOOK, polly: POLLY_DEFAULT_LOOK };
try {
  const res = await fetch('/api/suite/today', { credentials: 'same-origin' });
  const d = await res.json();
  if (d.pets) looks = { skipper: { ...DEFAULT_LOOK, ...d.pets.skipper }, mel: { ...MEL_DEFAULT_LOOK, ...d.pets.mel }, polly: { ...POLLY_DEFAULT_LOOK, ...d.pets.polly } };
} catch { /* the default outfits still make a nice picture */ }

const host = $('#petsHost');
host.innerHTML = '';
const scene = createPetsScene(host, looks, { reduced });
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
