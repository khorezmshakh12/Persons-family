import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PLAN,
  forecast,
  lifetimeValue,
  logWidth,
  monthTone,
  parsePlan,
  peakLoad,
  planMonths,
  planSummary,
  workDaysBetween,
  type OpsPlan,
} from '../src/lib/ops-plan';

const sc = { churn: 6, trial: 50, conv: 25, cpl: 30000, ctr: 2 };
const plan: OpsPlan = { ...EMPTY_PLAN, target: 600, deadline: '2026-12-31', scenarios: { worst: sc, average: sc, best: sc } };

test('workDaysBetween counts Mon–Sat', () => {
  // 2026-09-28 is a Monday → one full week.
  assert.equal(workDaysBetween('2026-09-28', '2026-10-04', 6), 6);
  assert.equal(workDaysBetween('2026-09-28', '2026-10-04', 5), 5);
  assert.equal(workDaysBetween('2026-10-04', '2026-09-28', 6), 0);
});

test('parsePlan sanitises garbage', () => {
  const p = parsePlan({ target: '600', deadline: 'x', seats: 999, scenarios: { worst: { churn: -5, conv: 'a' } } });
  assert.equal(p.target, 600);
  assert.equal(p.deadline, '');
  assert.equal(p.seats, 200);
  assert.equal(p.scenarios.worst.churn, 0);
  assert.equal(p.scenarios.worst.conv, 0);
  assert.equal(parsePlan(null).workDays, 6);
});

test('planMonths reaches the target and funnels sales back to leads', () => {
  const m = planMonths(plan, sc, 102, '2026-10-01');
  assert.deepEqual(m.map((x) => x.ym), ['2026-10', '2026-11', '2026-12']);
  assert.equal(m[m.length - 1].end, 600);
  assert.equal(m[0].start, 102);
  for (const x of m) {
    assert.equal(x.sales, x.end - x.start + x.churn);
    assert.equal(x.leads, Math.ceil(x.sales / 0.25));
    assert.equal(x.reach, Math.ceil(x.leads / 0.02));
    assert.equal(x.budget, x.leads * 30000);
  }
  // Full October: churn = 6% of 102.
  assert.equal(m[0].churn, Math.round(102 * 0.06));
  const s = planSummary(m, 102, 600);
  assert.equal(s.netGrowth, 498);
  assert.equal(s.sales, 498 + s.churnTotal);
  assert.equal(s.cac, s.budget / s.sales);
});

test('planMonths empty when not configured or past deadline', () => {
  assert.deepEqual(planMonths(EMPTY_PLAN, sc, 10, '2026-10-01'), []);
  assert.deepEqual(planMonths(plan, sc, 10, '2027-01-01'), []);
});

test('forecast, ltv, tone, peak, logWidth', () => {
  const m = planMonths(plan, sc, 100, '2026-10-01');
  const f = forecast(plan, sc, 100, m, 40);
  assert.equal(f[0], 100 - 6 + 10);
  assert.equal(lifetimeValue(500000, 5), 10000000);
  assert.equal(lifetimeValue(500000, 0), null);
  assert.equal(monthTone(10, 10), 'ok');
  assert.equal(monthTone(7, 10), 'warn');
  assert.equal(monthTone(1, 10), 'bad');
  const p = peakLoad([{ room: 'A', time: '09:00' }, { room: 'B', time: '09:00' }, { room: 'A', time: '14:00' }], ['A', 'B'], ['09:00', '14:00']);
  assert.deepEqual(p, { pct: 100, time: '09:00' });
  assert.equal(logWidth(1000, 1000, 10), 100);
  assert.ok(logWidth(10, 1000, 10) >= 22);
});
