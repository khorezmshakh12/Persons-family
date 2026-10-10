import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast, itemScore } from '../src/lib/kpi-forecast';

const item = (bad: string, good: string, great: string, actual: string, kind: 'number' | 'text' = 'number') => ({
  kind,
  target_bad: bad,
  target_good: good,
  target_great: great,
  actual,
});

test('higher-is-better items', () => {
  assert.equal(itemScore(item('5', '10', '15', '15')), 2);
  assert.equal(itemScore(item('5', '10', '15', '12.5')), 1.5);
  assert.equal(itemScore(item('5', '10', '15', '10')), 1);
  assert.equal(itemScore(item('5', '10', '15', '7.5')), 0.5);
  assert.equal(itemScore(item('5', '10', '15', '1')), 0);
});

test('lower-is-better items (cost per lead)', () => {
  assert.equal(itemScore(item('50', '40', '30', '30')), 2);
  assert.equal(itemScore(item('50', '40', '30', '45')), 0.5);
});

test('skips text and blanks; averages the rest', () => {
  assert.equal(itemScore(item('a', 'b', 'c', 'd', 'text')), null);
  assert.equal(itemScore(item('5', '10', '15', '')), null);
  const f = forecast([item('5', '10', '15', '15'), item('5', '10', '15', '10'), item('5', '10', '15', '')]);
  assert.deepEqual(f, { score: 1.5, scenario: 'good', scored: 2 });
  assert.equal(forecast([item('1', '2', '3', '')]), null);
});

test('formatted numbers parse', () => {
  assert.equal(itemScore(item('10 000', '20 000', '30 000', '30 000')), 2);
  assert.equal(itemScore(item('1,5', '2,5', '3,5', '3,5')), 2);
});
