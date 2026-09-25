// Double-entry accounting core for Hisob-kitob — pure functions, no I/O, so
// every figure the UI shows is derived the same way and unit-tested
// (tests/accounting.test.ts). Money is in so'm; dates are 'YYYY-MM-DD'.

export type AccType = 'A' | 'CA' | 'L' | 'E' | 'R' | 'X';
export type Account = { code: string; name: string; type: AccType };
export type Entry = {
  id: string;
  entry_date: string;
  doc: string;
  description: string;
  debit: string;
  credit: string;
  amount: number;
  source: string | null;
};
export type Asset = {
  id: string;
  name: string;
  category: string;
  cost: number;
  acquired: string;
  life_years: number;
  disposed: string | null;
};
export type Course = {
  id: string;
  name: string;
  fee: number;
  students: number;
  teacher_cost: number;
  book_cost: number;
};
export type TaxSettings = {
  turnover: number;
  pit: number;
  social: number;
  profit: number;
  vat: number;
  regime: 'turn' | 'gen';
  vatExempt: boolean;
  minCash: number;
};

export const DEFAULT_TAX: TaxSettings = {
  turnover: 4,
  pit: 12,
  social: 12,
  profit: 15,
  vat: 12,
  regime: 'turn',
  vatExempt: true,
  minCash: 30_000_000,
};

