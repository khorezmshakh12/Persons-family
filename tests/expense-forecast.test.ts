/**
 * Xarajat turlari + keyingi oy prognozi (2026-11-19).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backtest, expenseRows, forecastMonth, forecastType, median, payrollBase, type ExpenseRow } from '../src/lib/expense-forecast';
import { moneyMonth } from '../src/lib/strategy-money';
import type { Account, Entry } from '../src/lib/accounting';

const A: Account[] = [
  { code: '5010', name: 'Kassa', type: 'A' },
  { code: '6710', name: 'Mehnat haqi', type: 'L' },
  { code: '9030', name: 'Daromad', type: 'R' },
  { code: '9130', name: 'Tannarx', type: 'X' },
  { code: '9420', name: 'Ma’muriy', type: 'X' },
  { code: '9430', name: 'Boshqa', type: 'X' },
];
let n = 0;
const e = (date: string, debit: string, credit: string, amount: number, cat: string | null = null, source: string | null = null): Entry => ({
  id: String(++n), entry_date: date, doc: '', description: '', debit, credit, amount, source, cat,
});
const rows = (key: string, list: [string, number][]): ExpenseRow[] => list.map(([date, amount]) => ({ key, date, amount }));

test('median', () => {
  assert.equal(median([]), 0);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('monthly: regular type → median of the last 3 months with spend', () => {
  const r = rows('util', [['2026-07-09', 1_390_000], ['2026-08-10', 3_800_000], ['2026-09-09', 1_750_000], ['2026-10-15', 1_995_000], ['2026-11-02', 2_000_000]]);
  const f = forecastType('util', r, '2026-11-20', '2026-12');
  assert.equal(f.kind, 'monthly');
  assert.equal(f.activeMonths, 4);
  assert.equal(f.amount, 1_995_000); // median(1.75, 1.995, 2.0)
  assert.equal(f.payments, 5);
});

test('frequent: gap ≤ 10 days → 90-day daily rate × days of the target month', () => {
  const list: [string, number][] = [];
  for (let d = 0; d < 120; d += 3) list.push([new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10), 30_000]);
  const f = forecastType('house', rows('house', list), '2026-11-30', '2026-12');
  assert.equal(f.kind, 'frequent');
  assert.equal(f.gapDays, 3);
  // from 1-Sep (90 days before 30-Nov): 29 payments × 30 000 = 870 000 → ÷ 90 × 31 = 299 667
  assert.equal(f.amount, 300_000);
});

test('periodic: next payment inside the target month counts, outside it does not', () => {
  const r = rows('tax', [['2026-03-10', 2_400_000], ['2026-06-10', 2_400_000], ['2026-09-10', 2_400_000]]);
  const hit = forecastType('tax', r, '2026-11-20', '2026-12');
  assert.equal(hit.kind, 'periodic');
  assert.equal(hit.next, '2026-12-11'); // gaps 92 + 92 days → median 92 after 10-Sep
  assert.equal(hit.amount, 2_400_000);
  const miss = forecastType('tax', r, '2026-11-20', '2027-01');
  assert.equal(miss.amount, 0);
});

test('few: a type seen in 1–2 months forecasts 0 and asks for a cycle', () => {
  const r = rows('books', [['2026-10-31', 3_460_000], ['2026-11-04', 3_610_000]]);
  const f = forecastType('books', r, '2026-11-20', '2026-12');
  assert.equal(f.kind, 'few');
  assert.equal(f.amount, 0);
  assert.equal(f.gapDays, 4);
});

test('hand-set cycle wins over detection', () => {
  const r = rows('books', [['2026-10-31', 3_460_000], ['2026-11-04', 3_610_000]]);
  assert.equal(forecastType('books', r, '2026-11-20', '2026-12', 'monthly').amount, 3_535_000);
  assert.equal(forecastType('books', r, '2026-11-20', '2026-12', 'once').amount, 0);
  const q = forecastType('books', r, '2026-11-20', '2027-02', 'quarter');
  assert.equal(q.next, '2027-02-03');
  assert.equal(q.amount, 3_535_000);
});

test('rows on or after asOf and older than 180 days are ignored', () => {
  const r = rows('x', [['2026-01-01', 9_000_000], ['2026-11-20', 9_000_000]]);
  const f = forecastType('x', r, '2026-11-20', '2026-12');
  assert.equal(f.kind, 'none');
  assert.equal(f.payments, 0);
});

test('expenseRows: typed rows by type, untyped by account, payroll and refunds out, reversals negative', () => {
  const J = [
    e('2026-11-02', '9430', '5010', 100_000, 'water'),
    e('2026-11-03', '9430', '5010', 50_000),
    e('2026-11-04', '5010', '9430', 20_000, 'water'), // reversal
    e('2026-11-05', '9030', '5010', 1_500_000, 'refund'), // lowers income, not an expense
    e('2026-11-30', '9130', '6710', 4_000_000, null, 'payroll:2026-11:a'),
  ];
  assert.deepEqual(
    expenseRows(A, J).map((r) => [r.key, r.amount]),
    [['water', 100_000], ['acc:9430', 50_000], ['water', -20_000]],
  );
});

test('payrollBase: the latest payroll month before the target', () => {
  const J = [
    e('2026-09-30', '9130', '6710', 13_664_000, null, 'payroll:2026-09:t'),
    e('2026-09-30', '9420', '6710', 21_280_000, null, 'payroll:2026-09:a'),
    e('2026-09-30', '6710', '6410', 3_744_000, null, 'payroll:2026-09:tax'), // not an expense
    e('2026-12-31', '9130', '6710', 1, null, 'payroll:2026-12:t'),
  ];
  assert.deepEqual(payrollBase(A, J, '2026-12'), { month: '2026-09', amount: 34_944_000 });
  assert.equal(payrollBase(A, J, '2026-09'), null);
});

test('forecastMonth sums the types and payroll; backtest compares with the real month', () => {
  const J = [
    e('2026-08-05', '9430', '5010', 180_000, 'water'),
    e('2026-09-05', '9430', '5010', 180_000, 'water'),
    e('2026-10-05', '9430', '5010', 180_000, 'water'),
    e('2026-11-05', '9430', '5010', 180_000, 'water'),
    e('2026-10-30', '9130', '6710', 1_000_000, null, 'payroll:2026-10:t'),
  ];
  const f = forecastMonth(A, J, {}, '2026-11-20', '2026-12');
  assert.equal(f.types.length, 1);
  assert.equal(f.types[0].amount, 180_000);
  assert.deepEqual(f.payroll, { month: '2026-10', amount: 1_000_000 });
  assert.equal(f.total, 1_180_000);
  // November known from 1-Nov: water monthly 180 000 + October payroll 1 000 000; real November = 180 000.
  const b = backtest(A, J, {}, '2026-11');
  assert.equal(b.forecast, 1_180_000);
  assert.equal(b.actual, 180_000);
  assert.equal(b.accuracy, 0);
});

test('moneyMonth: two types on one account stay apart', () => {
  const J = [e('2026-11-02', '9430', '5010', 100_000, 'water'), e('2026-11-03', '9430', '5010', 300_000, 'util'), e('2026-11-04', '9430', '5010', 50_000)];
  const m = moneyMonth(A, {}, J, '2026-11', { water: 'Ichimlik suvi', util: 'Kommunal' });
  assert.deepEqual(m.expenseBy.map((l) => [l.key, l.name, l.amount]), [['cat:util', 'Kommunal', 300_000], ['cat:water', 'Ichimlik suvi', 100_000], ['9430', 'Boshqa', 50_000]]);
  assert.equal(m.expense, 450_000);
});
