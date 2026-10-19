import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL_TEMPLATES, type Course } from '../src/lib/accounting';
import { capacityFit, costPerLessonHour, seatCapacity, segmentPL, teacherCostFor } from '../src/lib/accounting-ma';

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
