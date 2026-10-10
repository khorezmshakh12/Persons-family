/**
 * Pay run engine — pure, no DB. One month's pay for one person is the sum of
 * signed components; everything the Finance screens show (columns, the
 * breakdown drawer, the pre-approval checks, the payslip) is derived here so
 * no two views can disagree. Tested in tests/pay-run.test.ts.
 *
 *   payable   = base + kpi + bonuses + deductions        (deductions ≤ 0)
 *   paid      = salary payments + advances for the month
 *   remaining = payable − paid                            (< 0 = overpaid)
 */

import { startOfTashkentMonthKey } from './time';

export const PAY_RUN_STATUSES = ['draft', 'review', 'approved', 'paid'] as const;
export type PayRunStatus = (typeof PAY_RUN_STATUSES)[number];

export const PAY_RUN_STEP: Record<PayRunStatus, { n: string; hint: string }> = {
  draft: { n: 'Hisoblash', hint: 'Maosh, KPI, bonus va ushlanmalar yig‘ilmoqda' },
  review: { n: 'Tekshirish', hint: 'Ogohlantirishlarni ko‘rib chiqing' },
  approved: { n: 'Tasdiqlangan', hint: 'Oy qulflangan — faqat tuzatish yozuvi bilan o‘zgaradi' },
  paid: { n: 'To‘langan', hint: 'To‘lovlar qayd etilgan' },
};

export type ComponentKind = 'base' | 'kpi' | 'selfdev' | 'perf' | 'mission' | 'adjustment' | 'penalty' | 'correction';

export const COMPONENT_LABEL: Record<ComponentKind, string> = {
  base: 'Asosiy maosh',
  kpi: 'KPI natijasi',
  selfdev: 'O‘zini rivojlantirish bonusi',
  perf: 'Rag‘bat / jarima',
  mission: 'Missiya bonusi',
  adjustment: 'Qo‘lda tuzatish',
  penalty: 'Jarima',
  correction: 'Tuzatish yozuvi (qulflangan oy)',
};

export type PayComponent = {
  kind: ComponentKind;
  title: string;
  amount: number;
  at?: string | null;
  /** finance_entries id when the component is a ledger row (editable). */
  entryId?: string;
};

export type Payment = { id: string; kind: 'salary' | 'advance'; title: string; amount: number; at: string | null };

export type PayFlag = 'noBase' | 'kpiPending' | 'selfDevPending' | 'variance' | 'overpaid' | 'negative' | 'advancePending';

export const FLAG_META: Record<PayFlag, { n: string; blocking: boolean }> = {
  noBase: { n: 'Maosh kiritilmagan', blocking: false },
  negative: { n: 'To‘lanadigan summa manfiy', blocking: true },
  kpiPending: { n: 'KPI baholanmagan', blocking: false },
  selfDevPending: { n: 'O‘zini rivojlantirish baholanmagan', blocking: false },
  variance: { n: 'O‘tgan oydan keskin farq', blocking: false },
  overpaid: { n: 'Ortiqcha to‘langan', blocking: false },
  advancePending: { n: 'Avans so‘rovi kutilmoqda', blocking: false },
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
  let base = 0;
  let kpi = 0;
  let bonuses = 0;
  let deductions = 0;
  for (const c of input.components) {
    if (c.kind === 'base') base += c.amount;
    else if (c.kind === 'kpi') kpi += c.amount;
    else if (c.amount >= 0) bonuses += c.amount;
    else deductions += c.amount;
  }
  const payable = round(base + kpi + bonuses + deductions);
  const advances = round(input.payments.filter((p) => p.kind === 'advance').reduce((s, p) => s + p.amount, 0));
  const paid = round(input.payments.reduce((s, p) => s + p.amount, 0));
  const remaining = payable - paid;
  const delta = input.prevPayable && input.prevPayable > 0 ? (payable - input.prevPayable) / input.prevPayable : null;

  const flags: PayFlag[] = [];
  if (base <= 0) flags.push('noBase');
  if (payable < 0) flags.push('negative');
  if (input.kpiPending) flags.push('kpiPending');
  if (input.selfDevPending) flags.push('selfDevPending');
  if (delta !== null && Math.abs(delta) > VARIANCE_LIMIT) flags.push('variance');
  if (remaining < 0) flags.push('overpaid');
  if (input.advancePending) flags.push('advancePending');

  return {
    ...input,
    base: round(base),
    kpi: round(kpi),
    bonuses: round(bonuses),
    deductions: round(deductions),
    payable,
    paid,
    advances,
    remaining,
    flags,
    delta,
  };
}

export type PayTotals = { base: number; kpi: number; bonuses: number; deductions: number; payable: number; paid: number; remaining: number };

export function totals(lines: PayLine[]): PayTotals {
  const t: PayTotals = { base: 0, kpi: 0, bonuses: 0, deductions: 0, payable: 0, paid: 0, remaining: 0 };
  for (const l of lines) {
    t.base += l.base;
    t.kpi += l.kpi;
    t.bonuses += l.bonuses;
    t.deductions += l.deductions;
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

export function blockers(lines: PayLine[]): PayLine[] {
  return lines.filter((l) => isRelevant(l) && l.flags.some((f) => FLAG_META[f].blocking));
}

/** Allowed moves of the run. Going back (reopen) always needs a reason. */
export function canMove(from: PayRunStatus, to: PayRunStatus): boolean {
  const i = PAY_RUN_STATUSES.indexOf(from);
  const j = PAY_RUN_STATUSES.indexOf(to);
  return Math.abs(i - j) === 1;
}

export type SnapshotLine = { staffId: string; payable: number };

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
