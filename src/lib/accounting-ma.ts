// Management-accounting & statement helpers for Hisob-kitob that go beyond
// the core ledger (src/lib/accounting.ts): cost structure, CVP, segment P&L,
// flexible budget, sensitivity, cash-flow statement, ratios, MA→FA
// reconciliation, cash forecast and fixed-asset NBV projection. Pure
// functions; unit-tested in tests/accounting-ma.test.ts.

import {
  cashWeeks,
  courseEconomics,
  depreciation,
  ledger,
  type Account,
  type Asset,
  type Course,
  type Entry,
  type Statements,
} from './accounting';

const r2 = (v: number) => Math.round(v * 100) / 100 || 0;
const CASH = new Set(['5010', '5110']);

/* ------------------------------------------------------------ cost & CVP */

/** Totals of the course model: head-count, revenue, direct (variable) cost. */
export function courseTotals(courses: Course[]) {
  let N = 0;
  let revenue = 0;
  let teacher = 0;
  let books = 0;
  for (const c of courses) {
    N += c.students;
    revenue += c.fee * c.students;
    teacher += c.teacher_cost;
    books += c.book_cost * c.students;
  }
  return { N, revenue: r2(revenue), teacher: r2(teacher), books: r2(books), direct: r2(teacher + books) };
}

/** Cost–volume–profit on the course model with the month's journal fixed
 * costs. Direct course cost is averaged per student (variable), fixed =
 * selling + admin + other period costs. */
export function cvp(courses: Course[], fixed: number) {
  const t = courseTotals(courses);
  const fee = t.N ? t.revenue / t.N : 0;
  const vc = t.N ? t.direct / t.N : 0;
  const cm = fee - vc;
  const contribution = r2(t.revenue - t.direct);
  const profit = r2(contribution - fixed);
  const breakEven = cm > 0 ? Math.ceil(fixed / cm) : null;
  const safety = breakEven !== null && t.N > 0 ? (t.N - breakEven) / t.N : null;
  const leverage = profit > 0 ? contribution / profit : null;
  return { ...t, fee: r2(fee), vc: r2(vc), cm: r2(cm), contribution, fixed: r2(fixed), profit, breakEven, safety, leverage };
}

/** Revenue / total-cost / fixed-cost lines at `steps + 1` volumes 0..max. */
export function cvpCurve(c: ReturnType<typeof cvp>, steps = 10) {
  const max = Math.max(10, Math.ceil(Math.max(c.N * 1.4, (c.breakEven ?? 0) * 1.25)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const n = Math.round((max * i) / steps);
    return { n, revenue: r2(c.fee * n), cost: r2(c.fixed + c.vc * n), fixed: c.fixed };
  });
}

export type Driver = 'students' | 'revenue' | 'equal';

/** Segment P&L: fixed costs allocated to courses by `driver`; the keep/close
 * decision uses contribution only (allocated fixed cost stays if a course
 * closes — relevant costing). Allocations always sum to `fixed`. */
export function segmentPL(courses: Course[], fixed: number, driver: Driver) {
  const base = (c: Course) => (driver === 'students' ? c.students : driver === 'revenue' ? c.fee * c.students : 1);
  const total = courses.reduce((a, c) => a + base(c), 0);
  return courses.map((c) => {
    const e = courseEconomics(c);
    const share = total > 0 ? base(c) / total : courses.length ? 1 / courses.length : 0;
    const alloc = r2(fixed * share);
    const segment = r2(e.contribution - alloc);
    return {
      id: c.id,
      name: c.name,
      students: c.students,
      ...e,
      perStudent: c.students ? r2(e.contribution / c.students) : 0,
      hours: c.hours_month ?? 0,
      alloc,
      segment,
      keep: e.contribution > 0,
      status: segment < 0 ? ('loss' as const) : e.margin < 0.5 ? ('low' as const) : ('ok' as const),
    };
  });
}

