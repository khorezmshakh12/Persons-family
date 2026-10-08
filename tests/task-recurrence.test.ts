import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDueForCreation, nextDue } from '../src/lib/task-recurrence';

test('weekly next due is +7 days across month ends', () => {
  assert.equal(nextDue('2026-10-27', 'weekly'), '2026-11-03');
  assert.equal(nextDue('2026-12-29', 'weekly'), '2027-01-05');
});

test('monthly keeps the day, clamped to month length', () => {
  assert.equal(nextDue('2026-10-15', 'monthly'), '2026-11-15');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextDue('2026-12-10', 'monthly'), '2027-01-10');
});

test('creation window opens LEAD_DAYS before the deadline', () => {
  assert.equal(isDueForCreation('2026-11-01', '2026-11-03', 'weekly'), true);
  assert.equal(isDueForCreation('2026-10-31', '2026-11-03', 'weekly'), false);
  assert.equal(isDueForCreation('2026-11-10', '2026-11-15', 'monthly'), true);
  assert.equal(isDueForCreation('2026-11-09', '2026-11-15', 'monthly'), false);
});
