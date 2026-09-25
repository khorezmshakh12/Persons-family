import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageOf,
  cacStatus,
  capacityOf,
  daysLate,
  debtSummary,
  finMetrics,
  marginHeat,
  monthInputs,
  shiftLoad,
  waterfall,
} from '../src/lib/strategy-finance';

const S = { revenue: 100_000_000, cogs: 48_000_000, selling: 10_000_000, admin: 20_000_000, other: 2_000_000 };

test('finMetrics: margins, break-even, CAC and capacity from ledger + head-count', () => {
  const m = finMetrics(S, { students: 200, newStudents: 40, capacity: 400 });
  assert.equal(m.GP, 52_000_000);
  assert.equal(m.gm, 52);
  assert.equal(m.fixed, 32_000_000);
  assert.equal(m.NP, 20_000_000);
  assert.equal(m.npm, 20);
  assert.equal(m.fee, 500_000);
  assert.equal(m.dcs, 240_000);
  assert.equal(m.bep, Math.ceil(32_000_000 / 260_000)); // 124
  assert.equal(m.util, 50);
  assert.equal(m.free, 200);
  assert.equal(m.cac, 250_000);
  assert.equal(m.cacRatio, 0.5);
  assert.equal(cacStatus(m.cacRatio), 'ok');
  assert.ok(Math.abs((m.safety ?? 0) - 38) < 1e-9);
});

test('finMetrics: course tariffs win over ledger averages; missing data stays null', () => {
  const courses = [
    { id: 'a', name: 'A', fee: 400_000, students: 10, teacher_cost: 1_000_000, book_cost: 20_000 },
    { id: 'b', name: 'B', fee: 600_000, students: 10, teacher_cost: 2_000_000, book_cost: 0 },
  ];
  const m = finMetrics(S, { students: 20, newStudents: null, capacity: 0, courses });
  assert.equal(m.fee, 500_000);
  assert.equal(m.dcs, (1_200_000 + 2_000_000) / 20);
  assert.equal(m.cac, null);
  assert.equal(m.util, null);
  const empty = finMetrics({ revenue: 0, cogs: 0, selling: 0, admin: 0, other: 0 }, { students: null, newStudents: 0, capacity: 0 });
  assert.equal(empty.gm, null);
  assert.equal(empty.bep, null);
  assert.equal(empty.fee, null);
});

test('finMetrics: negative contribution → no break-even', () => {
  const m = finMetrics({ ...S, cogs: 120_000_000 }, { students: 100, newStudents: 1, capacity: 10 });
  assert.equal(m.bep, null);
  assert.equal(m.cmNegative, true);
});

test('shiftLoad / capacityOf normalise the shift mix', () => {
  const st = { rooms: 5, seats: 10, target: 50, shifts: [{ t: '08:00', p: 1 }, { t: '14:00', p: 3 }] };
  assert.equal(capacityOf(st), 100);
  const l = shiftLoad(80, st);
  assert.deepEqual(l.map((x) => x.n), [20, 60]);
  assert.equal(l[1].pct, 120);
});

test('debtSummary ages overdue students by Tashkent day', () => {
  assert.equal(daysLate('2026-09-01', '2026-09-25'), 24);
  assert.equal(daysLate('2026-10-01', '2026-09-25'), 0);
  assert.equal(ageOf(15).k, 'b1');
  assert.equal(ageOf(16).k, 'b2');
  assert.equal(ageOf(31).k, 'b3');
  const d = debtSummary(
    [
      { id: '1', name: 'A', phone: '', course_id: null, grp: '', amount: 100, due_date: '2026-09-20' },
      { id: '2', name: 'B', phone: '', course_id: null, grp: '', amount: 300, due_date: '2026-08-01' },
    ],
    '2026-09-25',
  );
  assert.equal(d.total, 400);
  assert.equal(d.rows[0].name, 'B');
  assert.deepEqual(d.aging.map((a) => a.n), [1, 0, 1]);
  assert.equal(d.avgDays, Math.round((5 + 55) / 2));
});

test('waterfall hangs costs from the running total', () => {
  const w = waterfall([{ n: 'R', v: 100, total: true }, { n: 'c', v: -30 }, { n: 'GP', v: 70, total: true }, { n: 'f', v: -90 }, { n: 'NP', v: -20, total: true }]);
  assert.deepEqual(w.map((r) => [r.from, r.to]), [[0, 100], [70, 100], [0, 70], [-20, 70], [-20, 0]]);
  assert.equal(marginHeat(null), 'transparent');
  assert.equal(marginHeat(16), 'rgb(19,154,82)');
});

test('monthInputs: saved row wins, current month falls back to courses/settings/leads', () => {
  const fin = {
    settings: { rooms: 2, seats: 10, target: 50, shifts: [{ t: '09:00', p: 50 }, { t: '14:00', p: 50 }] },
    months: [{ ym: '2026-08', students: 90, paid: 80, new_students: null, capacity: 40 }],
    debtors: [],
    enrolled: { '2026-08': 7, '2026-09': 3 },
  };
  const courses = [{ id: 'a', name: 'A', fee: 1, students: 30, teacher_cost: 0, book_cost: 0 }];
  assert.deepEqual(monthInputs(fin, courses, '2026-08', '2026-09'), {
    saved: true, students: 90, paid: 80, newStudents: 7, newFromLeads: true, capacity: 40,
  });
  assert.deepEqual(monthInputs(fin, courses, '2026-09', '2026-09'), {
    saved: false, students: 30, paid: 0, newStudents: 3, newFromLeads: true, capacity: 40,
  });
  assert.equal(monthInputs(fin, courses, '2026-07', '2026-09').students, null);
});
