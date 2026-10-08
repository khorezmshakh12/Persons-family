import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseBalance, freeSlots, issuesFor, overlaps, scheduleIssues, type SchedGroup } from '../src/lib/ops-schedule';

const g = (over: Partial<SchedGroup>): SchedGroup => ({
  id: 'x',
  name: 'G',
  course: 'GE',
  cohort: 'odd',
  time: '14:00',
  room: '101',
  teacher_id: 't1',
  teacher: 'Ali',
  duration: 90,
  enrolled: 10,
  ...over,
});
const cap = () => 12;

test('overlap respects durations', () => {
  assert.equal(overlaps('14:00', 90, '15:00', 90), true);
  assert.equal(overlaps('14:00', 90, '15:30', 90), false);
  assert.equal(overlaps('16:00', 60, '15:30', 90), true);
});

test('room and teacher clashes block; other cohort does not', () => {
  const all = [g({ id: 'a' }), g({ id: 'b', room: '102', teacher_id: 't2', teacher: 'Vali' }), g({ id: 'c', cohort: 'even' })];
  const mover = g({ id: 'm', teacher_id: 't2', teacher: 'Vali' });
  const kinds = issuesFor(mover, { room: '101', time: '14:30', cohort: 'odd', duration: 90 }, all, cap).map((i) => i.kind);
  assert.deepEqual(kinds.sort(), ['room', 'teacher']);
});

test('capacity and availability warn', () => {
  const kinds = issuesFor(g({ id: 'm', enrolled: 15 }), { room: '101', time: '19:00', cohort: 'odd', duration: 90 }, [], cap, [
    { teacher_id: 't1', cohort: 'odd', start: '09:00', end: '18:00' },
  ]).map((i) => i.kind);
  assert.deepEqual(kinds.sort(), ['availability', 'capacity']);
});

test('schedule issues report each pair once', () => {
  const issues = scheduleIssues([g({ id: 'a' }), g({ id: 'b', teacher_id: 't2' })], cap);
  assert.equal(issues.filter((i) => i.kind === 'room').length, 1);
});

test('free slots skip busy time ranges', () => {
  const slots = freeSlots([g({ id: 'a', time: '09:00' })], ['101'], 'odd', 90, '08:00', '12:00', 30);
  assert.deepEqual(slots.map((s) => s.time), ['10:30']);
});

test('course balance: demand vs free seats', () => {
  const b = courseBalance([{ course: 'IELTS' }, { course: 'ielts' }, { course: 'IELTS' }], 1, [g({ course: 'IELTS', enrolled: 11 })], cap);
  assert.deepEqual(b[0], { course: 'IELTS', demand: 3, groups: 1, freeSeats: 1, gap: 2 });
});
