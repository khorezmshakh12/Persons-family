/**
 * Finance › Moliya (Monitor/index.html 1:1): the month summary, status and
 * salary carry-forward must match Monitor's own calculateEmployeeMonthSummary
 * / getEmployeeSalaryForMonth. Pure — no DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEmployeeMonthSummary as sum, getEmployeeSalaryForMonth, getStatusText, shiftYearMonth, formatUZS, type MonEmp, type MonTx } from '../src/lib/monitor';

const emp = (id: string, salaries: Record<string, number>, requested: Record<string, boolean> = {}): MonEmp => ({ id, firstName: 'A', lastName: 'B', role: 'r', salaries, requested });
let n = 0;
const tx = (staffId: string, type: MonTx['type'], amount: number, month: string): MonTx => ({ id: String(++n), staffId, type, amount, month, reason: 'x', createdAt: '', entryId: null, auto: false });

test('Monitor seed: Nilufar prev month leaves 500 000 unpaid (PARTIAL)', () => {
  const e = emp('e2', { '2026-10': 6_500_000 });
  const s = sum(e, [tx('e2', 'PENALTY', 200_000, '2026-10'), tx('e2', 'AVANS', 2_500_000, '2026-10'), tx('e2', 'SALARY_PAY', 3_300_000, '2026-10')], '2026-10');
  assert.equal(s.netPayable, 6_300_000);
  assert.equal(s.remainingToPay, 500_000);
  assert.equal(s.status, 'PARTIAL');
  assert.equal(getStatusText(s), 'Qisman berilgan');
  assert.equal(s.paidPercent, 92);
});

test('overpaid, paid, unpaid and avans-only states', () => {
  const e = emp('e', { '2026-11': 1_000_000 });
  assert.equal(sum(e, [tx('e', 'AVANS', 1_200_000, '2026-11')], '2026-11').status, 'OVERPAID');
  assert.equal(sum(e, [tx('e', 'SALARY_PAY', 1_000_000, '2026-11')], '2026-11').status, 'PAID');
  assert.equal(sum(e, [], '2026-11').status, 'UNPAID');
  assert.equal(getStatusText(sum(e, [tx('e', 'AVANS', 100, '2026-11')], '2026-11')), 'Avans olgan');
  // Another month's money never leaks in.
  assert.equal(sum(e, [tx('e', 'AVANS', 500, '2026-10')], '2026-11').totalPaid, 0);
  assert.equal(sum(emp('z', {}), [], '2026-11').status, 'PAID');
});

test('salary carries forward from the nearest earlier month only', () => {
  const e = emp('e', { '2026-08': 5, '2026-10': 7 });
  assert.equal(getEmployeeSalaryForMonth(e, '2026-07'), 0);
  assert.equal(getEmployeeSalaryForMonth(e, '2026-09'), 5);
  assert.equal(getEmployeeSalaryForMonth(e, '2026-12'), 7);
});

test('helpers', () => {
  assert.equal(shiftYearMonth('2026-01', -1), '2025-12');
  assert.equal(shiftYearMonth('2026-12', 1), '2027-01');
  assert.equal(formatUZS(-1234567), "−1 234 567 so'm");
  assert.equal(sum(emp('e', {}, { '2026-11': true }), [], '2026-11').avansRequested, true);
});