/** Debit-normal accounts (balance grows with debits). */
export const debitNormal = (t: AccType) => t === 'A' || t === 'X';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 'YYYY-MM' → first / last day. */
export const monthStart = (ym: string) => `${ym}-01`;
export function monthEnd(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
/** Whole months from `a` to `b` ('YYYY-MM'). */
export function monthsBetween(a: string, b: string) {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export type LedgerLine = {
  code: string;
  name: string;
  type: AccType;
  opening: number;
  /** Turnover before the period start (rolled into the period's opening). */
  debit: number;
  credit: number;
  /** Signed balance in the account's natural direction. */
  closing: number;
  openingPeriod: number;
};

/**
 * Trial balance for a period [from, to]. `opening` balances are the books'
 * starting balances (natural direction); entries before `from` roll into the
 * period's opening, entries inside it are the period turnover.
 */
export function ledger(
  accounts: Account[],
  opening: Record<string, number>,
  entries: Entry[],
  from: string,
  to: string,
): Record<string, LedgerLine> {
  const L: Record<string, LedgerLine> = {};
  for (const a of accounts) {
    L[a.code] = { ...a, opening: opening[a.code] ?? 0, debit: 0, credit: 0, closing: 0, openingPeriod: 0 };
  }
  const pre: Record<string, { d: number; c: number }> = {};
  for (const e of entries) {
    if (e.entry_date > to) continue;
    const inPeriod = e.entry_date >= from;
    for (const [code, side] of [
      [e.debit, 'd'],
      [e.credit, 'c'],
    ] as const) {
      const line = L[code];
      if (!line) continue;
      if (inPeriod) {
        if (side === 'd') line.debit += e.amount;
        else line.credit += e.amount;
      } else {
        const p = (pre[code] ??= { d: 0, c: 0 });
        if (side === 'd') p.d += e.amount;
        else p.c += e.amount;
      }
    }
  }
  for (const line of Object.values(L)) {
    const dn = debitNormal(line.type);
    const p = pre[line.code] ?? { d: 0, c: 0 };
    line.openingPeriod = r2(line.opening + (dn ? p.d - p.c : p.c - p.d));
    line.debit = r2(line.debit);
    line.credit = r2(line.credit);
    line.closing = r2(line.openingPeriod + (dn ? line.debit - line.credit : line.credit - line.debit));
  }
  return L;
}

export type Statements = {
  revenue: number;
  cogs: number;
  gross: number;
  selling: number;
  admin: number;
  other: number;
  tax: number;
  operating: number;
  net: number;
  fixedNet: number;
  inventory: number;
  receivables: number;
  cash: number;
  currentAssets: number;
  assets: number;
  payables: number;
  advances: number;
  taxPayable: number;
  socialPayable: number;
  wagesPayable: number;
  liabilities: number;
  capital: number;
  retained: number;
  equity: number;
  /** assets − (liabilities + equity); 0 when the books balance. */
  imbalance: number;
};

/** P&L for the period (turnover of R/X accounts) + balance sheet at `to`.
 * Retained earnings = opening 8710 + every R/X movement up to `to`. */
export function statements(
  accounts: Account[],
  opening: Record<string, number>,
  entries: Entry[],
  from: string,
  to: string,
): Statements {
  const L = ledger(accounts, opening, entries, from, to);
  const turn = (c: string) => (L[c] ? L[c].debit - L[c].credit : 0);
  const bal = (c: string) => L[c]?.closing ?? 0;
  const revenue = r2(-turn('9030'));
  const cogs = r2(turn('9130'));
  const selling = r2(turn('9410'));
  const admin = r2(turn('9420'));
  const other = r2(turn('9430'));
  const tax = r2(turn('9810'));
  const gross = r2(revenue - cogs);
  const operating = r2(gross - selling - admin - other);
  const net = r2(operating - tax);

  // Cumulative result to date (all periods) for the balance sheet.
  const all = ledger(accounts, opening, entries, '0000-01-01', to);
  let cumulative = 0;
  for (const line of Object.values(all)) {
    if (line.type === 'R') cumulative += line.closing - line.opening;
    if (line.type === 'X') cumulative -= line.closing - line.opening;
  }
  const fixedNet = r2(bal('0100') - bal('0200'));
  const inventory = bal('2910');
  const receivables = bal('4010');
  const cash = r2(bal('5010') + bal('5110'));
  const currentAssets = r2(inventory + receivables + cash);
  const assets = r2(fixedNet + currentAssets);
  const payables = bal('6010');
  const advances = bal('6310');
  const taxPayable = bal('6410');
  const socialPayable = bal('6520');
  const wagesPayable = bal('6710');
  const liabilities = r2(payables + advances + taxPayable + socialPayable + wagesPayable);
  const capital = bal('8300');
  const retained = r2(bal('8710') + cumulative);
  const equity = r2(capital + retained);
  return {
    revenue, cogs, gross, selling, admin, other, tax, operating, net,
    fixedNet, inventory, receivables, cash, currentAssets, assets,
    payables, advances, taxPayable, socialPayable, wagesPayable, liabilities,
    capital, retained, equity,
    imbalance: r2(assets - liabilities - equity),
  };
}

/** Monthly P&L + cash for the last `n` months ending at `ym`. */
export function monthlySeries(
  accounts: Account[],
  opening: Record<string, number>,
  entries: Entry[],
  ym: string,
  n = 12,
) {
  const out: (Statements & { ym: string })[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(ym, -i);
    out.push({ ym: m, ...statements(accounts, opening, entries, monthStart(m), monthEnd(m)) });
  }
  return out;
}

/** Straight-line; starts the month after acquisition, stops at end of life
 * or at disposal. */
export function depreciation(a: Asset, ym: string) {
  const monthly = a.cost / (a.life_years * 12);
  const startYm = a.acquired.slice(0, 7);
  const stopYm = a.disposed ? a.disposed.slice(0, 7) : null;
  const upTo = stopYm && stopYm < ym ? stopYm : ym;
  const months = Math.max(0, Math.min(a.life_years * 12, monthsBetween(startYm, upTo)));
  const accumulated = r2(monthly * months);
  const active = monthsBetween(startYm, ym) >= 1 && monthsBetween(startYm, ym) <= a.life_years * 12 && !(stopYm && stopYm < ym);
  return {
    monthly: r2(monthly),
    /** Charge for month `ym` itself. */
    charge: active ? r2(monthly) : 0,
    accumulated,
    net: r2(a.cost - accumulated),
    monthsUsed: months,
  };
}

/** Is the asset on the balance sheet at the end of month `ym`? (acquired by
 * then and not disposed in or before it). */
export const assetOnBooks = (a: Pick<Asset, 'acquired' | 'disposed'>, ym: string) =>
  a.acquired.slice(0, 7) <= ym && !(a.disposed && a.disposed.slice(0, 7) <= ym);

/** Journal rows that write a disposed asset off the books on its disposal
 * date: accumulated depreciation (Dt 0200) and the remaining book value as a
 * loss (Dt 9430) against the original cost (Kt 0100). */
export function disposalPostings(a: Asset): { debit: string; credit: string; amount: number; description: string }[] {
  if (!a.disposed) return [];
  const d = depreciation(a, a.disposed.slice(0, 7));
  const rows = [
    { debit: '0200', credit: '0100', amount: d.accumulated, description: `Eskirish hisobdan chiqarildi: ${a.name}` },
    { debit: '9430', credit: '0100', amount: d.net, description: `Asosiy vosita hisobdan chiqarildi (qoldiq): ${a.name}` },
  ];
  return rows.filter((r) => r.amount > 0);
}

export type PayrollRow = { staffId: string; name: string; role: string; gross: number; paid: number };

/** Roles whose pay is a direct cost of teaching (9130); everyone else is
 * administrative (9420). */
export const TEACHING_ROLES = new Set(['teacher', 'head_teacher', 'assistant']);

export function payrollTaxes(rows: PayrollRow[], t: TaxSettings) {
  const list = rows.map((r) => ({
    ...r,
    teaching: TEACHING_ROLES.has(r.role),
    pit: r2((r.gross * t.pit) / 100),
    net: r2(r.gross - (r.gross * t.pit) / 100),
    social: r2((r.gross * t.social) / 100),
  }));
  const sum = (f: (x: (typeof list)[number]) => number) => r2(list.reduce((a, x) => a + f(x), 0));
  return {
    list,
    gross: sum((x) => x.gross),
    grossTeach: sum((x) => (x.teaching ? x.gross : 0)),
    grossAdmin: sum((x) => (x.teaching ? 0 : x.gross)),
    pit: sum((x) => x.pit),
    net: sum((x) => x.net),
    social: sum((x) => x.social),
    socialTeach: sum((x) => (x.teaching ? x.social : 0)),
    socialAdmin: sum((x) => (x.teaching ? 0 : x.social)),
    paid: sum((x) => x.paid),
  };
}

export type Posting = { debit: string; credit: string; amount: number; description: string; source: string };

/** The journal rows a month's payroll produces. Zero lines are dropped. */
export function payrollPostings(ym: string, rows: PayrollRow[], t: TaxSettings): Posting[] {
  const p = payrollTaxes(rows, t);
  const s = (k: string) => `payroll:${ym}:${k}`;
  return [
    { debit: '9130', credit: '6710', amount: p.grossTeach, description: "Mehnat haqi hisoblandi — o'qituvchilar", source: s('accr-teach') },
    { debit: '9420', credit: '6710', amount: p.grossAdmin, description: "Mehnat haqi hisoblandi — ma'muriyat", source: s('accr-admin') },
    { debit: '6710', credit: '6410', amount: p.pit, description: `JShDS ${t.pit}% ushlab qolindi`, source: s('pit') },
    { debit: '9130', credit: '6520', amount: p.socialTeach, description: `Ijtimoiy soliq ${t.social}% — o'qituvchilar`, source: s('soc-teach') },
    { debit: '9420', credit: '6520', amount: p.socialAdmin, description: `Ijtimoiy soliq ${t.social}% — ma'muriyat`, source: s('soc-admin') },
    { debit: '6710', credit: '5110', amount: p.paid, description: "Ish haqi to'landi (to'lovlar bo'yicha)", source: s('paid') },
  ].filter((x) => x.amount > 0);
}

/** Tax comparison for a month's figures. */
export function taxCompare(revenue: number, profitBeforeTax: number, t: TaxSettings) {
  const turnover = r2((revenue * t.turnover) / 100);
  const profit = r2((Math.max(0, profitBeforeTax) * t.profit) / 100);
  const vat = t.vatExempt ? 0 : r2(((revenue / (1 + t.vat / 100)) * t.vat) / 100);
  const general = r2(profit + vat);
  return { turnover, profit, vat, general, better: turnover <= general ? ('turn' as const) : ('gen' as const) };
}

/** Per-course monthly contribution and break-even head-count. */
export function courseEconomics(c: Course) {
  const revenue = r2(c.fee * c.students);
  const direct = r2(c.teacher_cost + c.book_cost * c.students);
  const contribution = r2(revenue - direct);
  const unit = c.fee - c.book_cost;
  const breakEven = unit > 0 ? Math.ceil(c.teacher_cost / unit) : null;
  return { revenue, direct, contribution, margin: revenue > 0 ? contribution / revenue : 0, breakEven };
}

/** Weekly cash movement (5010 + 5110) for the `n` weeks ending on the week
 * that contains `today` (weeks start Monday). */
export function cashWeeks(
  accounts: Account[],
  opening: Record<string, number>,
  entries: Entry[],
  today: string,
  n = 13,
) {
  const CASH = new Set(['5010', '5110']);
  const day = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 864e5);
  const iso = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10);
  const t = day(today);
  const dow = (new Date(t * 864e5).getUTCDay() + 6) % 7; // Monday = 0
  const lastStart = t - dow;
  const firstStart = lastStart - (n - 1) * 7;
  const start = iso(firstStart);
  const L = ledger(accounts, opening, entries, start, start);
  let balance = r2((L['5010']?.openingPeriod ?? 0) + (L['5110']?.openingPeriod ?? 0));
  const weeks = Array.from({ length: n }, (_, i) => ({ from: iso(firstStart + i * 7), to: iso(firstStart + i * 7 + 6), inflow: 0, outflow: 0, closing: 0 }));
  for (const e of entries) {
    const d = day(e.entry_date);
    if (d < firstStart || d > lastStart + 6) continue;
    const w = weeks[Math.floor((d - firstStart) / 7)];
    const inD = CASH.has(e.debit);
    const inC = CASH.has(e.credit);
    if (inD && !inC) w.inflow += e.amount;
    if (inC && !inD) w.outflow += e.amount;
  }
  for (const w of weeks) {
    w.inflow = r2(w.inflow);
    w.outflow = r2(w.outflow);
    balance = r2(balance + w.inflow - w.outflow);
    w.closing = balance;
  }
  return weeks;
}

