import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burndown, cumulativeFlow, readiness, sprintByNo, sprintOf, traceability, velocity, velocityForecast, weightedProgress, workload, type PTask, type TestCase } from '../src/lib/perforce';

const T = (id: string, start: string, end: string, done: string | null, who: string | null = 'a', created = '2026-01-01'): PTask => ({
  id, start_date: start, end_date: end, status: done ? 'done' : 'progress', done, created, assignee_id: who, space_id: 's',
});

test('sprints are 14 days from the anchor', () => {
  assert.deepEqual(sprintByNo(1), { no: 1, from: '2026-01-05', to: '2026-01-18' });
  assert.equal(sprintOf('2026-01-19').no, 2);
  assert.equal(sprintOf('2026-01-18').no, 1);
});

test('velocity counts done_at inside each sprint', () => {
  const tasks = [T('1', '2026-01-05', '2026-01-10', '2026-01-08'), T('2', '2026-01-19', '2026-01-25', '2026-01-20'), T('3', '2026-01-19', '2026-01-30', null)];
  const v = velocity(tasks, 2, 6);
  assert.equal(v.length, 2);
  assert.equal(v[0].done, 1);
  assert.equal(v[1].planned, 2);
  assert.equal(v[1].done, 1);
});

test('velocityForecast min/avg/max', () => {
  const f = velocityForecast([2, 4, 6], 12, '2026-02-02');
  assert.equal(f.average?.sprints, 3);
  assert.equal(f.pessimistic?.sprints, 6);
  assert.equal(f.optimistic?.sprints, 2);
  assert.equal(f.optimistic?.finish, '2026-03-01');
  assert.equal(velocityForecast([0], 5, '2026-02-02').average, null);
});

test('burndown projects at the observed rate', () => {
  const days = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'];
  const scope = [T('1', '2026-01-05', '2026-01-08', '2026-01-05'), T('2', '2026-01-05', '2026-01-08', '2026-01-06'), T('3', '2026-01-05', '2026-01-08', null), T('4', '2026-01-05', '2026-01-08', null)];
  const b = burndown(scope, days, '2026-01-06');
  assert.deepEqual(b.actual.slice(0, 2), [3, 2]);
  assert.ok(Number.isNaN(b.actual[2]));
  assert.equal(b.rate, 1);
  assert.deepEqual(b.forecast.slice(1), [2, 1, 0]);
});

test('workload flags people over capacity', () => {
  const scope = Array.from({ length: 5 }, (_, i) => T(String(i), '2026-01-05', '2026-01-08', null, 'x'));
  const w = workload(scope, 3);
  assert.equal(w.cap, 3);
  assert.equal(w.rows[0].over, true);
});

test('weightedProgress by budget, falls back to task count', () => {
  assert.equal(weightedProgress([{ progress: 100, tasks: 1, budget: 30 }, { progress: 0, tasks: 9, budget: 10 }]), 75);
  assert.equal(weightedProgress([{ progress: 100, tasks: 1, budget: 0 }, { progress: 0, tasks: 3, budget: 0 }]), 25);
});

test('traceability, quality index and readiness', () => {
  const tc = (id: string, req: string | null, result: TestCase['result'], issue: string | null = null): TestCase => ({ id, space_id: 's', stask_id: req, title: id, result, issue_id: issue });
  const tests = [tc('a', 'r1', 'pass'), tc('b', 'r1', 'fail', 'i1'), tc('c', 'r2', 'pass')];
  const t = traceability([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }], tests, new Set(['i1']));
  assert.equal(t.rows[0].st, 'bad');
  assert.equal(t.rows[1].st, 'ok');
  assert.equal(t.rows[2].st, 'gap');
  assert.equal(t.quality, Math.round((2 / 3) * 70 + (2 / 3) * 30));
  assert.equal(readiness([T('1', 'x', 'y', '2026-01-01')], tests, new Set(['i1'])).state, 'blocked');
  assert.equal(readiness([T('1', 'x', 'y', '2026-01-01')], [tests[0]], new Set()).state, 'ready');
});

test('cumulativeFlow splits created into done/open', () => {
  const cf = cumulativeFlow([T('1', 'x', 'y', '2026-01-03', 'a', '2026-01-01'), T('2', 'x', 'y', null, 'a', '2026-01-02')], ['2026-01-01', '2026-01-03']);
  assert.deepEqual(cf, [{ d: '2026-01-01', done: 0, open: 1 }, { d: '2026-01-03', done: 1, open: 1 }]);
});
