import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerMeasurementProblem as bad, boundHasMeasurement as boundBad } from '../public/js/measure.js';

test('answers with amounts are blocked', () => {
  for (const [a, dim] of [['a 5-km race', 'length'], ['a 5k race', 'length'], ['a five kilometer run', 'length'], ['a 10 lb bag of flour', 'mass'],
    ['a gallon of milk', 'volume'], ['a two-liter bottle', 'volume'], ['an hour-long movie', 'time'], ['a $20 bill', 'price'], ['a twenty dollar bill', 'money'],
    ['a 50-seat bus', 'count'], ['a 10-story building', 'length'], ['a 300 page novel', 'count'], ['a mile', 'length'], ['5000', 'mass'], ['a 3 GB file', 'data'], ['a 100 watt bulb', 'power']]) {
    assert.ok(bad(a, dim), a);
  }
});

test('normal answers pass', () => {
  for (const [a, dim] of [['a Boeing 747', 'mass'], ['a 1960s muscle car', 'speed'], ['a school bus', 'length'], ['a dairy cow', 'mass'],
    ['a pound cake', 'length'], ['a Boeing 747 seat', 'mass'], ['a 12 page essay', 'mass'], ['an iPhone 15', 'price'], ['a 4x4 truck', 'mass'], ['Apollo 11', 'distance'], ['a gallon of milk', 'mass']]) {
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
