// Hand-placed pixel art. Each sprite is a grid of palette letters ('.' = empty),
// rendered to a crisp SVG (horizontal runs merged into single rects).

const C = {
  k: 'var(--px-outline)', b: '#b5733f', d: '#8c5330', l: '#f2cd9b', e: '#26160f', n: '#2a1810', p: '#f39a8d', m: '#b8433a', w: '#fff8ec',
  o: '#f6e2b3', O: '#dcbc80', r: '#d9573b', R: '#a83f2b', y: '#f6b73c', Y: '#d98f1f', g: '#5fae6a', G: '#3f8a4f',
  c: '#e2685a', C: '#b94c40', t: '#c98b4f', T: '#9c6534', q: '#6fa3d8', Q: '#4f7fb8', s: '#ffffff', S: '#ffe9a8', h: '#f3a43a',
  x: '#9aa9b8', X: '#6d7d8d', v: '#7a4fa0', z: '#e9e2f5', i: 'currentColor'
};

const ICONS = {
  help: ['.iiiiii..', 'ii....ii.', '......ii.', '....iii..', '...ii....', '...ii....', '.........', '...ii....', '...ii....'],
  stats: ['.......ii', '.......ii', '....ii.ii', '....ii.ii', '.ii.ii.ii', '.ii.ii.ii', '.ii.ii.ii', '.ii.ii.ii', 'iiiiiiiii'],
  calendar: ['.i.....i.', 'iiiiiiiii', 'iiiiiiiii', 'i.......i', 'i.i.i.i.i', 'i.......i', 'i.i.i.i.i', 'i.......i', 'iiiiiiiii'],
  pad: ['.iiiiiii.', 'ii.....i.', '.i.iii.i.', 'ii.....i.', '.i.iii.i.', 'ii.....i.', '.i.ii..i.', 'ii.....i.', '.iiiiiii.'],
  user: ['...iii...', '..iiiii..', '..iiiii..', '...iii...', '.........', '.iiiiiii.', 'iiiiiiiii', 'iiiiiiiii', 'iiiiiiiii'],
  close: ['ii.....ii', '.ii...ii.', '..ii.ii..', '...iii...', '...iii...', '..ii.ii..', '.ii...ii.', 'ii.....ii', '.........'],
  flag: ['ii.......', 'iiiiii...', 'iiiiiiii.', 'iiiiii...', 'ii.......', 'ii.......', 'ii.......', 'ii.......', 'ii.......']
};
export const icon = name => svg(ICONS[name], { px: 2, cls: 'icon-px' });

// 16 x 17 bear cub. Rows 6–7 are eyes, rows 10–11 the mouth; faces swap those rows.
const BEAR_BASE = [
  '..kkk......kkk..',
  '.kbllk....kllbk.',
  '.kbllkkkkkkllbk.',
  '.kbbbbbbbbbbbbk.',
  'kbbbbbbbbbbbbbbk',
  'kbbbbbbbbbbbbbbk',
  'kbbbebbbbbbebbbk',
  'kbbbebbbbbbebbbk',
  'kbpbbbllllbbbpbk',
  'kbbbbllnnllbbbbk',
  'kbbbbllllllbbbbk',
  '.kbbbbllllbbbbk.',
  '..kkbbbbbbbbkk..',
  '..kbbbbbbbbbbk..',
  '.kbdbllllllbdbk.',
  '.kbdbllllllbdbk.',
  '..kkkkkkkkkkkk..'
];

const FACES = {
  neutral: { 10: 'kbbbbllkkllbbbbk' },
  happy:   { 6: 'kbbbbbbbbbbbbbbk', 7: 'kbbebebbbbebebbk', 10: 'kbbbblkllklbbbbk', 11: '.kbbbblkklbbbbk.' },
  smile:   { 10: 'kbbbblkllklbbbbk', 11: '.kbbbblkklbbbbk.' },
  wow:     { 6: 'kbbkekbbbbkekbbk', 7: 'kbbbebbbbbbebbbk', 10: 'kbbbblkmmklbbbbk', 11: '.kbbbblkklbbbbk.' },
  sad:     { 10: 'kbbbbllkkllbbbbk', 11: '.kbbbbkllkbbbbk.' },
  dizzy:   { 6: 'kbbebebbbbebebbk', 7: 'kbbbebbbbbbebbbk', 10: 'kbbbbllkkllbbbbk', 11: '.kbbbbkllkbbbbk.' },
  think:   { 6: 'kbbbbbbbbbbbbbbk', 7: 'kbbbebbbbbbebbbk', 10: 'kbbbbllllkkbbbbk' }
};

