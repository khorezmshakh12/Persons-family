import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL_TEMPLATES, type Course } from '../src/lib/accounting';
import { capacityFit, costPerLessonHour, seatCapacity, segmentPL, teacherCostFor } from '../src/lib/accounting-ma';
import { riskLevel, riskScore, riskSummary, type Risk } from '../src/lib/perforce';

const C = (id: string, fee: number, students: number, teacher: number, book: number, hours = 0): Course => ({
  id, name: id, fee, students, teacher_cost: teacher, book_cost: book, hours_month: hours,
});

test('teacherCostFor: share % of revenue, else the fixed cost', () => {
  assert.equal(teacherCostFor(500_000, 20, 40, 1), 4_000_000);
  assert.equal(teacherCostFor(500_000, 20, null, 3_000_000), 3_000_000);
  assert.equal(teacherCostFor(500_000, 20, undefined, 7), 7);
  assert.equal(teacherCostFor(100, 10, 150, 0), 1000); // clamped to 100 %
});

test('costPerLessonHour: (direct + fixed) / hours', () => {
  const cs = [C('a', 100, 10, 300, 10, 40), C('b', 200, 5, 200, 0, 60)];
  const r = costPerLessonHour(cs, 500);
  assert.equal(r.hours, 100);
  assert.equal(r.cost, 300 + 100 + 200 + 500);
  assert.equal(r.perHour, 11);
  assert.equal(costPerLessonHour([C('x', 1, 1, 1, 1)], 10).perHour, null);
  assert.deepEqual(segmentPL(cs, 0, 'equal').map((s) => s.hours), [40, 60]);
});

test('seatCapacity & capacityFit', () => {
  const cap = seatCapacity(['A', 'B', 'A', ''], [{ code: 'A', capacity: 10 }], 14, 3);
  assert.equal(cap, (10 + 14) * 3 * 2);
  assert.deepEqual(capacityFit(72, cap), { fits: true, util: 0.5 });
  assert.equal(capacityFit(200, cap).fits, false);
  assert.equal(capacityFit(null, cap).fits, null);
  assert.equal(capacityFit(5, 0).util, null);
});

test('Ustav kapitaliga badal template: Dt 5110 / Kt 8300', () => {
  assert.deepEqual(JOURNAL_TEMPLATES.find((t) => t[0] === 'Ustav kapitaliga badal')?.slice(1), ['5110', '8300']);
});

test('risk score, level and register summary', () => {
  assert.equal(riskScore({ likelihood: 4, impact: 5 }), 20);
  assert.equal(riskScore({ likelihood: 9, impact: 0 }), 5);
  assert.deepEqual([1, 6, 12, 20].map(riskLevel), ['low', 'medium', 'high', 'critical']);
  const R = (likelihood: number, impact: number, status: Risk['status'], review_date: string | null = null, postmortem = ''): Risk => ({
    id: `${likelihood}${impact}${status}`, likelihood, impact, status, review_date, postmortem,
  });
  const s = riskSummary([R(5, 5, 'open', '2026-09-01'), R(2, 3, 'monitoring', '2026-10-01'), R(3, 3, 'occurred'), R(1, 1, 'closed'), R(2, 2, 'occurred', null, 'root cause')], '2026-09-25');
  assert.equal(s.live, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.pmDue, 1);
  assert.equal(s.matrix[4][4], 1);
  assert.equal(s.matrix[2][1], 1);
  assert.deepEqual(s.by, { low: 0, medium: 1, high: 0, critical: 1 });
});