/** Journal templates (debit, credit) from the prototype. */
export const JOURNAL_TEMPLATES: [string, string, string][] = [
  ["O'quvchi to'lovi (bank)", '5110', '4010'],
  ["O'quvchi to'lovi (kassa)", '5010', '4010'],
  ["O'qish to'lovi hisoblandi", '4010', '9030'],
  ["Oldindan to'lov", '5110', '6310'],
  ['Ijara hisob-fakturasi', '9420', '6010'],
  ["Yetkazib beruvchiga to'lov", '6010', '5110'],
  ['Marketing xarajati', '9410', '5110'],
  ['Kommunal xizmatlar', '9430', '5110'],
  ["Soliq to'lash", '6410', '5110'],
  ["Ijtimoiy soliq to'lash", '6520', '5110'],
  ['Asosiy vosita xaridi', '0100', '5110'],
  ['Darslik xaridi', '2910', '6010'],
  ['Kassadan bankka', '5110', '5010'],
];

/** Relative change from `prev` to `now` (0.1 = +10%); null when there is no
 * base. Uses |prev| so growth from a negative base still reads as growth. */
export function growthRate(now: number, prev: number): number | null {
  if (!prev) return null;
  return (now - prev) / Math.abs(prev);
}
export const fmtGrowth = (g: number | null) => (g === null ? '—' : `${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%`);

export const fmtMln = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)} mlrd` : a >= 1e6 ? `${(a / 1e6).toFixed(1)} mln` : a >= 1e3 ? `${Math.round(a / 1e3)} ming` : `${Math.round(a)}`;
  return (v < 0 ? '−' : '') + s;
};
export const fmtNum = (v: number) => (Math.round(v) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