/** Monthly teacher cost of a course: `share` % of its revenue when a share is
 * set (the teacher-share pay model), otherwise the fixed monthly cost. */
export function teacherCostFor(fee: number, students: number, share: number | null | undefined, fixed: number) {
  if (share === null || share === undefined || !Number.isFinite(share)) return r2(fixed);
  return r2((fee * students * Math.min(100, Math.max(0, share))) / 100);
}

/** Cost of one lesson hour: (direct + fixed monthly cost) / lesson hours per
 * month; null when no hours are recorded. */
export function costPerLessonHour(courses: Course[], fixed: number) {
  const hours = courses.reduce((a, c) => a + (c.hours_month ?? 0), 0);
  const cost = courseTotals(courses).direct + fixed;
  return { hours: r2(hours), cost: r2(cost), perHour: hours > 0 ? r2(cost / hours) : null };
}

/** Seat capacity of the timetable: Σ room seats × time slots × cohorts
 * (odd/even days) — same basis as the operations plan. `rooms` are the room
 * codes in use; `caps` the room register; unknown rooms use `defaultSeats`. */
export function seatCapacity(rooms: string[], caps: { code: string; capacity: number }[], defaultSeats: number, slots: number, cohorts = 2) {
  const seats = [...new Set(rooms.filter(Boolean))].reduce((a, r) => a + (caps.find((c) => c.code === r)?.capacity ?? defaultSeats), 0);
  return seats * Math.max(0, slots) * cohorts;
}

/** Does the head-count `need` fit into `cap` seats? util = need / cap. */
export function capacityFit(need: number | null, cap: number) {
  if (need === null || cap <= 0) return { fits: null, util: null };
  return { fits: need <= cap, util: need / cap };
}

/* -------------------------------------------------------- flexible budget */

export type BudgetLine = { code: string; name: string; type: 'R' | 'X'; plan: number; actual: number };
/** Accounts that move with head-count: tuition revenue, cost of teaching and
 * the turnover tax (a % of revenue). */
export const VARIABLE_CODES = new Set(['9030', '9130', '9810']);

/** Static vs flexed budget variance. k = actual / planned head-count.
 * Volume variance = flexed − static; spending = actual − flexed; both signed
 * so + is Favourable. volume + spending = total for every line. */
export function flexBudget(lines: BudgetLine[], plannedN: number, actualN: number, flex = true) {
  const k = flex && plannedN > 0 && actualN > 0 ? actualN / plannedN : 1;
  const rows = lines.map((l) => {
    const variable = VARIABLE_CODES.has(l.code);
    const flexed = r2(variable ? l.plan * k : l.plan);
    const sg = l.type === 'R' ? 1 : -1;
    return {
      ...l,
      variable,
      flexed,
      volume: r2((flexed - l.plan) * sg),
      spending: r2((l.actual - flexed) * sg),
      total: r2((l.actual - l.plan) * sg),
    };
  });
  const profit = (f: 'plan' | 'flexed' | 'actual') => r2(rows.reduce((a, r) => a + (r.type === 'R' ? r[f] : -r[f]), 0));
  return { k, rows, plan: profit('plan'), flexed: profit('flexed'), actual: profit('actual') };
}

/* ------------------------------------------------------ scenario helpers */

/** ±`step` change of each driver and the resulting profit delta, sorted by
 * impact (tornado). `model` returns profit for a driver set. */
export function tornado<K extends string>(model: (p: Record<K, number>) => number, base: Record<K, number>, step = 10) {
  const p0 = model(base);
  return (Object.keys(base) as K[])
    .map((k) => {
      const up = r2(model({ ...base, [k]: base[k] + step }) - p0);
      const down = r2(model({ ...base, [k]: base[k] - step }) - p0);
      return { k, up, down, range: Math.max(Math.abs(up), Math.abs(down)) };
    })
    .sort((a, b) => b.range - a.range);
}

