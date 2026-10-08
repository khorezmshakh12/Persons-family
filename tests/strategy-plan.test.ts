import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cascadeShift, createsCycle, criticalPath, depViolations, quarterElapsed, quarterOf, quarterRange, weekOf } from '../src/lib/strategy-plan';

const t = (id: string, start_date: string, end_date: string) => ({ id, start_date, end_date });

test('cycle detection follows prerequisites', () => {
  const deps = [
    { task_id: 'b', depends_on: 'a' },
    { task_id: 'c', depends_on: 'b' },
  ];
  assert.equal(createsCycle(deps, 'a', 'c'), true);
  assert.equal(createsCycle(deps, 'c', 'a'), false);
  assert.equal(createsCycle(deps, 'a', 'a'), true);
});

test('a dependant starting before its prerequisite ends is a violation', () => {
  const tasks = [t('a', '2026-10-01', '2026-10-05'), t('b', '2026-10-05', '2026-10-08')];
  assert.equal(depViolations(tasks, [{ task_id: 'b', depends_on: 'a' }]).length, 1);
});

test('cascade pushes the chain and keeps lengths', () => {
  const tasks = [t('a', '2026-10-01', '2026-10-05'), t('b', '2026-10-06', '2026-10-08'), t('c', '2026-10-09', '2026-10-09')];
  const deps = [
    { task_id: 'b', depends_on: 'a' },
    { task_id: 'c', depends_on: 'b' },
  ];
  const moved = cascadeShift(tasks, deps, t('a', '2026-10-01', '2026-10-07'));
  assert.deepEqual(moved, [t('b', '2026-10-08', '2026-10-10'), t('c', '2026-10-11', '2026-10-11')]);
  // Slack absorbs a small slip: nothing moves.
  assert.deepEqual(cascadeShift(tasks, deps, t('a', '2026-10-01', '2026-10-04')), []);
});

test('critical path walks the tight chain back from the last finish', () => {
  const tasks = [t('a', '2026-10-01', '2026-10-05'), t('b', '2026-10-06', '2026-10-10'), t('x', '2026-09-01', '2026-09-02')];
  const deps = [
    { task_id: 'b', depends_on: 'a' },
    { task_id: 'b', depends_on: 'x' },
  ];
  assert.deepEqual([...criticalPath(tasks, deps)].sort(), ['a', 'b']);
});

test('weeks start on Monday, quarters split the year', () => {
  assert.equal(weekOf('2026-10-08'), '2026-10-05');
  assert.equal(weekOf('2026-10-11'), '2026-10-05');
  assert.equal(weekOf('2026-10-05'), '2026-10-05');
  assert.equal(quarterOf('2026-10-08'), '2026-Q4');
  assert.deepEqual(quarterRange('2026-Q1'), ['2026-01-01', '2026-03-31']);
  assert.equal(quarterElapsed('2026-Q4', '2026-12-31'), 100);
});
