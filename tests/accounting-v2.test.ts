import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxKind, isCashCode } from '../src/lib/accounting-cash';
import { cashWeeks, statements, type Account, type Entry } from '../src/lib/accounting';
import { cashFlowStatement } from '../src/lib/accounting-ma';

test('cash box codes: 50xx naqd, 51xx bank/karta, nothing else', () => {
  for (const c of ['5010', '5011', '5099', '5110', '5150']) assert.equal(isCashCode(c), true, c);
  for (const c of ['4010', '6710', '5210', '501', '50100']) assert.equal(isCashCode(c), false, c);
  assert.equal(boxKind('5012'), 'cash');
  assert.equal(boxKind('5111'), 'bank');
});

const accounts: Account[] = [
  { code: '5010', name: 'Kassa', type: 'A' },
  { code: '5110', name: 'Bank', type: 'A' },
  { code: '5111', name: 'Click', type: 'A' },
  { code: '6710', name: 'Mehnat haqi', type: 'L' },
  { code: '8300', name: 'Ustav', type: 'E' },
  { code: '9030', name: 'Daromad', type: 'R' },
];
const e = (id: string, entry_date: string, debit: string, credit: string, amount: number, source: string | null = null): Entry =>
  ({ id, entry_date, doc: '', description: id, debit, credit, amount, source, receipt_path: null }) as Entry;

test('a new kassa counts as cash in every report', () => {
  const entries = [
    e('a', '2026-10-01', '5010', '8300', 1000),
    e('b', '2026-10-02', '5111', '9030', 500),
    e('c', '2026-10-03', '6710', '5111', 200, 'pay:2026-10-01:x'),
    // Moving money between two boxes is not a cash flow.
    e('d', '2026-10-04', '5111', '5010', 100),
  ];
  const s = statements(accounts, {}, entries, '2026-10-01', '2026-10-31');
  assert.equal(s.cash, 1300);
  const cf = cashFlowStatement(accounts, {}, entries, '2026-10-01', '2026-10-31');
  assert.equal(cf.op + cf.inv + cf.fin, 1300);
  const w = cashWeeks(accounts, {}, entries, '2026-10-05', 2);
  assert.equal(w.at(-1)?.closing, 1300);
});
