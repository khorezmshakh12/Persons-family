import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examPlanFor, grammarLessonsBefore, lessonTypeForPosition, planAssignments } from '../src/lib/syllabus-template';
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

test('planner: 6 filled lessons make the next lesson Progress Test 1', () => {
  const rows = (filled: boolean[]) => filled.map((f, i) => ({ id: `l${i + 1}`, filled: f, pos: null as number | null }));
  // nothing written yet -> nothing counted
  assert.deepEqual(planAssignments(rows([false, false, false])), []);
  // 5 written: lessons 1-5 counted, no exam yet
  const five = planAssignments(rows([true, true, true, true, true, false, false]));
  assert.deepEqual(five.map((a) => a.pos), [1, 2, 3, 4, 5]);
  // 6 written: the next (empty) lesson becomes the 7th, a progress test
  const six = planAssignments(rows([true, true, true, true, true, true, false, false]));
  assert.deepEqual(six.at(-1), { id: 'l7', pos: 7, type: 'progress_test' });
  assert.equal(six.length, 7);
  // empty slots before the first written lesson are skipped
  const late = planAssignments(rows([false, false, true]));
  assert.deepEqual(late, [{ id: 'l3', pos: 1, type: 'lesson' }]);
});

test('planner: keeps earlier positions and continues after the last one', () => {
  const rows = [
    { id: 'a', filled: true, pos: 6 },
    { id: 'b', filled: false, pos: 7 },
    { id: 'c', filled: false, pos: null },
    { id: 'd', filled: true, pos: null },
  ];
  assert.deepEqual(planAssignments(rows), [{ id: 'd', pos: 8, type: 'lesson' }]);
  // 17 lessons done -> lesson 18 is the Middle Exam, even before it is written
  assert.deepEqual(planAssignments([{ id: 'x', filled: true, pos: 17 }, { id: 'y', filled: false, pos: null }]), [
    { id: 'y', pos: 18, type: 'midterm' },
  ]);
  assert.equal(grammarLessonsBefore(7), 6);
  assert.equal(grammarLessonsBefore(18), 15);
  assert.equal(grammarLessonsBefore(36), 30);
});
