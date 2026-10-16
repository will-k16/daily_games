// Every value is stored in one base unit per property. Shared by browser + API.

export const PROPS = {
  weight:     { label: 'weight',      unit: 'kilograms',             desc: 'weight (mass)', dim: 'mass', tier: 1, more: ['heavier', 'lighter'] },
  height:     { label: 'height',      unit: 'meters',                desc: 'height', dim: 'length', tier: 1, more: ['taller', 'shorter'] },
  length:     { label: 'length',      unit: 'meters',                desc: 'length (longest dimension)', dim: 'length', tier: 1, more: ['longer', 'shorter'] },
  speed:      { label: 'top speed',   unit: 'meters per second',     desc: 'typical top speed', dim: 'speed', tier: 1, more: ['faster', 'slower'] },
  price:      { label: 'price',       unit: 'US dollars',            desc: 'typical price in US dollars today', dim: 'money', tier: 1, more: ['pricier', 'cheaper'] },
  distance:   { label: 'distance',    unit: 'meters',                desc: 'distance (length of the route, or how far apart)', dim: 'length', tier: 2, more: ['farther', 'shorter'] },
  volume:     { label: 'volume',      unit: 'liters',                desc: 'volume or capacity', dim: 'volume', tier: 2, more: ['bigger', 'smaller'] },
  age:        { label: 'age',         unit: 'years',                 desc: 'age as of {YEAR} (how long ago it was made, built, born, or founded)', dim: 'time_y', tier: 2, more: ['older', 'younger'] },
  population: { label: 'population',  unit: 'people',                desc: 'population (number of people who live there)', dim: 'count', tier: 2, more: ['more populous', 'less populous'] },
  duration:   { label: 'duration',    unit: 'seconds',               desc: 'duration (how long it typically lasts)', dim: 'time', tier: 2, more: ['longer', 'shorter'] },
  capacity:   { label: 'capacity',    unit: 'people',                desc: 'how many people it can hold or seat', dim: 'count', tier: 2, more: ['roomier', 'smaller'] },
  calories:   { label: 'calories',    unit: 'kilocalories (food Calories)', desc: 'food energy of a typical serving or whole item', dim: 'energy', tier: 2, more: ['more caloric', 'less caloric'] },
  area:       { label: 'area',        unit: 'square meters',         desc: 'area', dim: 'area', tier: 3, more: ['bigger', 'smaller'] },
  lifespan:   { label: 'lifespan',    unit: 'years',                 desc: 'typical lifespan', dim: 'time_y', tier: 3, more: ['longer-lived', 'shorter-lived'] },
  depth:      { label: 'depth',       unit: 'meters',                desc: 'depth below the surface (deepest point)', dim: 'length', tier: 3, more: ['deeper', 'shallower'] },
  power:      { label: 'power',       unit: 'watts',                 desc: 'typical power output or power use', dim: 'power', tier: 3, more: ['more powerful', 'less powerful'] },
  data:       { label: 'data size',   unit: 'bytes',                 desc: 'typical digital file or storage size', dim: 'data', tier: 3, more: ['bigger', 'smaller'] },
  words:      { label: 'word count',  unit: 'words',                 desc: 'number of words in it', dim: 'count', tier: 3, more: ['wordier', 'shorter'] },
  copies:     { label: 'copies sold', unit: 'copies',                desc: 'total copies or units sold worldwide', dim: 'count', tier: 3, more: ['bigger-selling', 'smaller-selling'] }
};

export const ROOMS = [
  { slot: 1, key: 'porridge', name: 'Porridge', emoji: '🥣', tier: 'Easy' },
  { slot: 2, key: 'chairs',   name: 'Chairs',   emoji: '🪑', tier: 'Medium' },
  { slot: 3, key: 'beds',     name: 'Beds',     emoji: '🛏️', tier: 'Hard' }
];

export function propLabel(p) { return (PROPS[p] && PROPS[p].label) || p; }
