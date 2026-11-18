/**
 * Pay run engine — pure, no DB. Everything the Finance screens show (columns,
 * the breakdown drawer, the payslip) is derived here so no two views can
 * disagree. Tested in tests/pay-run.test.ts.
 *
 * No fixed salary (owner, 2026-11-18): a month's pay is everything the CEO
 * added for it —
 *
 *   payable   = paid + kpi + bonuses + deductions
 *   paid      = salary payments + advances for the month
 *   remaining = 0  (kept for callers; there is nothing "still owed")
 *
 * Every amount belongs to exactly one month (its `period`); nothing from
 * another month is summed in. Old advance bookkeeping rows (carry / split
 * advance shares) are not earnings and not money given, so they stay out.
 */

import { startOfTashkentMonthKey } from './time';

export const PAY_RUN_STATUSES = ['draft', 'review', 'approved', 'paid'] as const;
export type PayRunStatus = (typeof PAY_RUN_STATUSES)[number];

export type ComponentKind = 'base' | 'kpi' | 'selfdev' | 'perf' | 'mission' | 'adjustment' | 'penalty' | 'correction' | 'carry' | 'advshift';

export const COMPONENT_LABEL: Record<ComponentKind, string> = {
  base: 'Asosiy maosh',
  kpi: 'KPI natijasi',
  selfdev: 'O‘zini rivojlantirish bonusi',
  perf: 'Rag‘bat / jarima',
  mission: 'Missiya bonusi',
  adjustment: 'Qo‘lda tuzatish',
  penalty: 'Jarima',
  correction: 'Tuzatish yozuvi',
  carry: 'O‘tgan oyda berilgan avans',
  advshift: 'Avansni bo‘lib ushlash',
};

/** Components a correction may cancel in one click (see reversal_of). */
export const REVERSIBLE: ReadonlySet<ComponentKind> = new Set(['kpi', 'selfdev', 'perf', 'mission', 'adjustment', 'penalty']);

export type PayComponent = {
  kind: ComponentKind;
  title: string;
  amount: number;
  at?: string | null;
  /** finance_entries id when the component is a ledger row. */
  entryId?: string;
  /** finance_entries.source of that row — decides whether it can be edited. */
  source?: string;
  /** Stable key of the source row ('fe:<id>', 'perf:<id>', 'sd:<id>',
   * 'ms:<id>') — what a reversal correction points at. */
  ref?: string;
  /** A correction already cancels this component. */
  reversed?: boolean;
};

export type Payment = {
  id: string;
  kind: 'salary' | 'advance';
  title: string;
  amount: number;
  at: string | null;
  source?: string;
  /** Cash box code it left from (null: before methods existed). */
  method?: string | null;
  /** The staff member's answer: "Oldim" or a flagged problem. */
  receipt?: { status: 'received' | 'disputed'; note: string } | null;
};

/** Ledger rows a person may edit or delete while the month is open; the
 * rest belong to a workflow (KPI grade, correction, carry) and change there. */
export const EDITABLE_SOURCES: ReadonlySet<string> = new Set(['manual', 'advance', 'payrun', 'reimburse']);

export type PayFlag = 'noBase' | 'kpiPending' | 'selfDevPending' | 'variance' | 'overpaid' | 'negative' | 'advancePending';

export const FLAG_META: Record<PayFlag, { n: string; blocking: boolean }> = {
  noBase: { n: 'Maosh kiritilmagan', blocking: false },
  negative: { n: 'To‘lanadigan summa manfiy', blocking: true },
  kpiPending: { n: 'KPI baholanmagan', blocking: false },
  selfDevPending: { n: 'O‘zini rivojlantirish baholanmagan', blocking: false },
  variance: { n: 'O‘tgan oydan keskin farq', blocking: false },
  overpaid: { n: 'Keyingi oy uchun avans berilgan', blocking: false },
  // Blocking: an advance decided after approval could not be written into
  // the locked month, so it is settled first.
  advancePending: { n: 'Avans so‘rovi kutilmoqda', blocking: true },
};

export type PayInput = {
  staffId: string;
  name: string;
  role: string;
  components: PayComponent[];
  payments: Payment[];
  prevPayable: number | null;
  kpiPending: boolean;
  selfDevPending: boolean;
  advancePending: boolean;
};

export type PayLine = PayInput & {
  base: number;
  kpi: number;
  bonuses: number;
  deductions: number;
  /** Last month's overpayment held back this month (≤ 0) — not a cut in
   * earnings, so not in `deductions` (accounting books payable − carry). */
  carry: number;
  /** Split-advance bookkeeping for this month (see header); not earnings. */
  advanceShift: number;
  payable: number;
  paid: number;
  advances: number;
  remaining: number;
  flags: PayFlag[];
  /** Share of change against last month's payable, or null. */
  delta: number | null;
};

