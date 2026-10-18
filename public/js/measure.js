// Keeps measurements out of the game: a puzzle end like "a 5-kilometer race" gives the value away,
// and so does an answer like "a 5 km race" or "a gallon of milk" (for volume). Shared by browser + API.

const NUMWORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|dozen|half|quarter|single|double|triple';

// Full unit words: for the puzzle's own kind of unit these are banned anywhere ("a gallon of milk" for volume).
const WORDS = {
  length: ['millimeters?', 'millimetres?', 'centimeters?', 'centimetres?', 'meters?', 'metres?', 'kilometers?', 'kilometres?', 'inch(es)?', 'foot', 'feet', 'yards?', 'miles?', 'light[- ]years?', 'leagues?', 'furlongs?'],
  mass: ['milligrams?', 'grams?', 'kilograms?', 'kilos?', 'pounds?', 'ounces?', 'tons?', 'tonnes?'],
  volume: ['milliliters?', 'millilitres?', 'liters?', 'litres?', 'gallons?', 'quarts?', 'pints?', 'cups?', 'fluid ounces?', 'teaspoons?', 'tablespoons?', 'barrels?', 'cubic'],
  time: ['milliseconds?', 'seconds?', 'minutes?', 'hours?', 'days?', 'weeks?', 'months?', 'years?', 'decades?', 'century', 'centuries', 'millenni(um|a)', 'fortnights?'],
  speed: ['miles per hour', 'kilometers per hour', 'knots?', 'mach'],
  money: ['dollars?', 'cents?', 'bucks?', 'pennies', 'grand', 'euros?'],
  energy: ['calories?', 'kilocalories?', 'kilojoules?', 'joules?'],
  power: ['watts?', 'kilowatts?', 'megawatts?', 'gigawatts?', 'horsepower'],
  data: ['bytes?', 'kilobytes?', 'megabytes?', 'gigabytes?', 'terabytes?', 'petabytes?', 'bits?'],
  area: ['acres?', 'hectares?', 'square (feet|foot|meters?|metres?|miles?|kilometers?|inch(es)?|yards?)'],
  count: []
};
// Short abbreviations only count right after a number ("5 km", "10-lb").
const ABBR = {
  length: ['mm', 'cm', 'm', 'km', 'k', 'in', 'ft', 'yd', 'mi'],
  mass: ['mg', 'g', 'kg', 'lb', 'lbs', 'oz', 't'],
  volume: ['ml', 'l', 'gal', 'qt', 'pt', 'tsp', 'tbsp', 'oz'],
  time: ['ms', 'sec', 'secs', 'min', 'mins', 'h', 'hr', 'hrs', 'yr', 'yrs'],
  speed: ['mph', 'kph', 'km/h', 'kmh', 'm/s', 'kts'],
  money: ['k', 'usd'],
  energy: ['cal', 'kcal', 'kj'],
  power: ['w', 'kw', 'mw', 'gw', 'hp'],
  data: ['b', 'kb', 'mb', 'gb', 'tb', 'pb'],
  area: ['sq', 'ha'],
  count: []
};
// Counting words only give the value away for their own kind of puzzle ("a 50-seat bus" for capacity, "a 10-story building" for height).
const DIM_COUNTERS = {
  count: ['person', 'people', 'seats?', 'seater', 'pages?', 'words?', 'pieces?', 'pack', 'copies', 'residents'],
  length: ['story', 'stories', 'storeys?', 'floors?']
};
/**
 * A number with a unit is only unfair when it hints at the puzzle's own value. "An 8-year-old child" is
 * fine for height (it says nothing about height), but "a 6-foot man" isn't, and neither is "a 2-liter
 * bottle" for weight, because volume pretty much tells you the weight. Each kind lists what gives it away.
 */
const GIVES_AWAY = {
  length: ['length', 'area'], area: ['area', 'length'],
  mass: ['mass', 'volume'], volume: ['volume', 'mass', 'length'],
  time: ['time', 'length'], speed: ['speed'], money: ['money'],
  energy: ['energy', 'mass', 'volume'], power: ['power'], data: ['data', 'time'], count: ['count']
};

const ALL_WORDS = Object.values(WORDS).flat();
const NUM = `(?:\\$?\\d[\\d,.]*|\\b(?:${NUMWORDS})\\b)`;
const esc = a => a.replace(/[/.]/g, '\\$&');
const numUnitCache = {};
const numUnit = dim => numUnitCache[dim] || (numUnitCache[dim] = (() => {
  const kinds = GIVES_AWAY[dim] || [dim];
  const units = [...new Set(kinds.flatMap(k => [...(WORDS[k] || []), ...(ABBR[k] || []).map(esc), ...(DIM_COUNTERS[k] || [])]))];
  return units.length ? new RegExp(`${NUM}\\s*-?\\s*(?:${units.join('|')})\\b`, 'i') : null;
})());
const DOLLAR_NUM = /\$\s*\d/;

export function dimOf(dim) { return dim === 'time_y' ? 'time' : dim; }

/** For a player's answer. Returns a friendly reason, or '' if it's fine. */
export function answerMeasurementProblem(text, dim) {
  const t = String(text || '').toLowerCase();
  const d = dimOf(dim);
  if (/^[\s\d.,$%-]+$/.test(t)) return 'Name a thing, not a number.';
  const re = numUnit(d);
  if ((re && re.test(t)) || (d === 'money' && DOLLAR_NUM.test(t))) return 'That number gives the answer away. Name the thing itself (so no "a 5 km race").';
  const own = WORDS[dimOf(dim)] || [];
  if (own.length && new RegExp(`\\b(?:${own.join('|')})\\b`, 'i').test(t)) return 'That names an amount, not a thing. Try the thing itself.';
  return '';
}

/** For a puzzle end (stricter): no digits, no number words, no unit words at all. */
export function boundHasMeasurement(text) {
  const t = String(text || '').toLowerCase();
  return /\d/.test(t) || new RegExp(`\\b(?:${NUMWORDS})\\b`).test(t) || new RegExp(`\\b(?:${ALL_WORDS.join('|')})\\b`).test(t);
}
