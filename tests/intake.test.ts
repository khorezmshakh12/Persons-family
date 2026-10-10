import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alerts, cohorts, enrolledIn, funnel, heatmap, lostReasons, pace, sourceMatrix, type LeadRow } from '../src/lib/intake';

const L = (o: Partial<LeadRow>): LeadRow => ({
  id: Math.random().toString(36),
  created_at: '2026-10-05T06:00:00Z',
  stage: 'new',
  source: 'instagram',
  course: 'IELTS',
  campaign: null,
  lost_reason: null,
  trial_at: null,
  enrolled_at: null,
  ...o,
});
const W = { from: '2026-09-30T19:00:00Z', to: '2026-10-31T19:00:00Z' }; // October, Tashkent

test('funnel is cohort-based and never above 100%', () => {
  const rows = [
    L({ stage: 'contacted' }),
    L({ stage: 'trial', trial_at: '2026-10-06T06:00:00Z' }),
    L({ stage: 'enrolled', trial_at: '2026-10-06T06:00:00Z', enrolled_at: '2026-10-08T06:00:00Z' }),
    L({ stage: 'lost', lost_reason: 'Narx qimmat' }),
    L({ created_at: '2026-09-10T06:00:00Z', stage: 'enrolled', enrolled_at: '2026-10-02T06:00:00Z' }),
  ];
  const f = funnel(rows, W);
  assert.equal(f.leads, 4);
  assert.equal(f.contacted, 3);
  assert.equal(f.trial, 2);
  assert.equal(f.enrolled, 1);
  assert.equal(f.lost, 1);
  assert.equal(f.conv, 25);
  assert.equal(f.trialConv, 50);
  assert.equal(f.avgDays, 3);
  // A September arrival enrolled in October counts toward the month's contracts.
  assert.equal(enrolledIn(rows, W), 2);
});

test('sources: CPL, CAC and empty channels dropped', () => {
  const rows = [L({}), L({}), L({ stage: 'enrolled', enrolled_at: '2026-10-09T06:00:00Z' }), L({ source: 'telegram' })];
  const m = sourceMatrix(rows, W, { instagram: 300, google: 100 }, [W]);
  const ig = m.find((r) => r.source === 'instagram')!;
  assert.equal(ig.leads, 3);
  assert.equal(ig.cpl, 100);
  assert.equal(ig.cac, 300);
  assert.ok(m.find((r) => r.source === 'google')); // spend but no arrivals stays visible
  assert.ok(!m.find((r) => r.source === 'website'));
});

test('heatmap uses Tashkent weekday and hour', () => {
  // 2026-10-05 is a Monday; 06:00Z = 11:00 Tashkent.
  const h = heatmap([L({})], W);
  assert.equal(h[0][11], 1);
});

test('cohorts accumulate by months since arrival', () => {
  const rows = [
    L({ created_at: '2026-09-03T06:00:00Z', enrolled_at: '2026-09-20T06:00:00Z' }),
    L({ created_at: '2026-09-04T06:00:00Z', enrolled_at: '2026-10-03T06:00:00Z' }),
    L({ created_at: '2026-09-05T06:00:00Z' }),
    L({ created_at: '2026-09-06T06:00:00Z' }),
  ];
  const [sep, oct] = cohorts(rows, ['2026-09', '2026-10'], 2);
  assert.equal(sep.size, 4);
  assert.deepEqual(sep.pct, [25, 50, null]);
  assert.deepEqual(oct.pct, [null, null, null]);
});

test('pace, lost reasons and alerts', () => {
  const p = pace(10, 40, 10, 31);
  assert.equal(p.forecast, 31);
  assert.ok(p.pct! < 80);
  assert.ok(Math.abs(p.needPerDay! - 30 / 21) < 1e-9);
  assert.deepEqual(lostReasons([L({ stage: 'lost' }), L({ stage: 'lost', lost_reason: 'Narx qimmat' }), L({ stage: 'lost', lost_reason: 'Narx qimmat' })], W)[0], { reason: 'Narx qimmat', n: 2 });
  const f = funnel([], W);
  const a = alerts({ ...f, conv: 20 }, { ...f, conv: 35 }, [
    { source: 'telegram', leads: 0, enrolled: 0, conv: null, spend: 0, cpl: null, cac: null, trend: [9, 7, 4, 2] },
  ], p, pace(2, 10, 10, 31));
  assert.deepEqual(a.map((x) => x.id), ['won-pace', 'lead-pace', 'conv', 'fall-telegram']);
});