/** Students needed for a target monthly profit: (fixed + target) / CM. */
export const studentsForTarget = (fixed: number, target: number, cmPerStudent: number) =>
  cmPerStudent > 0 ? Math.max(0, Math.ceil((fixed + target) / cmPerStudent)) : null;

/* ------------------------------------------------- cash-flow statement */

export type CfCat = 'op' | 'inv' | 'fin';
/** Investing = fixed assets (0xxx), financing = equity (8xxx), else operating. */
export const cfCategory = (counter: string): CfCat => (counter.startsWith('0') ? 'inv' : counter.startsWith('8') ? 'fin' : 'op');

/** Direct-method cash-flow statement for [from, to]: every cash movement
 * (5010/5110 against a non-cash account) grouped by counter account.
 * closing = opening + op + inv + fin, equal to the ledger's cash balance. */
export function cashFlowStatement(accounts: Account[], opening: Record<string, number>, entries: Entry[], from: string, to: string) {
  const L = ledger(accounts, opening, entries, from, to);
  const open = r2((L['5010']?.openingPeriod ?? 0) + (L['5110']?.openingPeriod ?? 0));
  const lines = new Map<string, { cat: CfCat; code: string; amount: number }>();
  const tot = { op: 0, inv: 0, fin: 0 };
  for (const e of entries) {
    if (e.entry_date < from || e.entry_date > to) continue;
    const din = CASH.has(e.debit);
    const kin = CASH.has(e.credit);
    if (din === kin) continue;
    const counter = din ? e.credit : e.debit;
    const v = din ? e.amount : -e.amount;
    const cat = cfCategory(counter);
    const key = `${cat}|${counter}|${v >= 0 ? 'in' : 'out'}`;
    const l = lines.get(key) ?? { cat, code: counter, amount: 0 };
    l.amount = r2(l.amount + v);
    lines.set(key, l);
    tot[cat] = r2(tot[cat] + v);
  }
  return {
    opening: open,
    lines: [...lines.values()].sort((a, b) => a.cat.localeCompare(b.cat) || b.amount - a.amount),
    ...tot,
    closing: r2(open + tot.op + tot.inv + tot.fin),
  };
}

/* --------------------------------------------------------------- ratios */

const div = (a: number, b: number) => (b > 0 ? a / b : null);
export function ratios(s: Statements) {
  return {
    current: div(s.currentAssets, s.liabilities),
    quick: div(s.cash + s.receivables, s.liabilities),
    ros: div(s.net, s.revenue),
    roa: div(s.net, s.assets),
    roe: div(s.net, s.equity),
    de: div(s.liabilities, s.equity),
  };
}

/* --------------------------------------------------- MA → FA reconciliation */

/** Bridges the management result (course model contribution − journal fixed
 * costs) to the journal's net profit. Every row is an exact difference, so
 * the last row always equals statements().net. */
export function reconcile(courses: Course[], s: Statements) {
  const t = courseTotals(courses);
  const fixed = r2(s.selling + s.admin + s.other);
  const ma = r2(t.revenue - t.direct - fixed);
  const revDiff = r2(s.revenue - t.revenue);
  const costDiff = r2(t.direct - s.cogs);
  return {
    ma,
    rows: [
      { n: 'Tushum farqi (jurnal − kurslar modeli)', v: revDiff },
      { n: 'To‘g‘ridan-to‘g‘ri xarajat farqi (model − 9130)', v: costDiff },
      { n: 'Soliq (9810)', v: -s.tax },
    ],
    fa: r2(ma + revDiff + costDiff - s.tax),
  };
}

/* --------------------------------------------------------- cash forecast */

