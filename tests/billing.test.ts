import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDueDate, daysBetween, nextDueDate } from '../src/lib/billing';

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