export function bearGrid(face = 'neutral') {
  const f = FACES[face] || FACES.neutral;
  return BEAR_BASE.map((row, i) => f[i] || row);
}

const BOWL = [
  '..kkkkkkkkkk..',
  '.kooooOooooook',
  'kooOoooooOoook',
  'krrrrrrrrrrrrk',
  'krrwrrrrrrrrRk',
  '.krwrrrrrrrRk.',
  '..krrrrrrrRk..',
  '...kkkkkkkk...'
];
const CHAIR = [
  '.kkkkkkkk.',
  '.kttttttk.',
  '.ktkkkktk.',
  '.ktk..ktk.',
  '.ktkkkktk.',
  '.kttttttk.',
  '.ktk..ktk.',
  'kkkkkkkkkk',
  'kccccccCck',
  'ktttttttTk',
  'kkkkkkkkkk',
  '.ktk..ktk.',
  '.ktk..ktk.',
  '.kkk..kkk.'
];
const BED = [
  'kkkk..............',
  'kttk..............',
  'kttk..........kkkk',
  'kttkkkkkkkkkkkkttk',
  'kttkwwwwkqqQqqkttk',
  'kttkwwwwkqQqqQkttk',
  'kttkkkkkkkkkkkkttk',
  'ktttttttttttttttTk',
  'ktkkkkkkkkkkkkkktk',
  'kkk............kkk'
];
const SUN = [
  '...y..y...',
  '.y.yyyy.y.',
  '..yhhhhy..',
  'yyhhhhhhyy',
  '.yhhhhhhy.',
  '.yhhhhhhy.',
  'yyhhhhhhyy',
  '..yhhhhy..',
  '.y.yyyy.y.',
  '...y..y...'
];
const MOON = [
  '..zzzz..',
  '.zzzz...',
  'zzzz....',
  'zzz.....',
  'zzz.....',
  'zzzz....',
  '.zzzzz..',
  '..zzzzz.'
];
const STAR = ['.s.', 'sSs', '.s.'];
const HEART = ['.kk.kk.', 'kcckcck', 'kccccck', '.kccck.', '..kck..', '...k...'];
const SPARK = ['..S..', '..S..', 'SSsSS', '..S..', '..S..'];
const JAR = [
  '..kkkkkkkk..',
  '..kTTTTTTk..',
  '.kkkkkkkkkk.',
  'k..........k',
  'k..........k',
  'k..........k',
  'k..........k',
  'k..........k',
  'k..........k',
  'k..........k',
  '.k........k.',
  '..kkkkkkkk..'
];
const PLANT = [
  '..g.g..',
  '.gGgGg.',
  'gGgGgGg',
  '.gGgGg.',
  '..kkk..',
  '.krrrk.',
  '.krrrk.',
  '..kkk..'
];
const QMARK = [
  '.kkkk.',
  'kSSSSk',
  'kSkkSk',
  'kkkSSk',
  '..kSk.',
  '..kkk.',
  '..kSk.',
  '..kkk.'
];

export const GRIDS = { bowl: BOWL, chair: CHAIR, bed: BED, sun: SUN, moon: MOON, star: STAR, heart: HEART, spark: SPARK, jar: JAR, plant: PLANT, qmark: QMARK };

/** Renders a grid as an SVG string. px = size of one pixel in CSS px. */
export function svg(grid, { px = 4, cls = '', title = '' } = {}) {
  const h = grid.length, w = Math.max(...grid.map(r => r.length));
  let rects = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !C[ch]) { x++; continue; }
      let run = 1;
      while (row[x + run] === ch) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${C[ch]}"/>`;
      x += run;
    }
  });
  const size = px ? `width="${w * px}" height="${h * px}"` : '';
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" ${size} shape-rendering="crispEdges" ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}>${rects}</svg>`;
}

export const bear = (face, opts = {}) => svg(bearGrid(face), { px: 5, title: 'Bear cub', ...opts });
export const item = (name, opts = {}) => svg(GRIDS[name], opts);

/** Honey jar that fills to `pct` (0..1). */
export function honeyJar(pct, px = 6) {
  const fillRows = Math.round(Math.max(0, Math.min(1, pct)) * 8);
  const g = JAR.map((row, y) => {
    if (y < 3 || y > 10) return row;
    const fromBottom = 10 - y; // 0..7
    if (fromBottom < fillRows) return row.replace(/\./g, (m, i) => (i > 0 && i < row.length - 1 && row[i] === '.') ? (fromBottom === fillRows - 1 ? 'h' : 'y') : m);
    return row;
  });
  return svg(g, { px, cls: 'jar', title: `Honey jar ${Math.round(pct * 100)}% full` });
}

export function favicon() {
  return svg(bearGrid('smile'), { px: 1 });
}
