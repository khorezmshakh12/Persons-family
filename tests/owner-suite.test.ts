import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assetOnBooks,
  depreciation,
  disposalPostings,
  fmtGrowth,
  growthRate,
  ledger,
  type Account,
  type Asset,
  type Entry,
} from '../src/lib/accounting';
import { budgetTotals, normalizeBudget, progressForStatus } from '../src/lib/strategy';

const asset: Asset = {
  id: 'a1',
  name: 'Noutbuk',
  category: 'IT',
  cost: 12_000_000,
  acquired: '2026-01-15',
  life_years: 1,
  disposed: null,
};

test('disposalPostings writes the asset off at cost: Dt 0200 + Dt 9430 = Kt 0100', () => {
  assert.deepEqual(disposalPostings(asset), []);
  const rows = disposalPostings({ ...asset, disposed: '2026-04-10' });
  // Feb, Mar, Apr charged (starts the month after purchase, incl. disposal month).
  assert.equal(depreciation({ ...asset, disposed: '2026-04-10' }, '2026-04').accumulated, 3_000_000);
  assert.deepEqual(
    rows.map((r) => [r.debit, r.credit, r.amount]),
    [
      ['0200', '0100', 3_000_000],
      ['9430', '0100', 9_000_000],
    ],
  );
  assert.equal(rows.reduce((a, r) => a + r.amount, 0), asset.cost);
});

test('disposal clears the asset from the ledger when booked together with depreciation', () => {
  const A: Account[] = [
    { code: '0100', name: 'AV', type: 'A' },
    { code: '0200', name: 'Eskirish', type: 'CA' },
    { code: '5110', name: 'Bank', type: 'A' },
    { code: '9420', name: 'Admin', type: 'X' },
    { code: '9430', name: 'Other', type: 'X' },
  ];
  const disposed = { ...asset, disposed: '2026-04-10' };
  const e = (id: string, date: string, debit: string, credit: string, amount: number): Entry => ({
    id, entry_date: date, doc: '', description: '', debit, credit, amount, source: null,
  });
  const entries: Entry[] = [
    e('buy', '2026-01-15', '0100', '5110', asset.cost),
    ...['2026-02', '2026-03', '2026-04'].map((m) => e(`d${m}`, `${m}-28`, '9420', '0200', depreciation(disposed, m).charge)),
    ...disposalPostings(disposed).map((r, i) => e(`x${i}`, '2026-04-10', r.debit, r.credit, r.amount)),
  ];
  const L = ledger(A, {}, entries, '2026-04-01', '2026-04-30');
  assert.equal(L['0100'].closing, 0);
  assert.equal(L['0200'].closing, 0);
  // No depreciation after disposal.
  assert.equal(depreciation(disposed, '2026-05').charge, 0);
});

test('assetOnBooks: acquired by month end and not yet disposed', () => {
  assert.equal(assetOnBooks(asset, '2025-12'), false);
  assert.equal(assetOnBooks(asset, '2026-01'), true);
  assert.equal(assetOnBooks({ ...asset, disposed: '2026-04-10' }, '2026-03'), true);
  assert.equal(assetOnBooks({ ...asset, disposed: '2026-04-10' }, '2026-04'), false);
});

test('growthRate handles zero and negative bases', () => {
  assert.equal(growthRate(110, 100), 0.1);
  assert.equal(growthRate(5, 0), null);
  assert.equal(growthRate(0, -100), 1); // loss of 100 → break-even is +100%
  assert.equal(fmtGrowth(growthRate(90, 100)), '-10.0%');
  assert.equal(fmtGrowth(null), '—');
});

test('progressForStatus: done = 100, done → todo restarts, others keep progress', () => {
  assert.equal(progressForStatus({ status: 'progress', progress: 40 }, 'done'), 100);
  assert.equal(progressForStatus({ status: 'done', progress: 100 }, 'todo'), 0);
  assert.equal(progressForStatus({ status: 'done', progress: 100 }, 'review'), 100);
  assert.equal(progressForStatus({ status: 'progress', progress: 40 }, 'todo'), 40);
});

test('normalizeBudget / budgetTotals', () => {
  const rows = normalizeBudget([
    { ws: 'hr', plan: 12.04, act: 7 },
    { ws: 'aka', plan: 0.1, act: 0.2 },
    { ws: 'it', plan: 0, act: 0 },
    { ws: 'mkt', plan: -5, act: 3 },
  ]);
  assert.deepEqual(rows, [
    { ws: 'aka', plan: 0.1, act: 0.2 },
    { ws: 'mkt', plan: 0, act: 3 },
    { ws: 'hr', plan: 12, act: 7 },
  ]);
  const t = budgetTotals(rows);
  assert.equal(t.plan, 12.1);
  assert.equal(t.act, 10.2);
  assert.equal(t.left, 1.9);
  assert.equal(t.over, false);
  assert.equal(budgetTotals([]).used, 0);
});
