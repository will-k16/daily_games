import { PROPS } from './props.js';

// Unit factors convert to each dimension's base unit (the same base units the game stores).
export const DIMS = {
  mass:   { name: 'Weight',  units: [['mg', 1e-6], ['g', 1e-3], ['kg', 1], ['t', 1000, 'tonnes'], ['oz', 0.0283495], ['lb', 0.453592], ['ton', 907.185, 'US tons']] },
  length: { name: 'Length',  units: [['mm', 1e-3], ['cm', 0.01], ['m', 1], ['km', 1000], ['in', 0.0254], ['ft', 0.3048], ['yd', 0.9144], ['mi', 1609.344]] },
  area:   { name: 'Area',    units: [['cm²', 1e-4], ['m²', 1], ['ha', 1e4, 'hectares'], ['km²', 1e6], ['in²', 0.00064516], ['ft²', 0.092903], ['acre', 4046.86, 'acres'], ['mi²', 2.58999e6]] },
  volume: { name: 'Volume',  units: [['mL', 1e-3], ['L', 1], ['m³', 1000], ['tsp', 0.00492892], ['tbsp', 0.0147868], ['fl oz', 0.0295735], ['cup', 0.236588, 'cups'], ['gal', 3.78541, 'gallons']] },
  time:   { name: 'Time',    units: [['ms', 1e-3], ['sec', 1], ['min', 60], ['hr', 3600], ['day', 86400, 'days'], ['week', 604800, 'weeks'], ['year', 31557600, 'years'], ['century', 3.15576e9, 'centuries']] },
  speed:  { name: 'Speed',   units: [['m/s', 1], ['km/h', 1 / 3.6], ['mph', 0.44704], ['knot', 0.514444, 'knots']] },
  energy: { name: 'Energy',  units: [['Cal', 1, 'food Calories'], ['kJ', 0.239006]] },
  power:  { name: 'Power',   units: [['W', 1], ['kW', 1e3], ['MW', 1e6], ['GW', 1e9], ['hp', 745.7, 'horsepower']] },
  data:   { name: 'Data',    units: [['B', 1, 'bytes'], ['KB', 1e3], ['MB', 1e6], ['GB', 1e9], ['TB', 1e12], ['PB', 1e15]] },
  money:  { name: 'Money',   units: [['$', 1, 'US dollars']] },
  count:  { name: 'Count',   units: [['×1', 1, 'plain count'], ['thousand', 1e3], ['million', 1e6], ['billion', 1e9]] }
};

/** Which pad dimension a property uses, and the factor from that dimension's base to the property's base. */
export function propDim(property) {
  const p = PROPS[property];
  if (!p) return { dim: 'count', toBase: 1 };
  if (p.dim === 'time_y') return { dim: 'time', toBase: 31557600 };
  return { dim: p.dim, toBase: 1 };
}

export function unitFactor(dim, id) {
  const u = (DIMS[dim] || DIMS.count).units.find(x => x[0] === id);
  return u ? u[1] : 1;
}
export function convert(v, dim, from, to) { return v * unitFactor(dim, from) / unitFactor(dim, to); }

/** A sensible default unit for a dimension in the chosen system. */
export function defaultUnit(dim, system) {
  const us = system === 'imperial';
  return ({ mass: us ? 'lb' : 'kg', length: us ? 'ft' : 'm', area: us ? 'ft²' : 'm²', volume: us ? 'gal' : 'L', time: 'min',
    speed: us ? 'mph' : 'km/h', energy: 'Cal', power: 'W', data: 'MB', money: '$', count: '×1' })[dim] || DIMS[dim].units[0][0];
}

/** Parses "1,200", "3e6", "12k", "1.5 million", "2 billion" into a number (NaN if it can't). */
export function parseNum(s) {
  let t = String(s == null ? '' : s).trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!t) return NaN;
  const m = t.match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*(k|thousand|m|mil|million|b|bn|billion|t|tn|trillion)?$/);
  if (!m) return NaN;
  const mult = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12 }[m[2]] || 1;
  return parseFloat(m[1]) * mult;
}

/* ───────────── Display formatting ───────────── */

export function sig(n) {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) < 0.001) return n.toExponential(1);
  return Number(n.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}
