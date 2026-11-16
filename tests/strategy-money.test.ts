/**
 * Strategiya › Moliya › Daromadlar va xarajatlar: every figure from the journal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moneyMonth, moneySeries, growth } from '../src/lib/strategy-money';
import type { Account, Entry } from '../src/lib/accounting';

const A: Account[] = [
  { code: '5010', name: 'Kassa', type: 'A' },
  { code: '5110', name: 'Bank', type: 'A' },
  { code: '6710', name: 'Mehnat haqi', type: 'L' },
  { code: '9030', name: 'Daromad', type: 'R' },
  { code: '9130', name: 'Tannarx', type: 'X' },
  { code: '9410', name: 'Marketing', type: 'X' },
];
let n = 0;
const e = (date: string, debit: string, credit: string, amount: number, source: string | null = null): Entry => ({
  id: String(++n), entry_date: date, doc: '', description: `${debit}/${credit}`, debit, credit, amount, source,
});

const J: Entry[] = [
  e('2026-10-20', '5010', '9030', 1_000_000, 'crm:a'),
  e('2026-11-02', '5010', '9030', 500_000, 'crm:b'),
  e('2026-11-03', '5110', '9030', 700_000, 'crm:c'),
  e('2026-11-04', '9030', '5110', 100_000, 'crm:d'), // refund
  e('2026-11-30', '9130', '6710', 400_000, 'payroll:2026-11:x'),
  e('2026-11-10', '9410', '5010', 150_000),
];

test('month: income nets refunds, expense by category, cash and margin', () => {
  const m = moneyMonth(A, {}, J, '2026-11');
  assert.equal(m.income, 1_100_000);
  assert.equal(m.refunds, 100_000);
  assert.equal(m.expense, 550_000);
  assert.equal(m.net, 550_000);
  assert.equal(m.margin, 50);
  assert.deepEqual(m.incomeBy.map((l) => [l.key, l.amount]), [['5110', 600_000], ['5010', 500_000]]);
  assert.deepEqual(m.expenseBy.map((l) => [l.key, l.amount]), [['payroll', 400_000], ['9410', 150_000]]);
  // Cash = everything up to month end: 1.0 + 0.5 − 0.15 kassa, 0.7 − 0.1 bank.
  assert.equal(m.cash, 1_950_000);
  assert.equal(m.lastIn[0].date, '2026-11-04');
  assert.equal(m.booked, true);
});

test('a month with nothing booked says so instead of pretending zero is a result', () => {
  const m = moneyMonth(A, {}, J, '2026-09');
  assert.equal(m.booked, false);
  assert.equal(m.margin, null);
});

test('series and growth', () => {
  const s = moneySeries(A, {}, J, '2026-11', 3);
  assert.deepEqual(s.map((x) => [x.ym, x.income]), [['2026-09', 0], ['2026-10', 1_000_000], ['2026-11', 1_100_000]]);
  assert.equal(growth(1_100_000, 1_000_000), 10);
  assert.equal(growth(5, 0), null);
});
