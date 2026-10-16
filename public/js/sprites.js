// Tiny pixel icons (used by the notebook).
const ICONS = {
  close: ['ii.....ii', '.ii...ii.', '..ii.ii..', '...iii...', '...iii...', '..ii.ii..', '.ii...ii.', 'ii.....ii', '.........']
};

function svg(grid) {
  const h = grid.length, w = Math.max(...grid.map(r => r.length));
  let rects = '';
  grid.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'i') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="currentColor"/>`; }));
  return `<svg class="px icon-px" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export const icon = name => svg(ICONS[name]);
