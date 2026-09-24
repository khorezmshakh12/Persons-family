import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TAX,
  cashWeeks,
  courseEconomics,
  depreciation,
  ledger,
  payrollPostings,
  payrollTaxes,
  statements,
  taxCompare,
  type Account,
  type Entry,
} from '../src/lib/accounting';

const A: Account[] = [
  { code: '0100', name: 'AV', type: 'A' },
  { code: '0200', name: 'Eskirish', type: 'CA' },
  { code: '4010', name: 'Debitor', type: 'A' },
  { code: '5110', name: 'Bank', type: 'A' },
  { code: '5010', name: 'Kassa', type: 'A' },
  { code: '6410', name: 'Soliq', type: 'L' },
  { code: '6520', name: 'Ijtimoiy', type: 'L' },
  { code: '6710', name: 'Ish haqi', type: 'L' },
  { code: '8300', name: 'Kapital', type: 'E' },
  { code: '8710', name: 'Foyda', type: 'E' },
  { code: '9030', name: 'Daromad', type: 'R' },
  { code: '9130', name: 'Tannarx', type: 'X' },
  { code: '9420', name: 'Mamuriy', type: 'X' },
];
let n = 0;
const e = (d: string, dt: string, kt: string, amount: number): Entry => ({
  id: String(++n), entry_date: d, doc: '', description: 'x', debit: dt, credit: kt, amount, source: null,
});
const opening = { '5110': 50_000_000, '8300': 50_000_000 };
const J = [
  e('2026-08-10', '4010', '9030', 10_000_000),
  e('2026-08-12', '5110', '4010', 8_000_000),
  e('2026-09-01', '4010', '9030', 20_000_000),
  e('2026-09-03', '5110', '4010', 15_000_000),
  e('2026-09-25', '9130', '6710', 6_000_000),
  e('2026-09-28', '6710', '5110', 5_280_000),
  e('2026-10-02', '5110', '4010', 1_000_000),
];

test('ledger: period opening rolls prior turnover; closing is natural-direction', () => {
  const L = ledger(A, opening, J, '2026-09-01', '2026-09-30');
  assert.equal(L['5110'].openingPeriod, 58_000_000);
  assert.equal(L['5110'].debit, 15_000_000);
  assert.equal(L['5110'].credit, 5_280_000);
  assert.equal(L['5110'].closing, 67_720_000);
  assert.equal(L['4010'].closing, 7_000_000); // 10-8 + 20-15
  assert.equal(L['6710'].closing, 720_000);
});

test('statements: P&L is the period only, balance sheet balances', () => {
  const s = statements(A, opening, J, '2026-09-01', '2026-09-30');
  assert.equal(s.revenue, 20_000_000);
  assert.equal(s.cogs, 6_000_000);
  assert.equal(s.net, 14_000_000);
  assert.equal(s.retained, 24_000_000); // Aug 10m + Sep 14m
  assert.equal(s.imbalance, 0);
  assert.equal(s.assets, s.liabilities + s.equity);
});

test('depreciation: starts the month after purchase, capped at life', () => {
  const a = { id: '1', name: 'PC', category: '', cost: 36_000_000, acquired: '2025-09-15', life_years: 3, disposed: null };
  assert.equal(depreciation(a, '2025-09').charge, 0);
  assert.equal(depreciation(a, '2025-10').charge, 1_000_000);
  assert.equal(depreciation(a, '2026-09').accumulated, 12_000_000);
  assert.equal(depreciation(a, '2030-01').accumulated, 36_000_000);
  assert.equal(depreciation(a, '2030-01').charge, 0);
});

test('payroll: taxes and postings keep 6710 consistent', () => {
  const rows = [
    { staffId: 'a', name: 'T', role: 'teacher', gross: 5_000_000, paid: 4_400_000 },
    { staffId: 'b', name: 'M', role: 'mmd', gross: 3_000_000, paid: 0 },
  ];
  const p = payrollTaxes(rows, DEFAULT_TAX);
  assert.equal(p.pit, 960_000);
  assert.equal(p.social, 960_000);
  assert.equal(p.grossTeach, 5_000_000);
  const posts = payrollPostings('2026-09', rows, DEFAULT_TAX);
  const sum = (dt: string, kt: string) => posts.filter((x) => x.debit === dt && x.credit === kt).reduce((a, x) => a + x.amount, 0);
  assert.equal(sum('9130', '6710') + sum('9420', '6710'), 8_000_000);
  assert.equal(sum('6710', '5110'), 4_400_000);
  assert.ok(posts.every((x) => x.amount > 0 && x.source.startsWith('payroll:2026-09:')));
  assert.equal(new Set(posts.map((x) => x.source)).size, posts.length);
});

test('tax compare + course economics', () => {
  const t = taxCompare(100_000_000, 30_000_000, DEFAULT_TAX);
  assert.equal(t.turnover, 4_000_000);
  assert.equal(t.profit, 4_500_000);
  assert.equal(t.better, 'turn');
  const c = courseEconomics({ id: '1', name: 'IELTS', fee: 600_000, students: 20, teacher_cost: 4_000_000, book_cost: 50_000 });
  assert.equal(c.revenue, 12_000_000);
  assert.equal(c.contribution, 7_000_000);
  assert.equal(c.breakEven, 8);
});

test('cash weeks: inflow/outflow per Monday-week and running balance', () => {
  const w = cashWeeks(A, opening, J, '2026-09-30', 5);
  // The last week (Mon 28-Sep … Sun 4-Oct) also takes the 2-Oct receipt.
  assert.equal(w.at(-1)!.closing, 68_720_000);
  assert.equal(w.at(-1)!.inflow, 1_000_000);
  assert.equal(w.at(-1)!.outflow, 5_280_000);
  const first = w[0];
  const moved = w.reduce((a, x) => a + x.inflow - x.outflow, 0);
  assert.equal(first.closing - (first.inflow - first.outflow) + moved, 68_720_000);
});
