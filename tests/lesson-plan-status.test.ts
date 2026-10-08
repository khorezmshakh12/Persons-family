import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filledFields, groupDayStatus, isLessonPlanComplete, planDeadline } from '../src/lib/lesson-plan-status';

const full = { topic: 'T', aim: 'A', language_focus: 'L', anticipated_problems: 'P', homework: 'H' };

test('completeness counts the five required fields only', () => {
  assert.equal(filledFields(full), 5);
  assert.equal(isLessonPlanComplete(full), true);
  assert.equal(filledFields({ ...full, homework: '  ' }), 4);
  assert.equal(isLessonPlanComplete({ ...full, homework: null }), false);
});

test('group day status mirrors the nightly cron', () => {
  assert.equal(groupDayStatus([]), 'missing');
  assert.equal(groupDayStatus([{ topic: '' }]), 'missing');
  assert.equal(groupDayStatus([{ topic: 'x' }]), 'incomplete');
  assert.equal(groupDayStatus([{ topic: '' }, full]), 'complete');
  assert.equal(groupDayStatus([{ topic: '', moved_to_lesson_id: 'id' }]), 'complete');
});

test('deadline is 23:59 Tashkent the day before', () => {
  assert.equal(planDeadline('2026-10-09').toISOString(), '2026-10-08T18:59:00.000Z');
});