export function nice(n) {
  const a = Math.abs(n);
  if (a >= 1e15) return n.toExponential(2).replace('e+', ' × 10^');
  if (a >= 1e12) return sig(n / 1e12) + ' trillion';
  if (a >= 1e9) return sig(n / 1e9) + ' billion';
  if (a >= 1e6) return sig(n / 1e6) + ' million';
  return sig(n);
}
function dur(s) {
  if (s < 1) return nice(s * 1000) + ' ms';
  if (s < 60) return nice(s) + ' sec';
  if (s < 3600) return nice(s / 60) + ' min';
  if (s < 86400) return nice(s / 3600) + ' hr';
  if (s < 31557600) return nice(s / 86400) + ' days';
  return nice(s / 31557600) + ' years';
}

/** Formats a stored value (property base unit) for people. system: 'imperial' | 'metric'. */
export function fmt(prop, v, unitLabel, system) {
  const imp = system === 'imperial';
  v = Number(v);
  switch (prop) {
    case 'weight': {
      if (imp) { const lb = v * 2.20462; if (lb < 1) return nice(lb * 16) + ' oz'; if (lb < 4000) return nice(lb) + ' lb'; return nice(lb / 2000) + ' tons'; }
      if (v < 0.001) return nice(v * 1e6) + ' mg'; if (v < 1) return nice(v * 1000) + ' g'; if (v < 1000) return nice(v) + ' kg'; return nice(v / 1000) + ' tonnes';
    }
    case 'length': case 'height': case 'distance': case 'depth': {
      if (imp) { const ft = v * 3.28084; if (ft < 1) return nice(ft * 12) + ' in'; if (ft < 5280) return nice(ft) + ' ft'; return nice(ft / 5280) + ' mi'; }
      if (v < 0.01) return nice(v * 1000) + ' mm'; if (v < 1) return nice(v * 100) + ' cm'; if (v < 1000) return nice(v) + ' m'; return nice(v / 1000) + ' km';
    }
    case 'area': {
      if (imp) { const sf = v * 10.7639; if (sf < 1) return nice(sf * 144) + ' sq in'; if (sf < 43560) return nice(sf) + ' sq ft'; const ac = sf / 43560; if (ac < 640) return nice(ac) + ' acres'; return nice(ac / 640) + ' sq mi'; }
      if (v < 1) return nice(v * 1e4) + ' cm²'; if (v < 1e4) return nice(v) + ' m²'; if (v < 1e6) return nice(v / 1e4) + ' hectares'; return nice(v / 1e6) + ' km²';
    }
    case 'volume': {
      if (imp) { const oz = v * 33.814; if (oz < 1) return nice(oz * 6) + ' tsp'; if (oz < 128) return nice(oz) + ' fl oz'; return nice(oz / 128) + ' gallons'; }
      if (v < 1) return nice(v * 1000) + ' mL'; if (v < 1000) return nice(v) + ' L'; return nice(v / 1000) + ' m³';
    }
    case 'speed': return imp ? nice(v * 2.23694) + ' mph' : nice(v * 3.6) + ' km/h';
    case 'duration': case 'build': return dur(v);
    case 'age': case 'lifespan': return dur(v * 31557600);
    case 'population': case 'capacity': return nice(v) + ' people';
    case 'price': return '$' + nice(v);
    case 'calories': return nice(v) + ' Cal';
    case 'power': {
      if (imp && v >= 745.7 && v < 1e6) return nice(v / 745.7) + ' hp';
      if (v < 1e3) return nice(v) + ' W'; if (v < 1e6) return nice(v / 1e3) + ' kW'; if (v < 1e9) return nice(v / 1e6) + ' MW'; return nice(v / 1e9) + ' GW';
    }
    case 'data': {
      if (v < 1e3) return nice(v) + ' bytes'; if (v < 1e6) return nice(v / 1e3) + ' KB'; if (v < 1e9) return nice(v / 1e6) + ' MB';
      if (v < 1e12) return nice(v / 1e9) + ' GB'; return nice(v / 1e12) + ' TB';
    }
    case 'words': return nice(v) + ' words';
    case 'copies': return nice(v) + ' copies';
    default: return nice(v) + (unitLabel ? ' ' + unitLabel : '');
  }
}

/** Plain number for inputs (no grouping, up to 6 significant digits). */
export function plain(v) {
  if (!isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e12 || a < 1e-4)) return v.toExponential(3);
  return String(Number(v.toPrecision(6)));
}
