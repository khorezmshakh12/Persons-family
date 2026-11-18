/**
 * Finance › Moliya (Monitor): the month summary and status. No fixed salary
 * (owner, 2026-11-18): a month's pay is everything given (avans + oylik) +
 * bonus − jarima, and it must equal the pay-run engine's month. Pure — no DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine } from '../src/lib/pay-run';
import { calculateEmployeeMonthSummary as sum, getStatusText, shiftYearMonth, formatUZS, type MonEmp, type MonTx } from '../src/lib/monitor';

const emp = (id: string, requested: Record<string, boolean> = {}): MonEmp => ({ id, firstName: 'A', lastName: 'B', role: 'r', requested });
let n = 0;
const tx = (staffId: string, type: MonTx['type'], amount: number, month: string): MonTx => ({ id: String(++n), staffId, type, amount, month, reason: 'x', createdAt: '', entryId: null, auto: false });

test('oylik = avans + oylik berish + bonus − jarima (owner example: 4 300 000)', () => {
  const s = sum(
    emp('e'),
    [tx('e', 'AVANS', 1_000_000, '2026-11'), tx('e', 'SALARY_PAY', 3_000_000, '2026-11'), tx('e', 'BONUS', 500_000, '2026-11'), tx('e', 'PENALTY', 200_000, '2026-11')],
    '2026-11',
  );
  assert.equal(s.totalPaid, 4_000_000);
  assert.equal(s.bonusTotal, 500_000);
  assert.equal(s.penaltyTotal, 200_000);
  assert.equal(s.netPayable, 4_300_000);
});

test('status says only what was given: nothing, an avans, or the salary', () => {
  const e = emp('e');
  assert.equal(sum(e, [], '2026-11').status, 'UNPAID');
  assert.equal(getStatusText(sum(e, [], '2026-11')), 'Hali berilmagan');
  assert.equal(getStatusText(sum(e, [tx('e', 'AVANS', 100, '2026-11')], '2026-11')), 'Avans olgan');
  assert.equal(getStatusText(sum(e, [tx('e', 'AVANS', 100, '2026-11'), tx('e', 'SALARY_PAY', 900, '2026-11')], '2026-11')), 'Oylik berilgan');
  // A bonus alone is not money given.
  assert.equal(sum(e, [tx('e', 'BONUS', 100, '2026-11')], '2026-11').status, 'UNPAID');
  // Another month's money never leaks in.
  assert.equal(sum(e, [tx('e', 'AVANS', 500, '2026-10')], '2026-11').netPayable, 0);
});

test('helpers', () => {
  assert.equal(shiftYearMonth('2026-01', -1), '2025-12');
  assert.equal(shiftYearMonth('2026-12', 1), '2027-01');
  assert.equal(formatUZS(-1234567), "−1 234 567 so'm");
  assert.equal(sum(emp('e', { '2026-11': true }), [], '2026-11').avansRequested, true);
});

test('old advance bookkeeping rows (carry / split advance) are ignored', () => {
  const hold = { ...tx('e', 'PENALTY', 300_000, '2026-11'), shift: true };
  const s = sum(emp('e'), [hold, tx('e', 'BONUS', 50_000, '2026-11'), tx('e', 'AVANS', 1_000_000, '2026-11')], '2026-11');
  assert.equal(s.penaltyTotal, 0);
  assert.equal(s.netPayable, 1_050_000);
});

test('one algorithm: Monitor month = pay-run engine month', () => {
  const comps = [
    { kind: 'base' as const, title: 'b', amount: 4_000_000 },
    { kind: 'kpi' as const, title: 'k', amount: 300_000 },
    { kind: 'penalty' as const, title: 'j', amount: -100_000 },
    { kind: 'carry' as const, title: 'c', amount: -500_000 },
    { kind: 'advshift' as const, title: 'a', amount: 200_000 },
  ];
  const line = computeLine({
    staffId: 'e', name: 'A', role: 'r', components: comps, prevPayable: null, kpiPending: false, selfDevPending: false, advancePending: false,
    payments: [{ id: 'p1', kind: 'advance', title: 'a', amount: 1_000_000, at: null }, { id: 'p2', kind: 'salary', title: 's', amount: 2_000_000, at: null }],
  });
  const txs: MonTx[] = [
    ...comps.filter((c) => c.kind !== 'base').map((c) => ({ ...tx('e', c.amount > 0 ? 'BONUS' : 'PENALTY', Math.abs(c.amount), '2026-11'), shift: c.kind === 'carry' || c.kind === 'advshift' })),
    tx('e', 'AVANS', 1_000_000, '2026-11'),
    tx('e', 'SALARY_PAY', 2_000_000, '2026-11'),
  ];
  const s = sum(emp('e'), txs, '2026-11');
  assert.equal(line.payable, 3_200_000);
  assert.equal(s.netPayable, line.payable);
  assert.equal(s.totalPaid, line.paid);
  assert.equal(s.bonusTotal - s.penaltyTotal, line.kpi + line.bonuses + line.deductions);
});
