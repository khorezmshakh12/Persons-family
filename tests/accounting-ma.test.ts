import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledger, statements, type Account, type Asset, type Course, type Entry } from '../src/lib/accounting';
import {
  cashFlowStatement,
  cashForecast,
  cvp,
  flexBudget,
  nbvByCategory,
  ratios,
  reconcile,
  segmentPL,
  studentsForTarget,
  taxCalendar,
  tornado,
} from '../src/lib/accounting-ma';

const A: Account[] = [
  { code: '0100', name: 'AV', type: 'A' },
  { code: '0200', name: 'Eskirish', type: 'CA' },
  { code: '4010', name: 'Debitor', type: 'A' },
  { code: '5010', name: 'Kassa', type: 'A' },
  { code: '5110', name: 'Bank', type: 'A' },
  { code: '6710', name: 'Ish haqi', type: 'L' },
  { code: '8300', name: 'Kapital', type: 'E' },
  { code: '8710', name: 'Foyda', type: 'E' },
  { code: '9030', name: 'Daromad', type: 'R' },
  { code: '9130', name: 'Tannarx', type: 'X' },
  { code: '9410', name: 'Marketing', type: 'X' },
  { code: '9420', name: 'Mamuriy', type: 'X' },
  { code: '9430', name: 'Boshqa', type: 'X' },
  { code: '9810', name: 'Soliq', type: 'X' },
];
let n = 0;
const e = (d: string, dt: string, kt: string, amount: number): Entry => ({ id: String(++n), entry_date: d, doc: '', description: 'x', debit: dt, credit: kt, amount, source: null });
const opening = { '5110': 50_000_000, '8300': 50_000_000 };
const J = [
  e('2026-09-01', '4010', '9030', 20_000_000),
  e('2026-09-03', '5110', '4010', 15_000_000),
  e('2026-09-05', '0100', '5110', 12_000_000),
  e('2026-09-06', '5110', '8300', 5_000_000),
  e('2026-09-10', '9410', '5110', 2_000_000),
  e('2026-09-25', '9130', '6710', 6_000_000),
  e('2026-09-28', '6710', '5110', 5_280_000),
  e('2026-09-29', '5010', '5110', 1_000_000),
];
const C: Course[] = [
  { id: 'a', name: 'IELTS', fee: 1_000_000, students: 12, teacher_cost: 4_000_000, book_cost: 50_000 },
  { id: 'b', name: 'Kids', fee: 500_000, students: 10, teacher_cost: 3_000_000, book_cost: 20_000 },
];

test('cvp: break-even, margin of safety, profit', () => {
  const c = cvp(C, 5_000_000);
  assert.equal(c.N, 22);
  assert.equal(c.revenue, 17_000_000);
  assert.equal(c.direct, 7_000_000 + 600_000 + 200_000);
  assert.equal(c.profit, c.revenue - c.direct - 5_000_000);
  assert.ok(c.breakEven !== null && c.fee * c.breakEven - c.vc * c.breakEven >= 5_000_000 - 1);
  assert.equal(cvp([], 1).breakEven, null);
});

test('segmentPL: allocations sum to fixed for every driver; decision uses contribution', () => {
  for (const d of ['students', 'revenue', 'equal'] as const) {
    const s = segmentPL(C, 5_000_000, d);
    assert.equal(Math.round(s.reduce((a, r) => a + r.alloc, 0)), 5_000_000);
  }
  const s = segmentPL(C, 5_000_000, 'students');
  assert.equal(s[1].contribution, 5_000_000 - 3_000_000 - 200_000);
  assert.equal(s[1].keep, true);
});

test('flexBudget: volume + spending = total; static mode has no volume variance', () => {
  const L = [
    { code: '9030', name: 'Tushum', type: 'R' as const, plan: 20_000_000, actual: 22_000_000 },
    { code: '9130', name: 'Tannarx', type: 'X' as const, plan: 8_000_000, actual: 9_500_000 },
    { code: '9420', name: 'Mamuriy', type: 'X' as const, plan: 3_000_000, actual: 2_800_000 },
  ];
  const f = flexBudget(L, 100, 110, true);
  assert.equal(f.k, 1.1);
  for (const r of f.rows) assert.equal(Math.round((r.volume + r.spending) * 100), Math.round(r.total * 100));
  assert.equal(f.rows[2].volume, 0);
  assert.equal(f.rows[0].volume, 2_000_000);
  assert.equal(f.rows[1].volume, -800_000);
  assert.equal(f.plan, 9_000_000);
  assert.equal(f.actual, 22_000_000 - 9_500_000 - 2_800_000);
  assert.ok(flexBudget(L, 100, 110, false).rows.every((r) => r.volume === 0));
});

test('tornado + target students', () => {
  const t = tornado((p: { a: number; b: number }) => p.a * 3 + p.b, { a: 0, b: 0 }, 10);
  assert.equal(t[0].k, 'a');
  assert.equal(t[0].up, 30);
  assert.equal(studentsForTarget(5_000_000, 1_000_000, 300_000), 20);
  assert.equal(studentsForTarget(1, 1, 0), null);
});

test('cashFlowStatement: closing equals ledger cash; categories', () => {
  const cf = cashFlowStatement(A, opening, J, '2026-09-01', '2026-09-30');
  const L = ledger(A, opening, J, '2026-09-01', '2026-09-30');
  assert.equal(cf.closing, L['5010'].closing + L['5110'].closing);
  assert.equal(cf.inv, -12_000_000);
  assert.equal(cf.fin, 5_000_000);
  assert.equal(cf.op, 15_000_000 - 2_000_000 - 5_280_000);
});

test('reconcile: bridge ends exactly at FA net profit', () => {
  const s = statements(A, opening, J, '2026-09-01', '2026-09-30');
  const r = reconcile(C, s);
  assert.equal(r.fa, s.net);
  assert.equal(Math.round(r.ma + r.rows.reduce((a, x) => a + x.v, 0)), Math.round(s.net));
  const q = ratios(s);
  assert.ok(q.current !== null && q.current > 0);
});

test('cashForecast: straight-line from weekly averages', () => {
  const f = cashForecast(A, opening, J, '2026-09-30', 4, 13);
  const inflow = 15_000_000 + 5_000_000;
  assert.equal(f.avgIn, Math.round((inflow / 13) * 100) / 100);
  assert.equal(f.avgOut.capex, Math.round((12_000_000 / 13) * 100) / 100);
  assert.equal(f.weeks.length, 4);
  assert.equal(Math.round(f.weeks[3].closing), Math.round(f.opening + 4 * (f.avgIn - f.outTotal)));
});

test('nbvByCategory + taxCalendar', () => {
  const as: Asset[] = [{ id: '1', name: 'PC', category: 'IT', cost: 12_000_000, acquired: '2026-01-10', life_years: 1, disposed: null }];
  const v = nbvByCategory(as, ['2025-12', '2026-02', '2027-06']);
  assert.deepEqual(v[0].values, [0, 11_000_000, 0]);
  const cal = taxCalendar('2026-09', { pit: 1, social: 2, turnover: 3 });
  assert.equal(cal[0].date, '2026-10-15');
  assert.equal(cal.length, 3);
  assert.equal(taxCalendar('2026-12', { pit: 0, social: 0, turnover: 0 })[0].date, '2027-01-15');
});
