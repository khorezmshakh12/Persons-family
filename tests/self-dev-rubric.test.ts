import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRubric, streak } from '../src/lib/self-dev-rubric';

test('parseRubric keeps only 1..5 integers', () => {
  assert.deepEqual(parseRubric({ depth: 4, applied: '3', evidence: 9 }), { depth: 4, applied: 3 });
  assert.equal(parseRubric(null), null);
  assert.equal(parseRubric({ depth: 0 }), null);
});

test('streak counts back over consecutive months', () => {
  const months = ['2026-10-01', '2026-09-01', '2026-08-01', '2026-06-01'];
  assert.equal(streak(months, '2026-10-01'), 3);
});

test('an open month without a report does not break the streak', () => {
  assert.equal(streak(['2026-09-01', '2026-08-01'], '2026-10-01'), 2);
  assert.equal(streak(['2025-12-01', '2026-01-01'], '2026-02-01'), 2);
  assert.equal(streak([], '2026-10-01'), 0);
});
