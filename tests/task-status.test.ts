import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_DRAG_TARGETS,
  TASK_OPEN_STATUSES,
  TASK_STATUSES,
  BOARD_LANES,
  boardColumnFor,
  boardLaneFor,
  isTaskUnderReview,
  laneDropStatus,
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

test('under-review statuses get their own board lane', () => {
  assert.equal(boardLaneFor('submitted'), 'review');
  assert.equal(boardLaneFor('awaiting_upload'), 'review');
  assert.equal(boardLaneFor('done'), 'done');
  assert.equal(boardLaneFor('pending'), 'pending');
});

test('every lane drops to a valid drag target', () => {
  for (const lane of BOARD_LANES) {
    assert.ok((TASK_DRAG_TARGETS as readonly string[]).includes(laneDropStatus(lane)), lane);
  }
  assert.equal(laneDropStatus('review'), 'done');
});
