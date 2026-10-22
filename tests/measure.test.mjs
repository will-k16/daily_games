import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerMeasurementProblem as bad, boundHasMeasurement as boundBad } from '../public/js/measure.js';

test('answers with amounts are blocked', () => {
  for (const [a, dim] of [['a 5-km race', 'length'], ['a 5k race', 'length'], ['a five kilometer run', 'length'], ['a 10 lb bag of flour', 'mass'],
    ['a gallon of milk', 'volume'], ['a two-liter bottle', 'volume'], ['an hour-long movie', 'time'], ['a $20 bill', 'money'], ['a twenty dollar bill', 'money'],
    ['a 50-seat bus', 'count'], ['a 10-story building', 'length'], ['a 300 page novel', 'count'], ['a mile', 'length'], ['5000', 'mass'], ['a 3 GB file', 'data'], ['a 100 watt bulb', 'power'],
    ['a 6 foot tall man', 'length'], ['a 2-liter bottle of soda', 'mass'], ['a 100 year old tree', 'time_y'], ['an 800m race', 'length'], ['a 5 km race', 'length'], ['a 2 hour movie', 'time']]) {
    assert.ok(bad(a, dim), a);
  }
});

test('normal answers pass', () => {
  for (const [a, dim] of [['a Boeing 747', 'mass'], ['a 1960s muscle car', 'speed'], ['a school bus', 'length'], ['a dairy cow', 'mass'],
    ['a pound cake', 'length'], ['a Boeing 747 seat', 'mass'], ['a 12 page essay', 'mass'], ['an iPhone 15', 'price'], ['a 4x4 truck', 'mass'], ['Apollo 11', 'distance'], ['a gallon of milk', 'mass'],
    ['an average 8 year old child', 'length'], ['an 8-year-old', 'mass'], ['a 2 liter bottle', 'length'], ['a $5 footlong', 'mass'], ['a 3 hour movie', 'mass'],
    ['a 1 TB hard drive', 'price'], ['a 12 oz steak', 'speed'],
    ['average 800m race time', 'time'], ['a 5 km race', 'time'], ['a marathon (26.2 miles)', 'time'], ['a 3 minute song', 'data'], ['a 6 foot tall fridge', 'volume']]) {
    assert.equal(bad(a, dim), '', a);
  }
});

test('puzzle ends with numbers or units are rejected', () => {
  assert.ok(boundBad('a 5-kilometer cross country run'));
  assert.ok(boundBad('a two-liter soda bottle'));
  assert.ok(boundBad('a standard soda can (12 oz)'));
  assert.equal(boundBad('a marathon'), false);
  assert.equal(boundBad('the Eiffel Tower'), false);
});
