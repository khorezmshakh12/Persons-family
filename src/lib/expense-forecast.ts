/**
 * Keyingi oy xarajat prognozi (owner, 2026-11-19): each expense type is
 * forecast from its own recurrence, payroll from the last posted month.
 * Pure — reads the same journal as moneyMonth, so the forecast and the
 * statistics can never disagree on what an expense is.
 *
 * Per type, using rows dated before `asOf` and no older than 180 days
 * (several rows on one day = one payment day):
 *   gap      median days between payment days ("aylanish vaqti")
 *   regular  the type appears in ≥ 3 of the last 4 calendar months
 *   frequent regular and gap ≤ 10 days → last 90 days ÷ 90 × days of target
 *   monthly  regular otherwise → median of the last 3 months that had spend
 *   periodic not regular, ≥ 2 payment days, gap > 45 → one median payment if
 *            last + k·gap falls inside the target month, else 0
 *   few      anything else (new type, one-off purchase) → 0, flagged
 * A hand-set cycle wins: monthly (as above), quarter / year (one payment
 * every 91 / 365 days after the last), once (0).
 */
import type { Account, Entry } from './accounting';

export type Cycle = 'auto' | 'monthly' | 'quarter' | 'year' | 'once';
export const CYCLES: Cycle[] = ['auto', 'monthly', 'quarter', 'year', 'once'];
export const CYCLE_NAME: Record<Cycle, string> = {
  auto: 'Avto',
  monthly: 'Oylik',
  quarter: 'Har 3 oyda',
  year: 'Yillik',
  once: 'Bir martalik',
};

export type ForecastKind = 'frequent' | 'monthly' | 'periodic' | 'once' | 'few' | 'none';
export const KIND_NAME: Record<ForecastKind, string> = {
  frequent: 'Tez-tez',
  monthly: 'Oylik',
  periodic: 'Davriy',
  once: 'Bir martalik',
  few: 'Ma’lumot kam',
  none: '—',
};

export type ExpenseRow = { key: string; date: string; amount: number };

export type TypeForecast = {
  key: string;
  kind: ForecastKind;
  /** The cycle used: the hand-set one, or 'auto'. */
  cycle: Cycle;
  /** Forecast for the target month, so‘m (rounded to 1 000). */
  amount: number;
  /** Median days between payment days; null with fewer than two. */
  gapDays: number | null;
  /** Median of one payment day's total. */
  perPayment: number;
  payments: number;
  /** Of the last 4 calendar months up to asOf, how many had this type. */
  activeMonths: number;
  last: string | null;
  /** Next expected payment day (periodic / quarter / year). */
  next: string | null;
  /** Plain-language reason shown next to the figure. */
  basis: string;
};

export type MonthForecast = {
  target: string;
  asOf: string;
  types: TypeForecast[];
  /** Payroll expense of the last month that has payroll postings. */
  payroll: { month: string; amount: number } | null;
  total: number;
};

const WINDOW = 180;
const DAY = 86_400_000;
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const ymNo = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ymOf = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
export const addMonthsYm = (ym: string, k: number) => ymOf(ymNo(ym) + k);
/** The day after `iso` ('YYYY-MM-DD'). */
export const nextDay = (iso: string) => isoOf(dayNo(iso) + 1);
const daysIn = (ym: string) => dayNo(`${addMonthsYm(ym, 1)}-01`) - dayNo(`${ym}-01`);
const round1k = (v: number) => Math.round(v / 1000) * 1000 || 0;
const som = (v: number) => Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ');
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** One type's forecast for `target` ('YYYY-MM') from rows before `asOf`. */
export function forecastType(key: string, rows: ExpenseRow[], asOf: string, target: string, cycle: Cycle = 'auto'): TypeForecast {
  const now = dayNo(asOf);
  const own = rows.filter((r) => r.key === key && dayNo(r.date) < now && dayNo(r.date) >= now - WINDOW);
  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const r of own) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
    byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) ?? 0) + r.amount);
  }
  const days = [...byDay.keys()].filter((d) => (byDay.get(d) ?? 0) > 0).sort();
  const perDay = days.map((d) => byDay.get(d)!);
  const gaps = days.slice(1).map((d, i) => dayNo(d) - dayNo(days[i]));
  const gap = gaps.length ? median(gaps) : null;
  const last = days.at(-1) ?? null;
  const months = [...byMonth.keys()].filter((m) => (byMonth.get(m) ?? 0) > 0).sort();
  const last3 = months.slice(-3).map((m) => byMonth.get(m)!);
  const asOfYm = asOf.slice(0, 7);
  const activeMonths = [0, 1, 2, 3].filter((i) => (byMonth.get(addMonthsYm(asOfYm, -i)) ?? 0) > 0).length;
  const tStart = dayNo(`${target}-01`);
  const tEnd = tStart + daysIn(target);
  const perPayment = median(perDay);
  const base = { key, cycle, gapDays: gap === null ? null : Math.round(gap), perPayment: Math.round(perPayment), payments: days.length, activeMonths, last };

  const nextFrom = (step: number) => {
    let n = dayNo(last!) + step;
    while (n < now) n += step;
    return n;
  };
  const periodic = (step: number, label: string): TypeForecast => {
    const n = nextFrom(step);
    const hit = n >= tStart && n < tEnd;
    return { ...base, kind: 'periodic', amount: hit ? round1k(perPayment) : 0, next: isoOf(n), basis: `${label} · keyingisi ${ddmm(isoOf(n))}${hit ? '' : ' (bu oyga tushmaydi)'}` };
  };
  const monthly = (label: string): TypeForecast => ({
    ...base,
    kind: 'monthly',
    amount: round1k(median(last3)),
    next: null,
    basis: `${label} · so‘nggi ${last3.length} oy medianasi`,
  });

  if (!days.length) return { ...base, kind: 'none', amount: 0, next: null, basis: '180 kunda yozuv yo‘q' };
  if (cycle === 'once') return { ...base, kind: 'once', amount: 0, next: null, basis: 'qo‘lda: bir martalik' };
  if (cycle === 'monthly') return monthly('qo‘lda: oylik');
  if (cycle === 'quarter') return periodic(91, 'qo‘lda: har 3 oyda');
  if (cycle === 'year') return periodic(365, 'qo‘lda: yillik');

  if (activeMonths >= 3 && gap !== null && gap <= 10) {
    const s90 = own.filter((r) => dayNo(r.date) >= now - 90).reduce((s, r) => s + r.amount, 0);
    return {
      ...base,
      kind: 'frequent',
      amount: round1k((s90 / 90) * daysIn(target)),
      next: null,
      basis: `har ~${Math.round(gap)} kunda · 90 kunda ${som(s90)} ÷ 90 × ${daysIn(target)} kun`,
    };
  }
  if (activeMonths >= 3) return monthly(gap === null ? 'har oy' : `har ~${Math.round(gap)} kunda`);
  if (gap !== null && gap > 45) return periodic(Math.round(gap), `har ~${Math.round(gap)} kunda`);
  return { ...base, kind: 'few', amount: 0, next: null, basis: `so‘nggi 4 oydan ${activeMonths} tasida · takrorlanishini qo‘lda belgilang` };
}

