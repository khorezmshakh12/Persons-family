/**
 * Finance › Moliya — Monitor/index.html hisob mantig'i 1:1 (owner,
 * 2026-11-12). Sof, DB'siz; client va server birga ishlatadi.
 *
 *   netPayable = oylik (CEO) + bonus − jarima (+ avans hisobi: carry / bo'lib ushlash)
 *   totalPaid  = avans + oylik to'lov
 *   qolgan     = netPayable − totalPaid  (manfiy = ortiqcha to'lov)
 *
 * Har oy mustaqil: bir oyning qoldig'i keyingisiga qo'shilmaydi. Oylik
 * belgilanmagan oyda eng yaqin oldingi oyning oyligi olinadi.
 * Monitor'dan farqi: bonus/jarima ichiga boshqa bo'limlardan avtomatik
 * keladiganlar ham kiradi (KPI, o'zini rivojlantirish, missiya, rag'bat).
 */

export type MonOp = 'AVANS' | 'SALARY_PAY' | 'BONUS' | 'PENALTY';
/** What was given this month: the salary, only an avans, or nothing yet. */
export type MonStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export type MonTx = {
  id: string;
  staffId: string;
  type: MonOp;
  /** Always positive; the type gives the sign. */
  amount: number;
  /** 'YYYY-MM' — the month it counts for. */
  month: string;
  reason: string;
  /** 'YYYY-MM-DD' */
  createdAt: string;
  /** finance_entries row the CEO may delete from the drawer. */
  entryId: string | null;
  /** Comes from another section (KPI, rag'bat, missiya…) — read-only here. */
  auto: boolean;
  /** Advance bookkeeping (carry / split advance), not a bonus or jarima:
   * counts in netPayable, stays out of bonusTotal / penaltyTotal. */
  shift?: boolean;
};

export type MonEmp = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  /** "Avans so'raldi" by 'YYYY-MM'. */
  requested: Record<string, boolean>;
};

export type MonSummary = {
  period: string;
  bonusTotal: number;
  penaltyTotal: number;
  /** The month's pay: everything given + bonus − jarima (no fixed salary,
   * owner 2026-11-18). */
  netPayable: number;
  avansTotal: number;
  salaryPayTotal: number;
  totalPaid: number;
  status: MonStatus;
  avansRequested: boolean;
  transactions: MonTx[];
};

export const UZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

export const OP_META: Record<MonOp, { label: string; sign: string; pillCls: string }> = {
  AVANS: { label: 'Avans', sign: '−', pillCls: 'primary-soft' },
  SALARY_PAY: { label: "Oylik to'lov", sign: '−', pillCls: '' },
  BONUS: { label: 'Bonus', sign: '+', pillCls: 'pos' },
  PENALTY: { label: 'Jarima', sign: '−', pillCls: 'neg' },
};

export const YM_RE = /^\d{4}-\d{2}$/;

export function shiftYearMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split('-').map((x) => parseInt(x, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
export const getPreviousMonth = (ym: string) => shiftYearMonth(ym, -1);

export function formatMonthUz(ym: string): string {
  if (!ym || !YM_RE.test(ym)) return '—';
  const [y, m] = ym.split('-');
  return `${UZ_MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
}
export function formatMonthNameOnly(ym: string): string {
  if (!ym || !YM_RE.test(ym)) return '—';
  return UZ_MONTHS[parseInt(ym.split('-')[1], 10) - 1] || ym;
}

export function toSafeIntegerAmount(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : 0;
  const cleaned = String(raw ?? '').replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isSafeInteger(n) ? n : 0;
}

export function formatUZS(amount: number, withSuffix = true): string {
  const safe = Math.round(Number(amount) || 0);
  const sign = safe < 0 ? '−' : '';
  const abs = Math.abs(safe).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return withSuffix ? `${sign}${abs} so'm` : `${sign}${abs}`;
}

export function getInitials(firstName: string, lastName: string): string {
  const f = String(firstName || '').trim().charAt(0).toUpperCase();
  const l = String(lastName || '').trim().charAt(0).toUpperCase();
  return f + l || 'XM';
}

/**
 * One person's month (owner, 2026-11-18): there is no fixed salary. The
 * month's pay is everything the CEO added for it —
 *   netPayable = avans + oylik to'lov + bonus − jarima
 * so nothing is ever "still owed" or "overpaid". Old advance bookkeeping
 * rows (`shift`) are neither money given nor earnings and are skipped.
 * Status says only what was given: nothing yet, an avans, or the salary.
 */
export function calculateEmployeeMonthSummary(emp: Pick<MonEmp, 'id' | 'requested'>, txs: MonTx[], ym: string): MonSummary {
  let bonusTotal = 0;
  let penaltyTotal = 0;
  let avansTotal = 0;
  let salaryPayTotal = 0;
  const periodTxs: MonTx[] = [];
  for (const tx of txs) {
    if (tx.staffId !== emp.id || tx.month !== ym || tx.shift) continue;
    const amt = toSafeIntegerAmount(tx.amount);
    periodTxs.push(tx);
    if (tx.type === 'BONUS') bonusTotal += amt;
    else if (tx.type === 'PENALTY') penaltyTotal += amt;
    else if (tx.type === 'AVANS') avansTotal += amt;
    else if (tx.type === 'SALARY_PAY') salaryPayTotal += amt;
  }
  const totalPaid = avansTotal + salaryPayTotal;
  const netPayable = totalPaid + bonusTotal - penaltyTotal;
  const status: MonStatus = salaryPayTotal > 0 ? 'PAID' : avansTotal > 0 ? 'PARTIAL' : 'UNPAID';

  return {
    period: ym,
    bonusTotal,
    penaltyTotal,
    netPayable,
    avansTotal,
    salaryPayTotal,
    totalPaid,
    status,
    avansRequested: Boolean(emp.requested[ym]),
    transactions: periodTxs,
  };
}

export function getStatusText(curr: MonSummary): string {
  if (curr.status === 'PAID') return 'Oylik berilgan';
  if (curr.status === 'PARTIAL') return 'Avans olgan';
  return 'Hali berilmagan';
}

/** 'YYYY-MM' ↔ the DB's 'YYYY-MM-01'. */
export const ymToPeriod = (ym: string) => `${ym}-01`;
export const periodToYm = (p: string) => p.slice(0, 7);
