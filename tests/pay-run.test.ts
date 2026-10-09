import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockers, canMove, computeLine, drift, shiftMonth, totals, type PayInput } from '../src/lib/pay-run';

const input = (over: Partial<PayInput> = {}): PayInput => ({
  staffId: 's1',
  name: 'Ali',
  role: 'teacher',
  components: [{ kind: 'base', title: 'Asosiy maosh', amount: 5_000_000 }],
  payments: [],
  prevPayable: null,
  kpiPending: false,
  selfDevPending: false,
  advancePending: false,
  ...over,
});

test('payable = base + kpi + bonuses + deductions; remaining = payable − paid', () => {
  const l = computeLine(
    input({
      components: [
        { kind: 'base', title: '', amount: 5_000_000 },
        { kind: 'kpi', title: 'KPI', amount: 750_000 },
        { kind: 'selfdev', title: '', amount: 200_000 },
        { kind: 'perf', title: 'Kechikish', amount: -100_000 },
        { kind: 'penalty', title: 'Jarima', amount: -50_000 },
      ],
      payments: [
        { id: 'a', kind: 'advance', title: 'Avans', amount: 1_000_000, at: null },
        { id: 'b', kind: 'salary', title: 'Oylik', amount: 2_000_000, at: null },
      ],
    }),
  );
  assert.equal(l.base, 5_000_000);
  assert.equal(l.kpi, 750_000);
  assert.equal(l.bonuses, 200_000);
  assert.equal(l.deductions, -150_000);
  assert.equal(l.payable, 5_800_000);
  assert.equal(l.advances, 1_000_000);
  assert.equal(l.paid, 3_000_000);
  assert.equal(l.remaining, 2_800_000);
  assert.deepEqual(l.flags, []);
});

test('flags: missing salary, negative pay, overpaid, variance', () => {
  assert.ok(computeLine(input({ components: [] })).flags.includes('noBase'));
  const neg = computeLine(input({ components: [{ kind: 'base', title: '', amount: 100 }, { kind: 'penalty', title: '', amount: -500 }] }));
  assert.ok(neg.flags.includes('negative'));
  const over = computeLine(input({ payments: [{ id: 'x', kind: 'salary', title: '', amount: 6_000_000, at: null }] }));
  assert.ok(over.flags.includes('overpaid'));
  assert.equal(over.remaining, -1_000_000);
  assert.ok(computeLine(input({ prevPayable: 3_000_000 })).flags.includes('variance'));
  assert.ok(!computeLine(input({ prevPayable: 4_800_000 })).flags.includes('variance'));
});

test('only negative pay blocks approval', () => {
  const ok = computeLine(input({ components: [] , payments: [{ id: 'p', kind: 'salary', title: '', amount: 1, at: null }] }));
  const bad = computeLine(input({ staffId: 's2', components: [{ kind: 'base', title: '', amount: 1 }, { kind: 'penalty', title: '', amount: -9 }] }));
  assert.deepEqual(blockers([ok, bad]).map((l) => l.staffId), ['s2']);
});

test('run moves one step at a time, both ways', () => {
  assert.equal(canMove('draft', 'review'), true);
  assert.equal(canMove('review', 'paid'), false);
  assert.equal(canMove('paid', 'approved'), true);
  assert.equal(canMove('approved', 'draft'), false);
});

test('totals, drift and month shifting', () => {
  const a = computeLine(input());
  const b = computeLine(input({ staffId: 's2', components: [{ kind: 'base', title: '', amount: 1_000_000 }] }));
  assert.equal(totals([a, b]).payable, 6_000_000);
  assert.deepEqual(drift([a, b], [{ staffId: 's1', payable: 5_000_000 }, { staffId: 's2', payable: 900_000 }]), [{ staffId: 's2', was: 900_000, now: 1_000_000 }]);
  assert.deepEqual(drift([a], null), []);
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
});
