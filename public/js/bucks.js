// WK Bucks: the one currency for every game in the suite. The symbol is a pixel W with a single
// bar through its middle (the way $ is an S with a line through it), drawn on a 9×9 grid.

const W = [
  '.........',
  '.X.....X.',
  '.X.....X.',
  '.X..X..X.',
  'XXXXXXXXX',
  '.X.X.X.X.',
  '.XX...XX.',
  '.X.....X.',
  '.........'
];

let rects = '';
W.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));

/** The glyph as an inline SVG string. `size` is in CSS pixels (default 1em). */
export function bucksIcon(size) {
  const dim = size ? `width="${size}" height="${size}"` : 'width="1em" height="1em"';
  return `<svg class="wkb" viewBox="0 0 9 9" ${dim} shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="WK Bucks" style="vertical-align:-0.12em">${rects}</svg>`;
}

/** "<glyph> 120" */
export function bucksAmount(n, size) {
  return `<span class="wkb-amt">${bucksIcon(size)}&nbsp;${Number(n || 0).toLocaleString('en-US')}</span>`;
}