export const VARIANCE_LIMIT = 0.3;

const round = (n: number) => Math.round(n);

export function computeLine(input: PayInput): PayLine {
  let kpi = 0;
  let bonuses = 0;
  let deductions = 0;
  for (const c of input.components) {
    // base / carry / advshift: the fixed salary and its advance bookkeeping
    // are gone from the rule (2026-11-18); old rows are ignored, not deleted.
    if (c.kind === 'base' || c.kind === 'carry' || c.kind === 'advshift') continue;
    if (c.kind === 'kpi') kpi += c.amount;
    else if (c.amount >= 0) bonuses += c.amount;
    else deductions += c.amount;
  }
  const advances = round(input.payments.filter((p) => p.kind === 'advance').reduce((s, p) => s + p.amount, 0));
  const paid = round(input.payments.reduce((s, p) => s + p.amount, 0));
  const payable = round(paid + kpi + bonuses + deductions);
  const delta = input.prevPayable && input.prevPayable > 0 ? (payable - input.prevPayable) / input.prevPayable : null;

  const flags: PayFlag[] = [];
  if (payable < 0) flags.push('negative');
  if (input.kpiPending) flags.push('kpiPending');
  if (input.selfDevPending) flags.push('selfDevPending');
  if (delta !== null && Math.abs(delta) > VARIANCE_LIMIT) flags.push('variance');
  if (input.advancePending) flags.push('advancePending');

  return {
    ...input,
    base: 0,
    kpi: round(kpi),
    bonuses: round(bonuses),
    deductions: round(deductions),
    carry: 0,
    advanceShift: 0,
    payable,
    paid,
    advances,
    remaining: 0,
    flags,
    delta,
  };
}

export type PayTotals = { base: number; kpi: number; bonuses: number; deductions: number; carry: number; advanceShift: number; payable: number; paid: number; remaining: number };

export function totals(lines: PayLine[]): PayTotals {
  const t: PayTotals = { base: 0, kpi: 0, bonuses: 0, deductions: 0, carry: 0, advanceShift: 0, payable: 0, paid: 0, remaining: 0 };
  for (const l of lines) {
    t.base += l.base;
    t.kpi += l.kpi;
    t.bonuses += l.bonuses;
    t.deductions += l.deductions;
    t.carry += l.carry;
    t.advanceShift += l.advanceShift;
    t.payable += l.payable;
    t.paid += l.paid;
    t.remaining += l.remaining;
  }
  return t;
}

/** People who get paid this month: anyone with a salary, any component or
 * any payment. A blank row for a person with nothing is noise. */
export function isRelevant(l: PayLine): boolean {
  return l.base > 0 || l.components.length > 0 || l.payments.length > 0;
}

/** A person's month in one word: still running, or closed (no fixed salary
 * since 2026-11-18, so nothing is "owed" — the month just ends). */
export function payState(period: string, current: string): string {
  return period >= current ? 'Oy davom etyapti' : 'Yakunlandi';
}

export function blockers(lines: PayLine[]): PayLine[] {
  return lines.filter((l) => isRelevant(l) && l.flags.some((f) => FLAG_META[f].blocking));
}

export type SnapshotLine = { staffId: string; payable: number; carry?: number };

/** Lines whose payable moved since the run was approved (corrections). */
export function drift(lines: PayLine[], snapshot: SnapshotLine[] | null): { staffId: string; was: number; now: number }[] {
  if (!snapshot) return [];
  const was = new Map(snapshot.map((s) => [s.staffId, s.payable]));
  return lines
    .filter((l) => was.has(l.staffId) && was.get(l.staffId) !== l.payable)
    .map((l) => ({ staffId: l.staffId, was: was.get(l.staffId)!, now: l.payable }));
}

/** When each month's run was approved (ISO), for months that are locked. */
export type LockTimes = ReadonlyMap<string, string>;

/**
 * The month a dated movement (rag‘bat/jarima, missiya bonusi) is paid in:
 * its own Tashkent month, unless that month was approved before the
 * movement happened — then it rolls into the next month, so an approved
 * month never changes and nothing is lost. Mirrors the SQL function
 * payroll_effective_period (20261010120000_payroll_lock_complete).
 */
export function effectivePeriod(at: string, locks: LockTimes): string {
  const t = new Date(at);
  let p = startOfTashkentMonthKey(t);
  for (let i = 0; i < 12; i++) {
    const approvedAt = locks.get(p);
    if (!approvedAt || t.getTime() <= new Date(approvedAt).getTime()) break;
    p = shiftMonth(p, 1);
  }
  return p;
}

/** 'YYYY-MM-01' ± n months. */
export function shiftMonth(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
