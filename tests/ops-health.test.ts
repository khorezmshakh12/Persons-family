import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeOn, addMonthsToDay, computeHealth, monthEnd, type HealthInput, type HealthStudent } from '../src/lib/ops-health';

const stu = (over: Partial<HealthStudent>): HealthStudent => ({
  id: over.name ?? 'x',
  name: 'x',
  status: 'active',
  created: '2026-08-01',
  activated: '2026-08-05',
  left: null,
  leaveReason: '',
  fee: 450_000,
  balance: 0,
  hasParentPhone: true,
  inGroup: true,
  ...over,
});

const input = (students: HealthStudent[], over: Partial<HealthInput> = {}): HealthInput => ({
  month: '2026-10-01',
  today: '2026-10-28',
  students,
  leads: [],
  groups: [],
  collected: {},
  attendance: { present: 0, marked: 0 },
  paidAllTime: { total: 0, students: 0 },
  ...over,
});

test('month helpers clamp to the last day', () => {
  assert.equal(monthEnd('2026-02-01'), '2026-02-28');
  assert.equal(addMonthsToDay('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsToDay('2026-11-15', 2), '2027-01-15');
});

test('faol needs activation, a fee, not frozen and not archived by the day', () => {
  assert.equal(activeOn(stu({}), '2026-08-04'), false);
  assert.equal(activeOn(stu({}), '2026-08-05'), true);
  assert.equal(activeOn(stu({ left: '2026-09-10' }), '2026-09-10'), false);
  assert.equal(activeOn(stu({ fee: 0 }), '2026-09-01'), false);
  assert.equal(activeOn(stu({ status: 'frozen' }), '2026-09-01'), false);
});

test('month counts: start, end, new, left and churn among faol', () => {
  const h = computeHealth(
    input([
      stu({ name: 'a' }),
      stu({ name: 'b', activated: '2026-10-03' }),
      stu({ name: 'c', left: '2026-10-12', leaveReason: 'Narx' }),
      stu({ name: 'd', activated: null }),
      stu({ name: 'e', activated: null, left: '2026-10-02' }),
    ]),
  );
  assert.equal(h.students.activeStart, 2);
  assert.equal(h.students.activeEnd, 2);
  assert.deepEqual(h.students.newActive.map((x) => x.name), ['b']);
  assert.deepEqual(h.students.left.map((x) => x.name), ['c', 'e']);
  assert.equal(h.students.leftActive, 1);
  assert.equal(h.students.churnPct, 50);
  assert.deepEqual(h.students.waiting.map((x) => x.name), ['d']);
  assert.equal(h.to, '2026-10-28');
});

test('money: expected from faol fees, debt only from live students, forecast adds waiting', () => {
  const h = computeHealth(
    input(
      [
        stu({ name: 'a', balance: -900_000 }),
        stu({ name: 'b', balance: -100_000, fee: 300_000 }),
        stu({ name: 'c', activated: null, fee: 200_000 }),
        stu({ name: 'z', left: '2026-09-01', balance: -5_000_000 }),
      ],
      { collected: { '2026-10-01': 600_000 } },
    ),
  );
  assert.equal(h.money.expected, 750_000);
  assert.equal(h.money.collectedPct, 80);
  assert.equal(h.money.debt, 1_000_000);
  assert.equal(h.money.bigDebtors, 1);
  assert.equal(h.money.forecast, 950_000);
});

test('funnel follows leads made this month to a first payment', () => {
  const h = computeHealth(
    input([stu({ id: 's1', name: 's1', activated: '2026-10-10' }), stu({ id: 's2', name: 's2', activated: null })], {
      leads: [
        { created: '2026-10-04', source: 'Telegram', trial: true, studentId: 's1', lostReason: '' },
        { created: '2026-10-05', source: 'Telegram', trial: true, studentId: 's2', lostReason: '' },
        { created: '2026-10-06', source: 'Instagram', trial: false, studentId: null, lostReason: 'Narx' },
        { created: '2026-09-30', source: 'Instagram', trial: false, studentId: null, lostReason: '' },
      ],
    }),
  );
  assert.deepEqual([h.funnel.leads, h.funnel.trial, h.funnel.converted, h.funnel.paid], [3, 2, 2, 1]);
  assert.equal(h.funnel.avgDays, 6);
  assert.deepEqual(h.funnel.sources[0], { source: 'Telegram', leads: 2, paid: 1 });
  assert.deepEqual(h.funnel.lost, [{ reason: 'Narx', n: 1 }]);
});

test('cohort keeps a share only once every member reached that month', () => {
  const h = computeHealth(
    input([
      stu({ name: 'a', activated: '2026-08-05' }),
      stu({ name: 'b', activated: '2026-08-20', left: '2026-09-25' }),
    ]),
  );
  const aug = h.cohorts.find((c) => c.month === '2026-08-01')!;
  assert.equal(aug.n, 2);
  assert.deepEqual(aug.kept, [100, 50, null, null]);
});
