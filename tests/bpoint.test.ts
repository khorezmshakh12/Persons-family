import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bpointProgress } from '../src/lib/bpoint';

const year = (vals: number[]) => [...vals, ...new Array(12 - vals.length).fill(0)];

test('A is the first paid month, current the latest', () => {
  const p = bpointProgress(10_000_000, year([4e6, 4e6, 5e6, 6.2e6]), 3);
  assert.equal(p.start, 4e6);
  assert.equal(p.startMonth, 0);
  assert.equal(p.current, 6.2e6);
  assert.equal(p.currentMonth, 3);
  assert.equal(p.pct, 62);
  assert.equal(p.road, 37); // (6.2-4)/(10-4)
  assert.equal(p.gap, 3.8e6);
});

test('hired mid-year: A starts at the first paid month; unpaid current month falls back', () => {
  const p = bpointProgress(8e6, year([0, 0, 3e6, 4e6, 0]), 4);
  assert.equal(p.startMonth, 2);
  assert.equal(p.currentMonth, 3);
  assert.equal(p.current, 4e6);
});

test('months after upTo are ignored', () => {
  const p = bpointProgress(5e6, year([2e6, 9e6]), 0);
  assert.equal(p.current, 2e6);
});

test('reached or passed B → road 100, gap 0', () => {
  const p = bpointProgress(5e6, year([3e6, 6e6]), 1);
  assert.equal(p.road, 100);
  assert.equal(p.gap, 0);
  assert.equal(p.pct, 120);
});

test('no pay yet / no target / pay dropped below A', () => {
  assert.deepEqual(
    [bpointProgress(5e6, year([]), 5).current, bpointProgress(5e6, year([]), 5).road],
    [0, 0],
  );
  assert.equal(bpointProgress(0, year([3e6]), 0).pct, 0);
  assert.equal(bpointProgress(10e6, year([5e6, 4e6]), 1).road, 0);
  // target below A: no road to cover until current reaches it
  assert.equal(bpointProgress(3e6, year([4e6, 2e6]), 1).road, 0);
});
