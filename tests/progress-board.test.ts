import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistDay, checklistStreak, dayGoals, goalCell, goalSummary, openToday, spline, tickKey, type BoardDay, type BoardGoal } from '../src/lib/progress-board';

const day = (key: string, off = false): BoardDay => ({ key, n: Number(key.slice(8)), w: '', off });
const goal = (over: Partial<BoardGoal>): BoardGoal => ({
  id: 'g',
  scope: 'day',
  title: 'T',
  periodKey: '2026-10-20',
  startDay: '2026-10-20',
  dueDay: '2026-10-20',
  doneDay: null,
  ...over,
});

test('checklist day: done out of items', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const ticks = new Set([tickKey('a', '2026-10-21'), tickKey('c', '2026-10-21'), tickKey('a', '2026-10-20')]);
  assert.deepEqual(checklistDay(items, ticks, '2026-10-21'), { done: 2, total: 4, pct: 50 });
  assert.deepEqual(checklistDay([], ticks, '2026-10-21'), { done: 0, total: 0, pct: 0 });
});

test('streak skips off days and an unfinished today', () => {
  const days = [day('2026-10-16'), day('2026-10-17'), day('2026-10-18', true), day('2026-10-19'), day('2026-10-20'), day('2026-10-21')];
  const full = new Set(['2026-10-17', '2026-10-19', '2026-10-20']);
  assert.equal(checklistStreak(days, '2026-10-21', (k) => full.has(k)), 3);
  full.add('2026-10-21');
  assert.equal(checklistStreak(days, '2026-10-21', (k) => full.has(k)), 4);
});

test('goal cells: open, late, done day, then nothing', () => {
  const g = goal({ doneDay: '2026-10-22' });
  assert.equal(goalCell(g, '2026-10-19', '2026-10-23'), 'none');
  assert.equal(goalCell(g, '2026-10-20', '2026-10-23'), 'open');
  assert.equal(goalCell(g, '2026-10-21', '2026-10-23'), 'late');
  assert.equal(goalCell(g, '2026-10-22', '2026-10-23'), 'done');
  assert.equal(goalCell(g, '2026-10-23', '2026-10-23'), 'none');
  assert.equal(goalCell(goal({}), '2026-10-25', '2026-10-23'), 'future');
});

test('an open goal carries into today; a done one does not', () => {
  const goals = [goal({ id: 'old' }), goal({ id: 'done', doneDay: '2026-10-20' }), goal({ id: 'now', periodKey: '2026-10-21', dueDay: '2026-10-21' })];
  assert.deepEqual(openToday(goals, 'day', '2026-10-21').map((g) => g.id), ['old', 'now']);
  assert.deepEqual(dayGoals(goals, '2026-10-20'), { done: 1, total: 2, pct: 50 });
  const s = goalSummary([goal({ doneDay: '2026-10-20' }), goal({ doneDay: '2026-10-21' }), goal({})], 'day');
  assert.deepEqual(s, { total: 3, done: 2, onTime: 1, late: 1, pct: 67 });
});

test('spline starts at the first point and ends at the last', () => {
  const d = spline([[0, 10], [10, 20], [20, 5]]);
  assert.ok(d.startsWith('M0.0,10.0'));
  assert.ok(d.endsWith('20.0,5.0'));
  assert.equal(spline([]), '');
});
