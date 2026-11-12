/**
 * Finance › Moliya — Monitor/index.html hisob mantig'i 1:1 (owner,
 * 2026-11-12). Sof, DB'siz; client va server birga ishlatadi.
 *
 *   netPayable = oylik (CEO) + bonus − jarima
 *   totalPaid  = avans + oylik to'lov
 *   qolgan     = netPayable − totalPaid  (manfiy = ortiqcha to'lov)
 *
 * Har oy mustaqil: bir oyning qoldig'i keyingisiga qo'shilmaydi. Oylik
 * belgilanmagan oyda eng yaqin oldingi oyning oyligi olinadi.
 * Monitor'dan farqi: bonus/jarima ichiga boshqa bo'limlardan avtomatik
 * keladiganlar ham kiradi (KPI, o'zini rivojlantirish, missiya, rag'bat).
 */

export type MonOp = 'AVANS' | 'SALARY_PAY' | 'BONUS' | 'PENALTY';
export type MonStatus = 'PAID' | 'OVERPAID' | 'PARTIAL' | 'UNPAID';

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
};

export type MonEmp = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  /** Explicit CEO salaries by 'YYYY-MM'. */
  salaries: Record<string, number>;
  /** "Avans so'raldi" by 'YYYY-MM'. */
  requested: Record<string, boolean>;
};

export type MonSummary = {
  period: string;
  baseSalary: number;
  bonusTotal: number;
  penaltyTotal: number;
  netPayable: number;
  avansTotal: number;
  salaryPayTotal: number;
  totalPaid: number;
  remainingToPay: number;
  overpaidAmount: number;
  rawDiff: number;
  paidPercent: number;
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

/** Explicit salary for the month, else the nearest earlier month's, else 0. */
export function getEmployeeSalaryForMonth(emp: Pick<MonEmp, 'salaries'>, ym: string): number {
  const map = emp.salaries;
  if (Object.prototype.hasOwnProperty.call(map, ym)) return toSafeIntegerAmount(map[ym]);
  const prior = Object.keys(map).filter((k) => YM_RE.test(k) && k < ym).sort();
  return prior.length ? toSafeIntegerAmount(map[prior[prior.length - 1]]) : 0;
}

export function calculateEmployeeMonthSummary(emp: MonEmp, txs: MonTx[], ym: string): MonSummary {
  const baseSalary = getEmployeeSalaryForMonth(emp, ym);
  let bonusTotal = 0;
  let penaltyTotal = 0;
  let avansTotal = 0;
  let salaryPayTotal = 0;
  const periodTxs: MonTx[] = [];
  for (const tx of txs) {
    if (tx.staffId !== emp.id || tx.month !== ym) continue;
    const amt = toSafeIntegerAmount(tx.amount);
    periodTxs.push(tx);
    if (tx.type === 'BONUS') bonusTotal += amt;
    else if (tx.type === 'PENALTY') penaltyTotal += amt;
    else if (tx.type === 'AVANS') avansTotal += amt;
    else if (tx.type === 'SALARY_PAY') salaryPayTotal += amt;
  }
  const netPayable = baseSalary + bonusTotal - penaltyTotal;
  const totalPaid = avansTotal + salaryPayTotal;
  const rawDiff = netPayable - totalPaid;
  const remainingToPay = rawDiff > 0 ? rawDiff : 0;
  const overpaidAmount = rawDiff < 0 ? Math.abs(rawDiff) : 0;

  let status: MonStatus = 'UNPAID';
  if (overpaidAmount > 0) status = 'OVERPAID';
  else if (netPayable <= 0 && totalPaid === 0) status = 'PAID';
  else if (remainingToPay === 0 && netPayable > 0) status = 'PAID';
  else if (totalPaid > 0 && remainingToPay > 0) status = 'PARTIAL';

  const paidPercent = netPayable > 0 ? Math.min(100, Math.round((totalPaid / netPayable) * 100)) : totalPaid > 0 ? 100 : 0;

  return {
    period: ym,
    baseSalary,
    bonusTotal,
    penaltyTotal,
    netPayable,
    avansTotal,
    salaryPayTotal,
    totalPaid,
    remainingToPay,
    overpaidAmount,
    rawDiff,
    paidPercent,
    status,
    avansRequested: Boolean(emp.requested[ym]),
    transactions: periodTxs,
  };
}

export function getStatusText(curr: MonSummary): string {
  if (curr.status === 'PAID') return "To'liq yopilgan";
  if (curr.status === 'OVERPAID') return "Ortiqcha to'lov";
  if (curr.status === 'PARTIAL') return curr.salaryPayTotal > 0 ? 'Qisman berilgan' : 'Avans olgan';
  return "To'lanmagan";
}

/** 'YYYY-MM' ↔ the DB's 'YYYY-MM-01'. */
export const ymToPeriod = (ym: string) => `${ym}-01`;
export const periodToYm = (p: string) => p.slice(0, 7);
