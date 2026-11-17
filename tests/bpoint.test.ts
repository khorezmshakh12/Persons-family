import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, bpointProgress, bpointSeries, monthsBetween, windowStart } from '../src/lib/bpoint';

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

test('series: what was received (paid) per month of the window, not the computed pay', () => {
  const points = [
    { period: '2026-09-01', planned: 5e6, earned: 5e6, paid: 4e6 },
    { period: '2026-10-01', planned: 5e6, earned: 5e6, paid: 6.5e6 },
    { period: '2026-11-01', planned: 5e6, earned: 5e6, paid: 0 },
    { period: '2026-08-01', planned: 9e6, earned: 9e6, paid: 9e6 }, // before the window
  ];
  const s = bpointSeries(points, '2026-09-01', 6);
  assert.deepEqual(s, [4e6, 6.5e6, 0, 0, 0, 0]);
  // November not paid yet → "hozir" is October's 6.5M; A is September
  const p = bpointProgress(10e6, s, 2);
  assert.equal(p.current, 6.5e6);
  assert.equal(p.currentMonth, 1);
  assert.equal(p.start, 4e6);
});

test('3-year window crosses years; month math', () => {
  assert.equal(addMonths('2026-11-01', 35), '2029-10-01');
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(monthsBetween('2026-11-01', '2027-02-01'), 3);
  assert.equal(monthsBetween('2026-11-01', '2026-10-01'), -1);
  const s = bpointSeries([{ period: '2027-01-01', paid: 7e6 }], '2026-11-01', 36);
  assert.equal(s.length, 36);
  assert.equal(s[2], 7e6);
});

test('windows are counted from January (owner, 2026-11-17)', () => {
  assert.equal(windowStart('2026-11-01', 12), '2026-01-01'); // 1 yil: yanvar–dekabr
  assert.equal(windowStart('2026-11-01', 36), '2026-01-01'); // 3 yil: shu yil yanvaridan
  assert.equal(windowStart('2026-11-01', 6), '2026-07-01'); // yarim yil: iyul–dekabr
  assert.equal(windowStart('2026-03-01', 6), '2026-01-01'); // yarim yil: yanvar–iyun
  assert.equal(windowStart('2026-01-01', 12), '2026-01-01');
});
