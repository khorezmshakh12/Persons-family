import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coursePosLabel, examPlanFor, examsToAnnounce, grammarLessonsBefore, lessonTypeForPosition, planPositions } from '../src/lib/syllabus-template';
import { COURSE_LEVELS } from '../src/lib/course-levels';

test('36-lesson course: 30 grammar, 4 progress, 1 middle, 1 level up', () => {
  const types = Array.from({ length: 36 }, (_, i) => lessonTypeForPosition(i + 1));
  const count = (t: string) => types.filter((x) => x === t).length;
  assert.equal(count('lesson'), 30);
  assert.equal(count('progress_test'), 4);
  assert.equal(count('midterm'), 1);
  assert.equal(count('final_test'), 1);
  assert.deepEqual(
    types.flatMap((t, i) => (t === 'progress_test' ? [i + 1] : [])),
    [7, 14, 25, 32],
  );
  assert.equal(lessonTypeForPosition(18), 'midterm');
  assert.equal(lessonTypeForPosition(36), 'final_test');
  // the template repeats after 36
  assert.equal(lessonTypeForPosition(43), 'progress_test');
  assert.equal(lessonTypeForPosition(72), 'final_test');
});

test('exam days link the Materials exam of the group level', () => {
  assert.equal(examPlanFor(1, 'elementary'), null);
  const pt2 = examPlanFor(14, 'elementary')!;
  assert.equal(pt2.topic, 'Progress Test 2');
  // the dropped progress test's part (3) is merged into the one before it
  assert.match(pt2.materials!, /progress\/elementary\?p=2/);
  assert.match(pt2.materials!, /progress\/elementary\?p=3/);
  assert.match(examPlanFor(32, 'advanced')!.materials!, /\?p=5[\s\S]*\?p=6/);
  assert.match(examPlanFor(18, 'intermediate')!.materials!, /middle\/intermediate$/);
  assert.match(examPlanFor(36, 'beginner')!.materials!, /final\/beginner$/);
  // courses without Materials exams still get the exam day, without a link
  const ielts = examPlanFor(36, 'ielts')!;
  assert.equal(ielts.topic, 'Level Up Exam');
  assert.equal(ielts.materials, null);
  assert.equal(examPlanFor(7, null)!.materials, null);
});

test('levels are in study order', () => {
  assert.deepEqual(
    COURSE_LEVELS.map((l) => l.label),
    ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'IELTS Foundation', 'IELTS', 'CEFR', 'iTEP'],
  );
});

test('planner: positions follow the lesson dates; a postponed lesson shifts the exams', () => {
  const rows = (n: number, filledUpTo = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `l${i + 1}`, date: `2026-11-${String(i + 1).padStart(2, '0')}`, filled: i < filledUpTo }));
  const plan = planPositions(rows(36));
  assert.equal(plan[6].type, 'progress_test');
  assert.equal(plan[17].type, 'midterm');
  assert.equal(plan[35].type, 'final_test');
  // lesson 3 moved away (dropped from the list) -> the exam lands one lesson later
  const moved = planPositions(rows(36).filter((r) => r.id !== 'l3'));
  assert.equal(moved.find((a) => a.type === 'progress_test')!.id, 'l8');
  // after 36 the next course starts again
  assert.equal(planPositions(rows(43))[42].type, 'progress_test');
  assert.equal(coursePosLabel(43), '2-kurs · 7-dars');
  assert.equal(coursePosLabel(7), '7-dars');
});

test('announce the exam once lesson 6 is written, never for past exams', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: `l${i + 1}`, date: `2026-11-${String(i + 1).padStart(2, '0')}`, filled: i < 5 }));
  assert.deepEqual(examsToAnnounce(planPositions(rows), '2026-11-01'), []);
  rows[5].filled = true;
  assert.deepEqual(examsToAnnounce(planPositions(rows), '2026-11-01').map((a) => a.id), ['l7']);
  assert.deepEqual(examsToAnnounce(planPositions(rows), '2026-11-08'), []);
  assert.equal(grammarLessonsBefore(7), 6);
  assert.equal(grammarLessonsBefore(43), 6);
  assert.equal(grammarLessonsBefore(36), 30);
});