export type CashBucket = 'pay' | 'tax' | 'mkt' | 'ops' | 'capex' | 'other';
export const CASH_BUCKETS: [CashBucket, string][] = [
  ['pay', 'Ish haqi'],
  ['tax', 'Soliqlar'],
  ['mkt', 'Marketing'],
  ['ops', 'Ijara, kommunal, yetkazib beruvchi'],
  ['capex', 'Asosiy vositalar'],
  ['other', 'Boshqa'],
];
export function cashBucket(counter: string): CashBucket {
  if (counter === '6710') return 'pay';
  if (counter === '6410' || counter === '6520' || counter === '9810') return 'tax';
  if (counter === '9410') return 'mkt';
  if (counter === '6010' || counter === '9420' || counter === '9430' || counter === '2910') return 'ops';
  if (counter.startsWith('0')) return 'capex';
  return 'other';
}

/** Forward `n`-week cash projection from the weekly average of the last
 * `lookback` weeks of real cash movements (by outflow category), starting at
 * today's cash balance. Returns [] averages when there is no history. */
export function cashForecast(accounts: Account[], opening: Record<string, number>, entries: Entry[], today: string, n = 13, lookback = 13) {
  const hist = cashWeeks(accounts, opening, entries, today, lookback);
  const from = hist[0]?.from ?? today;
  const to = hist.at(-1)?.to ?? today;
  const out: Record<CashBucket, number> = { pay: 0, tax: 0, mkt: 0, ops: 0, capex: 0, other: 0 };
  let inflow = 0;
  for (const e of entries) {
    if (e.entry_date < from || e.entry_date > to) continue;
    const din = CASH.has(e.debit);
    const kin = CASH.has(e.credit);
    if (din === kin) continue;
    if (din) inflow += e.amount;
    else out[cashBucket(e.debit)] += e.amount;
  }
  const avgIn = r2(inflow / lookback);
  const avgOut = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, r2(v / lookback)])) as Record<CashBucket, number>;
  const outTotal = r2(Object.values(avgOut).reduce((a, b) => a + b, 0));
  let bal = hist.at(-1)?.closing ?? 0;
  const start = hist.at(-1)?.to ?? today;
  const day = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 864e5);
  const iso = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10);
  const weeks = Array.from({ length: n }, (_, i) => {
    bal = r2(bal + avgIn - outTotal);
    return { from: iso(day(start) + 1 + i * 7), inflow: avgIn, out: avgOut, outflow: outTotal, closing: bal };
  });
  return { opening: hist.at(-1)?.closing ?? 0, avgIn, avgOut, outTotal, weeks };
}

/* ------------------------------------------------------- fixed assets */

/** Net book value per category at the end of each month in `months`
 * (assets not yet acquired or already disposed count 0). */
export function nbvByCategory(assets: Asset[], months: string[]) {
  const cats = [...new Set(assets.map((a) => a.category || '—'))];
  return cats.map((c) => ({
    category: c,
    values: months.map((m) =>
      r2(
        assets
          .filter((a) => (a.category || '—') === c && a.acquired.slice(0, 7) <= m && !(a.disposed && a.disposed.slice(0, 7) <= m))
          .reduce((s, a) => s + depreciation(a, m).net, 0),
      ),
    ),
  }));
}

/* --------------------------------------------------------- tax calendar */

/** Filing/payment deadlines that follow month `ym` (Uzbek tax code defaults;
 * the accountant confirms). Amounts are the month's accruals. */
export function taxCalendar(ym: string, a: { pit: number; social: number; turnover: number }) {
  const [y, m] = ym.split('-').map(Number);
  const nx = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows: { date: string; n: string; amount: number | null }[] = [
    { date: `${nx}-15`, n: `JShDS va ijtimoiy soliq (${ym})`, amount: r2(a.pit + a.social) },
    { date: `${nx}-15`, n: `Aylanmadan olinadigan soliq (${ym})`, amount: a.turnover },
  ];
  if (m % 3 === 0) rows.push({ date: `${nx}-25`, n: `Moliyaviy hisobot (${Math.ceil(m / 3)}-chorak)`, amount: null });
  return rows;
}
