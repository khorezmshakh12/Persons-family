import { test } from 'node:test';
import assert from 'node:assert/strict';
import { level, loadMatrix, overloaded, suggestRag, weekStarts } from '../src/lib/perforce-load';

test('weeks start on Monday', () => {
  assert.deepEqual(weekStarts('2026-10-09', 3), ['2026-10-05', '2026-10-12', '2026-10-19']);
});

test('load counts overlapping strategy tasks, due and overdue tasks, open issues', () => {
  const weeks = weekStarts('2026-10-09', 2);
  const m = loadMatrix(
    {
      stasks: [
        { id: 's1', title: 'A', assignee_id: 'p', start_date: '2026-10-01', end_date: '2026-10-14', status: 'doing', space_id: 'x' },
        { id: 's2', title: 'B', assignee_id: 'p', start_date: '2026-10-01', end_date: '2026-10-02', status: 'doing', space_id: 'x' },
        { id: 's3', title: 'C', assignee_id: 'p', start_date: '2026-10-01', end_date: '2026-10-30', status: 'done', space_id: 'x' },
      ],
      tasks: [
        { id: 't1', title: 'due', assigned_to: 'p', deadline: '2026-10-08T10:00:00Z', status: 'pending' },
        { id: 't2', title: 'overdue', assigned_to: 'p', deadline: '2026-09-20T10:00:00Z', status: 'in_progress' },
        { id: 't3', title: 'next', assigned_to: 'p', deadline: '2026-10-13T10:00:00Z', status: 'pending' },
      ],
      issues: [{ id: 'i1', title: 'bug', assigned_to: 'p', status: 'open', created_at: '2026-10-01T00:00:00Z' }],
    },
    ['p'],
    weeks,
  );
  const [w0, w1] = m.get('p')!;
  assert.equal(w0.points, 4 + 2 + 2 + 1);
  assert.equal(w1.points, 4 + 2);
  assert.equal(level(w0.points), 'busy');
  assert.equal(level(0), 'free');
  assert.equal(level(11), 'over');
  assert.deepEqual(overloaded(m), []);
});

test('RAG suggestion from progress gap, late share and risks', () => {
  assert.equal(suggestRag(50, 50, 0, 0), 'green');
  assert.equal(suggestRag(40, 55, 0, 0), 'amber');
  assert.equal(suggestRag(20, 60, 0, 0), 'red');
  assert.equal(suggestRag(60, 50, 0.3, 0), 'red');
  assert.equal(suggestRag(60, 50, 0, 2), 'red');
});
