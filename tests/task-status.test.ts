import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_DRAG_TARGETS,
  TASK_OPEN_STATUSES,
  TASK_STATUSES,
  boardColumnFor,
  isTaskUnderReview,
} from '../src/lib/task-status';

// Regression: dropping a card onto a `submitted` card sent the raw status to
// updateTaskStatusAction, which only accepts drag targets → `invalidInput`.
test('every status resolves to a droppable column', () => {
  for (const status of TASK_STATUSES) {
    assert.ok(
      (TASK_DRAG_TARGETS as readonly string[]).includes(boardColumnFor(status)),
      `${status} -> ${boardColumnFor(status)} is not a drag target`,
    );
  }
});

test('review states render in the done column', () => {
  assert.equal(boardColumnFor('submitted'), 'done');
  assert.equal(boardColumnFor('awaiting_upload'), 'done');
  assert.equal(boardColumnFor('pending'), 'pending');
});

test('open and under-review statuses never overlap', () => {
  for (const status of TASK_OPEN_STATUSES) assert.equal(isTaskUnderReview(status), false);
  assert.equal(isTaskUnderReview('done'), false);
});
