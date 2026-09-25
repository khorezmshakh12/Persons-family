// Strategiya → Moliya / Tahlil: the six learning-centre metrics (gross margin,
// operating margin, break-even, capacity, receivables, CAC) computed from the
// real books (acct_entries via `statements`) plus the few head-count inputs the
// books cannot hold (strategy_fin_months, strategy_debtors, acct_settings
// 'strategy_fin'). Pure and client-safe.

import { courseEconomics, type Course, type Statements } from './accounting';
import { dayNum } from './strategy';

export type FinShift = { t: string; p: number };
export type FinSettings = {
  rooms: number;
  seats: number;
  /** One entry per daily shift: start time + share of students (%). */
  shifts: FinShift[];
  /** Gross-margin target, %. */
  target: number;
};
export const DEFAULT_FIN: FinSettings = { rooms: 0, seats: 0, shifts: [], target: 50 };

export type FinMonth = { ym: string; students: number | null; paid: number; new_students: number | null; capacity: number | null };

export type Debtor = {
  id: string;
  name: string;
  phone: string;
  course_id: string | null;
  grp: string;
  amount: number;
  due_date: string;
};

export type FinInputs = {
  settings: FinSettings;
  months: FinMonth[];
  debtors: Debtor[];
  /** Operatsiya HQ leads that reached "enrolled", per Tashkent month. */
  enrolled: Record<string, number>;
};

export const capacityOf = (s: Pick<FinSettings, 'rooms' | 'seats' | 'shifts'>) => s.rooms * s.seats * s.shifts.length;

/** Monthly metrics. Unit economics (average fee, direct cost per student)
 * come from the course tariffs when given (current month), otherwise from
 * the ledger divided by the month's head-count (history). */
export function finMetrics(
  s: Pick<Statements, 'revenue' | 'cogs' | 'selling' | 'admin' | 'other'>,
  input: { students: number | null; newStudents: number | null; capacity: number; courses?: Course[] },
) {
  const R = s.revenue;
  const D = s.cogs;
  const GP = R - D;
  const fixed = s.selling + s.admin + s.other;
  const NP = GP - fixed;
  const N = input.students;
  const tariff = (input.courses ?? []).filter((c) => c.students > 0);
  const tN = tariff.reduce((a, c) => a + c.students, 0);
  let fee: number | null = null;
  let dcs: number | null = null;
  if (tN > 0) {
    fee = tariff.reduce((a, c) => a + c.fee * c.students, 0) / tN;
    dcs = tariff.reduce((a, c) => a + courseEconomics(c).direct, 0) / tN;
  } else if (N && R > 0) {
    fee = R / N;
    dcs = D / N;
  }
  const cm = fee !== null && dcs !== null ? fee - dcs : null;
  const bep = cm !== null && cm > 0 ? Math.ceil(fixed / cm) : null;
  const util = N !== null && input.capacity > 0 ? (N / input.capacity) * 100 : null;
  const cac = input.newStudents ? s.selling / input.newStudents : null;
  return {
    R,
    D,
    GP,
    gm: R ? (GP / R) * 100 : null,
    fixed,
    NP,
    npm: R ? (NP / R) * 100 : null,
    N,
    fee,
    dcs,
    cm,
    /** true when 1 student's fee does not even cover their direct cost. */
    cmNegative: cm !== null && cm <= 0,
    bep,
    safety: bep !== null && N ? ((N - bep) / N) * 100 : null,
    capacity: input.capacity,
    util,
    free: N !== null && input.capacity > 0 ? input.capacity - N : null,
    cac,
    cacRatio: cac !== null && fee ? cac / fee : null,
    cacPayback: cac !== null && cm !== null && cm > 0 ? cac / cm : null,
  };
}
export type FinMetrics = ReturnType<typeof finMetrics>;

