import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buckets, change, insights, METRICS, parseConfig, type Series } from '../src/lib/team-report';

test('week buckets start on Monday and end with the current week', () => {
  const bs = buckets('week', '2026-10-09'); // a Friday
  assert.equal(bs.length, 8);
  assert.equal(bs[7].start, '2026-10-05');
  assert.equal(bs[7].end, '2026-10-12');
  assert.equal(bs[0].start, '2026-08-17');
  const sun = buckets('week', '2026-10-11');
  assert.equal(sun[7].start, '2026-10-05');
});

test('month and quarter buckets', () => {
  const m = buckets('month', '2026-01-15', 3);
  assert.deepEqual(m.map((b) => b.start), ['2025-11-01', '2025-12-01', '2026-01-01']);
  assert.equal(m[2].end, '2026-02-01');
  const q = buckets('quarter', '2026-05-20', 2);
  assert.deepEqual(q.map((b) => b.start), ['2026-01-01', '2026-04-01']);
  assert.equal(q[1].end, '2026-07-01');
});

test('change: points for %, share otherwise', () => {
  assert.equal(change([80, 90], '%'), 10);
  assert.equal(change([10, 15], ''), 0.5);
  assert.equal(change([0, 0], ''), 0);
  assert.equal(change([0, 4], ''), null);
  assert.equal(change([null, 4], ''), null);
});

test('insights flag a falling on-time rate and missed work first', () => {
  const series = Object.fromEntries(METRICS.map((m) => [m, [null, null]])) as Series;
  series.onTime = [90, 70];
  series.missed = [0, 4];
  series.tasksDone = [10, 10];
  const out = insights(series, ['a', 'b'], [], [], 5);
  assert.deepEqual(out.map((x) => x.id), ['onTime', 'missed']);
  assert.equal(out[0].tone, 'risk');
});

test('saved report config is validated', () => {
  assert.equal(parseConfig({ metrics: ['nope'], range: 'week' }), null);
  assert.deepEqual(parseConfig({ metrics: ['leads', 'x'], range: 'year', dept: '' }), { metrics: ['leads'], range: 'week', dept: null });
});
