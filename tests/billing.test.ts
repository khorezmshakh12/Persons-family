import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDueDate, daysBetween, feeAfterDiscount, fillTemplate, gradeOf, nextDueDate, periodParts } from '../src/lib/billing';

test('billing day is the activation day of each month', () => {
  assert.equal(currentDueDate('2026-09-15', '2026-10-22'), '2026-10-15');
  assert.equal(currentDueDate('2026-09-15', '2026-10-14'), '2026-09-15');
  assert.equal(nextDueDate('2026-09-15', '2026-10-22'), '2026-11-15');
  assert.equal(nextDueDate('2026-09-15', '2026-10-15'), '2026-10-15');
});

test('not active yet: no current charge, next is the activation day', () => {
  assert.equal(currentDueDate('2026-11-03', '2026-10-22'), null);
  assert.equal(nextDueDate('2026-11-03', '2026-10-22'), '2026-11-03');
  assert.equal(currentDueDate('2026-10-22', '2026-10-22'), '2026-10-22');
});

test('31st clamps to the end of shorter months and across the year', () => {
  assert.equal(currentDueDate('2026-01-31', '2026-02-28'), '2026-02-28');
  assert.equal(nextDueDate('2026-01-31', '2026-02-01'), '2026-02-28');
  assert.equal(currentDueDate('2026-01-31', '2026-03-30'), '2026-02-28');
  assert.equal(nextDueDate('2026-12-20', '2026-12-25'), '2027-01-20');
  assert.equal(currentDueDate('2026-11-20', '2027-01-05'), '2026-12-20');
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-10-22', '2026-10-25'), 3);
  assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3);
});

test('discount and installments split one period', () => {
  assert.equal(feeAfterDiscount(650000, 10), 585000);
  assert.deepEqual(periodParts('2026-09-15', '2026-10-15', 600000, 1), [{ key: '2026-10-15', date: '2026-10-15', amount: 600000 }]);
  assert.deepEqual(periodParts('2026-09-15', '2026-10-15', 650001, 2), [
    { key: '2026-10-15#1', date: '2026-10-15', amount: 325001 },
    { key: '2026-10-15#2', date: '2026-10-30', amount: 325000 },
  ]);
  // February is short: the second half lands before the next period.
  assert.equal(periodParts('2026-01-20', '2027-02-20', 100, 2)[1].date, '2027-03-07');
});

test('grade: on time, late, hard', () => {
  const ch = [{ date: '2026-07-10', amount: 100 }, { date: '2026-08-10', amount: 100 }, { date: '2026-09-10', amount: 100 }];
  const ontime = gradeOf(ch, [{ date: '2026-07-10', amount: 100 }, { date: '2026-08-11', amount: 100 }, { date: '2026-09-09', amount: 100 }], '2026-10-01', 0);
  assert.equal(ontime.grade, 'ok');
  assert.equal(ontime.onTime, 3);
  const late = gradeOf(ch, [{ date: '2026-07-18', amount: 100 }, { date: '2026-08-20', amount: 100 }, { date: '2026-09-17', amount: 100 }], '2026-10-01', 0);
  assert.equal(late.grade, 'late');
  const hard = gradeOf(ch, [{ date: '2026-07-30', amount: 100 }], '2026-10-01', 2);
  assert.equal(hard.grade, 'hard');
  assert.equal(hard.openDays, 52);
  assert.equal(ontime.openDays, 0);
});

test('fillTemplate replaces known variables only', () => {
  assert.equal(fillTemplate('{ism}: {summa} · {nomalum}', { ism: 'Aziza', summa: '650,000 so‘m' }), 'Aziza: 650,000 so‘m · {nomalum}');
});