/** CAC health: < 70% of the monthly fee is fine, < 100% borderline. */
export const cacStatus = (ratio: number | null) => (ratio === null ? 'bad' : ratio < 0.7 ? 'ok' : ratio < 1 ? 'warn' : 'bad');

/** Students per shift from the configured mix; shares are normalised. */
export function shiftLoad(N: number, s: FinSettings) {
  const per = s.rooms * s.seats;
  const tot = s.shifts.reduce((a, x) => a + Math.max(0, x.p), 0);
  return s.shifts.map((x) => {
    const n = tot > 0 ? Math.round((N * Math.max(0, x.p)) / tot) : Math.round(N / s.shifts.length);
    return { t: x.t, n, cap: per, pct: per ? (n / per) * 100 : 0 };
  });
}

export const AGE = [
  { k: 'b1', n: '1–15 kun', c: '#f0a59e', min: -Infinity, max: 15 },
  { k: 'b2', n: '16–30 kun', c: '#de5b52', min: 16, max: 30 },
  { k: 'b3', n: '30+ kun', c: '#9c1f19', min: 31, max: Infinity },
] as const;
export type AgeKey = (typeof AGE)[number]['k'];

export const daysLate = (due: string, today: string) => Math.max(0, dayNum(today) - dayNum(due));
export const ageOf = (days: number) => AGE.find((a) => days >= a.min && days <= a.max) ?? AGE[0];

/** Receivables aging from the overdue-students list. */
export function debtSummary(list: Debtor[], today: string) {
  const rows = list.map((d) => ({ ...d, days: daysLate(d.due_date, today) })).sort((a, b) => b.days - a.days);
  const total = rows.reduce((a, d) => a + d.amount, 0);
  const aging = AGE.map((a) => {
    const ds = rows.filter((d) => ageOf(d.days).k === a.k);
    return { ...a, n: ds.length, sum: ds.reduce((s, d) => s + d.amount, 0), label: a.n };
  });
  return {
    rows,
    total,
    count: rows.length,
    avgDays: rows.length ? Math.round(rows.reduce((a, d) => a + d.days, 0) / rows.length) : 0,
    aging,
    top: rows.slice(0, 3),
  };
}

/** P&L waterfall rows: each cost bar hangs from the running total. */
export function waterfall(rows: { n: string; v: number; total?: boolean }[]) {
  let run = 0;
  return rows.map((r) => {
    let a: number;
    let b: number;
    if (r.total) {
      a = Math.min(0, r.v);
      b = Math.max(0, r.v);
      run = r.v;
    } else {
      a = run + r.v;
      b = run;
      run = a;
    }
    return { ...r, from: Math.min(a, b), to: Math.max(a, b) };
  });
}

/** Heat colour for a net-margin cell: red below 0, green above. */
export function marginHeat(v: number | null) {
  if (v === null) return 'transparent';
  const mix = (a: number[], b: number[], t: number) =>
    `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t)))).join(',')})`;
  const base = [239, 236, 230];
  return v < 0 ? mix(base, [199, 50, 43], -v / 8) : mix(base, [19, 154, 82], v / 16);
}

/** Head-count inputs for month `ym`. The current month falls back to the
 * course list (students) and the capacity settings; enrolments fall back to
 * Operatsiya HQ leads that reached "enrolled" that month. Unknown → null. */
export function monthInputs(fin: FinInputs, courses: Course[], ym: string, currentYm: string) {
  const row = fin.months.find((m) => m.ym === ym);
  const cur = ym === currentYm;
  const courseN = courses.reduce((a, c) => a + c.students, 0);
  return {
    saved: !!row,
    students: row?.students ?? (cur && courseN > 0 ? courseN : null),
    paid: row?.paid ?? 0,
    newStudents: row?.new_students ?? fin.enrolled[ym] ?? null,
    newFromLeads: row?.new_students == null,
    capacity: row?.capacity ?? (cur ? capacityOf(fin.settings) : 0),
  };
}
