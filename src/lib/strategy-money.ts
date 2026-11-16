/**
 * Strategiya › Moliya › Daromadlar va xarajatlar (owner, 2026-11-16). Pure —
 * every figure comes from the Hisob-kitob journal, the same books Moliya,
 * Hisob-kitob and Tahlil read, so no two screens can disagree:
 *   daromad  = turnover of 9030 (Operatsiya HQ payments are posted there,
 *              refunds net out)
 *   xarajat  = turnover of the expense accounts (type 'X')
 *   sof foyda = daromad − xarajat
 *   pul      = closing balance of the cash boxes (50xx kassa, 51xx bank)
 */
import { addMonths, monthEnd, statements, type Account, type Entry } from './accounting';

export const REVENUE = '9030';

export type MoneyLine = { key: string; name: string; amount: number };
export type MoneyItem = {
  id: string;
  date: string;
  text: string;
  amount: number;
  account: string;
  /** The entry's own debit / credit (for editing it in place). */
  debit: string;
  credit: string;
  /** Typed by hand (source null) — may be edited or deleted here. Auto rows
   * (Operatsiya HQ payments, payroll, depreciation) change at their source. */
  manual: boolean;
  /** crm:<id> — an Operatsiya HQ payment. */
  fromOps: boolean;
};

export type MoneyMonth = {
  ym: string;
  income: number;
  expense: number;
  net: number;
  /** net / income, % — null without income. */
  margin: number | null;
  cash: number;
  /** Income by the cash box it went to (naqd / bank…), refunds netted. */
  incomeBy: MoneyLine[];
  refunds: number;
  /** Expense by category: payroll postings together, the rest by account. */
  expenseBy: MoneyLine[];
  /** Every income / expense row of the month, newest first. */
  lastIn: MoneyItem[];
  lastOut: MoneyItem[];
  /** Entries in the month at all — false means "nothing booked yet", not zero. */
  booked: boolean;
};

const monthStart = (ym: string) => `${ym}-01`;
const inMonth = (e: Entry, ym: string) => e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym);
const r = (n: number) => Math.round(n) || 0; // no −0
const PAYROLL = 'payroll';

const item = (e: Entry, amount: number, account: string): MoneyItem => ({
  id: e.id,
  date: e.entry_date,
  text: e.description,
  amount,
  account,
  debit: e.debit,
  credit: e.credit,
  manual: !e.source,
  fromOps: !!e.source?.startsWith('crm:'),
});

function add(map: Map<string, MoneyLine>, key: string, name: string, v: number) {
  const cur = map.get(key);
  if (cur) cur.amount += v;
  else map.set(key, { key, name, amount: v });
}

export function moneyMonth(accounts: Account[], opening: Record<string, number>, entries: Entry[], ym: string): MoneyMonth {
  const s = statements(accounts, opening, entries, monthStart(ym), monthEnd(ym));
  const name = new Map(accounts.map((a) => [a.code, a.name]));
  const expenseCodes = new Set(accounts.filter((a) => a.type === 'X').map((a) => a.code));
  const own = entries.filter((e) => inMonth(e, ym));

  const byBox = new Map<string, MoneyLine>();
  const byCat = new Map<string, MoneyLine>();
  let refunds = 0;
  const lastIn: MoneyItem[] = [];
  const lastOut: MoneyItem[] = [];
  for (const e of own) {
    if (e.credit === REVENUE) {
      add(byBox, e.debit, name.get(e.debit) ?? e.debit, e.amount);
      lastIn.push(item(e, e.amount, e.debit));
    } else if (e.debit === REVENUE) {
      add(byBox, e.credit, name.get(e.credit) ?? e.credit, -e.amount);
      refunds += e.amount;
      lastIn.push(item(e, -e.amount, e.credit));
    }
    const out = expenseCodes.has(e.debit) ? e.amount : expenseCodes.has(e.credit) ? -e.amount : 0;
    if (out) {
      const code = expenseCodes.has(e.debit) ? e.debit : e.credit;
      if (e.source?.startsWith('payroll:')) add(byCat, PAYROLL, 'Ish haqi va soliqlari', out);
      else add(byCat, code, name.get(code) ?? code, out);
      lastOut.push(item(e, out, code));
    }
  }
  const expense = r(s.cogs + s.selling + s.admin + s.other + s.tax);
  const income = r(s.revenue);
  const net = income - expense;
  const recent = (a: MoneyItem, b: MoneyItem) => (a.date === b.date ? Math.abs(b.amount) - Math.abs(a.amount) : b.date.localeCompare(a.date));
  const lines = (m: Map<string, MoneyLine>) =>
    [...m.values()].map((l) => ({ ...l, amount: r(l.amount) })).filter((l) => l.amount !== 0).sort((a, b) => b.amount - a.amount);
  return {
    ym,
    income,
    expense,
    net,
    margin: income > 0 ? Math.round((net / income) * 1000) / 10 : null,
    cash: r(s.cash),
    incomeBy: lines(byBox),
    refunds: r(refunds),
    expenseBy: lines(byCat),
    lastIn: lastIn.sort(recent),
    lastOut: lastOut.sort(recent),
    booked: own.length > 0,
  };
}

/** The last `n` months ending at `ym`: income and expense only (for the bars). */
export function moneySeries(accounts: Account[], opening: Record<string, number>, entries: Entry[], ym: string, n = 12) {
  const out: { ym: string; income: number; expense: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(ym, -i);
    const s = statements(accounts, opening, entries, monthStart(m), monthEnd(m));
    out.push({ ym: m, income: r(s.revenue), expense: r(s.cogs + s.selling + s.admin + s.other + s.tax) });
  }
  return out;
}

/** Change against last month, % — null when last month had nothing. */
export function growth(now: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((now - prev) / Math.abs(prev)) * 1000) / 10;
}
