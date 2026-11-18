import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockers, computeLine, drift, effectivePeriod, shiftMonth, totals, type PayInput, payState } from '../src/lib/pay-run';

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

test('payable = paid + kpi + bonuses + deductions; no fixed salary, nothing owed (2026-11-18)', () => {
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
  assert.equal(l.base, 0);
  assert.equal(l.kpi, 750_000);
  assert.equal(l.bonuses, 200_000);
  assert.equal(l.deductions, -150_000);
  assert.equal(l.advances, 1_000_000);
  assert.equal(l.paid, 3_000_000);
  assert.equal(l.payable, 3_800_000);
  assert.equal(l.remaining, 0);
  assert.deepEqual(l.flags, []);
});

test('owner example: 1 000 000 avans + 3 000 000 oylik + 500 000 bonus − 200 000 jarima = 4 300 000', () => {
  const l = computeLine(
    input({
      components: [
        { kind: 'adjustment', title: 'Bonus', amount: 500_000 },
        { kind: 'penalty', title: 'Jarima', amount: -200_000 },
      ],
      payments: [
        { id: 'a', kind: 'advance', title: 'Avans', amount: 1_000_000, at: null },
        { id: 'b', kind: 'salary', title: 'Oylik', amount: 3_000_000, at: null },
      ],
    }),
  );
  assert.equal(l.payable, 4_300_000);
  assert.equal(l.remaining, 0);
});

test('flags: negative pay and variance; no "missing salary" or "overpaid" any more', () => {
  assert.deepEqual(computeLine(input({ components: [] })).flags, []);
  const neg = computeLine(input({ components: [{ kind: 'penalty', title: '', amount: -500 }] }));
  assert.ok(neg.flags.includes('negative'));
  const paidMore = computeLine(input({ payments: [{ id: 'x', kind: 'salary', title: '', amount: 6_000_000, at: null }] }));
  assert.deepEqual(paidMore.flags, []);
  const paid = [{ id: 'x', kind: 'salary' as const, title: '', amount: 5_000_000, at: null }];
  assert.ok(computeLine(input({ payments: paid, prevPayable: 3_000_000 })).flags.includes('variance'));
  assert.ok(!computeLine(input({ payments: paid, prevPayable: 4_800_000 })).flags.includes('variance'));
});

test('only negative pay blocks approval', () => {
  const ok = computeLine(input({ components: [], payments: [{ id: 'p', kind: 'salary', title: '', amount: 1, at: null }] }));
  const bad = computeLine(input({ staffId: 's2', components: [{ kind: 'penalty', title: '', amount: -9 }] }));
  assert.deepEqual(blockers([ok, bad]).map((l) => l.staffId), ['s2']);
});

test('payState: the month is running or closed', () => {
  assert.equal(payState('2026-11-01', '2026-11-01'), 'Oy davom etyapti');
  assert.equal(payState('2026-12-01', '2026-11-01'), 'Oy davom etyapti');
  assert.equal(payState('2026-10-01', '2026-11-01'), 'Yakunlandi');
});

test('totals, drift and month shifting', () => {
  const a = computeLine(input({ payments: [{ id: 'p', kind: 'salary', title: '', amount: 5_000_000, at: null }] }));
  const b = computeLine(input({ staffId: 's2', payments: [{ id: 'q', kind: 'advance', title: '', amount: 1_000_000, at: null }] }));
  assert.equal(totals([a, b]).payable, 6_000_000);
  assert.deepEqual(drift([a, b], [{ staffId: 's1', payable: 5_000_000 }, { staffId: 's2', payable: 900_000 }]), [{ staffId: 's2', was: 900_000, now: 1_000_000 }]);
  assert.deepEqual(drift([a], null), []);
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
});

test('effectivePeriod: a movement stays in its own Tashkent month while that month is open', () => {
  assert.equal(effectivePeriod('2026-09-15T10:00:00Z', new Map()), '2026-09-01');
  // 30 Sep 20:00 UTC is already 1 Oct in Tashkent (UTC+5).
  assert.equal(effectivePeriod('2026-09-30T20:00:00Z', new Map()), '2026-10-01');
});

test('effectivePeriod: counted before approval stays; created after approval rolls forward', () => {
  const locks = new Map([['2026-09-01', '2026-09-28T09:00:00.000Z']]);
  assert.equal(effectivePeriod('2026-09-20T10:00:00Z', locks), '2026-09-01');
  assert.equal(effectivePeriod('2026-09-28T09:00:00Z', locks), '2026-09-01');
  assert.equal(effectivePeriod('2026-09-29T10:00:00Z', locks), '2026-10-01');
});

test('effectivePeriod: rolls past every month approved before the movement', () => {
  const locks = new Map([
    ['2026-09-01', '2026-09-10T00:00:00.000Z'],
    ['2026-10-01', '2026-09-12T00:00:00.000Z'],
  ]);
  assert.equal(effectivePeriod('2026-09-15T00:00:00Z', locks), '2026-11-01');
});

test('old carry / split-advance rows are neither money given nor earnings', () => {
  const l = computeLine(
    input({
      components: [
        { kind: 'penalty', title: 'Jarima', amount: -100_000 },
        { kind: 'carry', title: 'Ortiqcha to‘lov', amount: -400_000 },
        { kind: 'advshift', title: 'Avans qaytarish 2/3', amount: -300_000 },
      ],
      payments: [{ id: 'a', kind: 'advance', title: 'Avans', amount: 900_000, at: null }],
    }),
  );
  assert.equal(l.deductions, -100_000);
  assert.equal(l.carry, 0);
  assert.equal(l.advanceShift, 0);
  assert.equal(l.payable, 800_000);
});

test('a pending advance blocks approval', () => {
  const l = computeLine(input({ advancePending: true }));
  assert.ok(l.flags.includes('advancePending'));
  assert.deepEqual(blockers([l]).map((x) => x.staffId), ['s1']);
});
