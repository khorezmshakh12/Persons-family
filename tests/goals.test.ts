import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyReport, doneStreak, dueChip, nextPeriodKey, shiftDue, sortGoals, weekKeyOf, workingDay, type GoalItem } from '../src/lib/goals';

const g = (over: Partial<GoalItem>): GoalItem => ({
  id: 'x', scope: 'day', title: 'T', done: false, doneAt: null, dueDate: null, dueTime: null, priority: false, carry: 0, movedFrom: null, ...over,
});

test('daily goals never land on a Sunday', () => {
  assert.equal(nextPeriodKey('day', '2026-11-02'), '2026-11-03'); // Mon → Tue
  assert.equal(nextPeriodKey('day', '2026-11-07'), '2026-11-09'); // Sat → Mon
  assert.equal(workingDay('2026-11-08'), '2026-11-09'); // Sun → Mon
  assert.equal(workingDay('2026-11-04'), '2026-11-04');
});

test('week and month keys step forward', () => {
  assert.equal(weekKeyOf('2026-11-08'), '2026-11-02');
  assert.equal(nextPeriodKey('week', '2026-11-02'), '2026-11-09');
  assert.equal(nextPeriodKey('month', '2026-12'), '2027-01');
});

test('a deadline moves with its goal', () => {
  assert.equal(shiftDue('day', '2026-11-07', '2026-11-07', '2026-11-09'), '2026-11-09');
  assert.equal(shiftDue('week', '2026-11-06', '2026-11-02', '2026-11-09'), '2026-11-13');
  assert.equal(shiftDue('month', '2026-01-31', '2026-01', '2026-02'), '2026-02-28'); // clamped
  assert.equal(shiftDue('month', '2026-11-15', '2026-11', '2026-12'), '2026-12-15');
  assert.equal(shiftDue('week', null, '2026-11-02', '2026-11-09'), null);
});

test('deadline chip: plain before mount, late / soon after', () => {
  const goal = g({ dueDate: '2026-11-02', dueTime: '18:00' });
  assert.deepEqual(dueChip(goal, null), { text: '⏰ 18:00', tone: 'neutral' });
  assert.equal(dueChip(goal, { day: '2026-11-02', clock: '18:30' })?.tone, 'late');
  assert.equal(dueChip(goal, { day: '2026-11-02', clock: '17:00' })?.text, '⏰ 18:00 · 1 soat 0 daq qoldi');
  assert.equal(dueChip(g({ scope: 'week', dueDate: '2026-11-06' }), { day: '2026-11-02', clock: '10:00' })?.text, '📅 06.11 · 4 kun qoldi');
  assert.equal(dueChip(g({ done: true, doneAt: '17:52', dueDate: '2026-11-02', dueTime: '18:00' }), null)?.tone, 'ok');
});

test('open ★ goals sort first, done last', () => {
  const list = sortGoals([g({ id: 'a', done: true }), g({ id: 'b' }), g({ id: 'c', priority: true })]);
  assert.deepEqual(list.map((x) => x.id), ['c', 'b', 'a']);
});

test('daily report text', () => {
  const text = buildDailyReport({
    dayKey: '2026-11-07',
    clock: '21:00',
    name: 'Aziza <K>',
    goals: [
      g({ id: '1', title: 'Hisobot', done: true, doneAt: '17:52', dueTime: '18:00', dueDate: '2026-11-07' }),
      g({ id: '2', title: 'Taqdimot', priority: true, dueTime: '15:00', dueDate: '2026-11-07' }),
      g({ id: '3', title: 'Test', carry: 2 }),
    ],
    week: { done: 11, total: 16 },
    streak: 4,
  })!;
  assert.match(text, /Natija: 1 \/ 3 · 33%/);
  assert.match(text, /Aziza &lt;K&gt;/);
  assert.match(text, /Hisobot — 17:52 <i>\(muddatida\)<\/i>/);
  assert.match(text, /Dushanbaga o‘tadi \(2\)/); // Saturday
  assert.match(text, /★ Taqdimot — muddat 15:00 dan <b>o‘tdi<\/b>/);
  assert.match(text, /↻ <b>3-kun<\/b>/);
  assert.match(text, /seriya 🔥 4 kun/);
  assert.equal(buildDailyReport({ dayKey: '2026-11-07', clock: '21:00', name: 'X', goals: [], week: { done: 0, total: 0 }, streak: 0 }), null);
});

test('streak skips Sundays', () => {
  assert.equal(doneStreak(new Set(['2026-11-09', '2026-11-07', '2026-11-06']), '2026-11-09'), 3);
  assert.equal(doneStreak(new Set(['2026-11-08']), '2026-11-09'), 0);
});
