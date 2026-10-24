import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examPlanFor, lessonTypeForPosition } from '../src/lib/syllabus-template';
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
