import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attention, DECISION_FLOW, level, loadMatrix, overloaded, suggest, weekStarts } from '../src/lib/perforce-load';

test('weeks start on Monday', () => {
  assert.deepEqual(weekStarts('2026-10-09', 3), ['2026-10-05', '2026-10-12', '2026-10-19']);
});

test('workload in days: prorated project tasks, due and overdue tasks, open issues, leave', () => {
  const weeks = weekStarts('2026-10-09', 2);
  const m = loadMatrix(
    {
      stasks: [
        { id: 's1', title: 'A', assignee_id: 'p', start_date: '2026-10-01', end_date: '2026-10-30', status: 'doing', space_id: 'x' },
        { id: 's2', title: 'B', assignee_id: 'p', start_date: '2026-10-11', end_date: '2026-10-11', status: 'doing', space_id: 'x' },
        { id: 's3', title: 'C', assignee_id: 'p', start_date: '2026-10-01', end_date: '2026-10-30', status: 'done', space_id: 'x' },
      ],
      tasks: [
        { id: 't1', title: 'due', assigned_to: 'p', deadline: '2026-10-08T10:00:00Z', status: 'pending' },
        { id: 't2', title: 'overdue', assigned_to: 'p', deadline: '2026-09-20T10:00:00Z', status: 'in_progress' },
      ],
      issues: [{ id: 'i1', title: 'bug', assigned_to: 'p', status: 'open', created_at: '2026-10-01T00:00:00Z' }],
    },
    ['p', 'q'],
    weeks,
    undefined,
    [{ personId: 'q', from: '2026-10-12', to: '2026-10-18' }],
  );
  const [w0, w1] = m.get('p')!;
  // s1 full week 2 + s2 one day 2/7≈0.3 + two tasks 2 + issue 0.5
  assert.equal(w0.days, 4.8);
  assert.equal(w1.days, 2);
  assert.equal(level(w0.days), 'busy');
  assert.equal(level(6), 'over');
  assert.equal(m.get('q')![1].leave, true);
  assert.equal(m.get('q')![0].leave, false);
  assert.deepEqual(overloaded(m), []);
});

test('health suggestion explains itself', () => {
  assert.deepEqual(suggest({ progress: 50, elapsed: 50, behind: 0, late: 0, total: 10, highRisks: 0 }), { rag: 'green', reasons: ['reja bo‘yicha'] });
  const a = suggest({ progress: 40, elapsed: 55, behind: 15, late: 1, total: 10, highRisks: 0 });
  assert.equal(a.rag, 'amber');
  assert.deepEqual(a.reasons, ['1 ta kechikkan vazifa', '15 punkt orqada']);
  assert.equal(suggest({ progress: 20, elapsed: 60, behind: 40, late: 0, total: 10, highRisks: 0 }).rag, 'red');
  assert.equal(suggest({ progress: 60, elapsed: 50, behind: -10, late: 0, total: 10, highRisks: 2 }).rag, 'red');
});

test('attention list puts red first and covers every source', () => {
  const list = attention({
    today: '2026-10-09',
    projects: [
      { id: 'a', name: 'A', rag: 'red', lastStatusDay: '2026-10-08', active: true },
      { id: 'b', name: 'B', rag: 'green', lastStatusDay: null, active: true },
    ],
    decisions: [{ id: 'd', title: 'Muddat', status: 'review', created_at: '2026-10-08T00:00:00Z' }],
    overloaded: [{ name: 'Ali', days: 6, week: 0 }],
    milestones: [{ id: 'm', title: 'Launch', date: '2026-10-12', project: 'A' }],
    risks: [
      { id: 'r', title: 'Narx', score: 16, status: 'open', review_date: null },
      { id: 'r2', title: 'Kadr', score: 4, status: 'open', review_date: '2026-10-01' },
    ],
  });
  assert.equal(list[0].level, 'red');
  assert.deepEqual(new Set(list.map((x) => x.tab)), new Set(['status', 'decisions', 'load', 'overview', 'risks']));
  assert.ok(list.some((x) => x.key === 'stale-b'));
  assert.ok(list.some((x) => x.key === 'rev-r2'));
});

test('decision flow', () => {
  assert.deepEqual(DECISION_FLOW.draft, ['review']);
  assert.ok(DECISION_FLOW.review.includes('approved'));
  assert.ok(!DECISION_FLOW.approved.includes('rejected'));
});