const PAYROLL = 'payroll:';

/** Every expense movement of the journal outside payroll, keyed by its type
 * (acct_entries.cat) or, for a row without one, by its account `acc:<code>`.
 * A reversal (credit to an expense account) counts negative. */
export function expenseRows(accounts: Account[], entries: Entry[]): ExpenseRow[] {
  const x = new Set(accounts.filter((a) => a.type === 'X').map((a) => a.code));
  const out: ExpenseRow[] = [];
  for (const e of entries) {
    if (e.source?.startsWith(PAYROLL)) continue;
    if (x.has(e.debit) && !x.has(e.credit)) out.push({ key: e.cat ?? `acc:${e.debit}`, date: e.entry_date, amount: e.amount });
    else if (x.has(e.credit) && !x.has(e.debit)) out.push({ key: e.cat ?? `acc:${e.credit}`, date: e.entry_date, amount: -e.amount });
  }
  return out;
}

/** Payroll expense of the latest month before `target` that has payroll postings. */
export function payrollBase(accounts: Account[], entries: Entry[], target: string): { month: string; amount: number } | null {
  const x = new Set(accounts.filter((a) => a.type === 'X').map((a) => a.code));
  const by = new Map<string, number>();
  for (const e of entries) {
    if (!e.source?.startsWith(PAYROLL)) continue;
    const m = e.entry_date.slice(0, 7);
    if (m >= target) continue;
    const v = x.has(e.debit) ? e.amount : x.has(e.credit) ? -e.amount : 0;
    if (v) by.set(m, (by.get(m) ?? 0) + v);
  }
  const month = [...by.keys()].sort().at(-1);
  return month ? { month, amount: round1k(by.get(month)!) } : null;
}

/** The whole target month: every type that had an expense in the window, plus payroll. */
export function forecastMonth(
  accounts: Account[],
  entries: Entry[],
  cycles: Record<string, Cycle>,
  asOf: string,
  target: string,
): MonthForecast {
  const rows = expenseRows(accounts, entries);
  const now = dayNo(asOf);
  const keys = [...new Set(rows.filter((r) => dayNo(r.date) < now && dayNo(r.date) >= now - WINDOW).map((r) => r.key))];
  const types = keys
    .map((k) => forecastType(k, rows, asOf, target, cycles[k] ?? 'auto'))
    .sort((a, b) => b.amount - a.amount || b.payments - a.payments);
  const payroll = payrollBase(accounts, entries, target);
  return { target, asOf, types, payroll, total: types.reduce((s, t) => s + t.amount, 0) + (payroll?.amount ?? 0) };
}

/** Forecast for a month made from what was known on its 1st, against what
 * was really spent in it (payroll included on both sides). */
export function backtest(accounts: Account[], entries: Entry[], cycles: Record<string, Cycle>, month: string) {
  const f = forecastMonth(accounts, entries, cycles, `${month}-01`, month);
  const x = new Set(accounts.filter((a) => a.type === 'X').map((a) => a.code));
  let actual = 0;
  for (const e of entries) {
    if (!e.entry_date.startsWith(month)) continue;
    if (x.has(e.debit) && !x.has(e.credit)) actual += e.amount;
    else if (x.has(e.credit) && !x.has(e.debit)) actual -= e.amount;
  }
  actual = Math.round(actual);
  const accuracy = actual > 0 ? Math.max(0, Math.round((1 - Math.abs(f.total - actual) / actual) * 100)) : null;
  return { month, forecast: f.total, actual, accuracy };
}
