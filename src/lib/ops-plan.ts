/**
 * Operatsiya HQ growth-plan maths (pure — unit-tested in tests/ops-plan.test.ts).
 *
 * The plan is the reverse funnel of the owner's prototype, driven by real
 * inputs: a student target and deadline (ops_settings), the current base
 * (group head-counts), and per-scenario rates the owner enters
 * (monthly churn, lead→trial, lead→payment, CPL in so'm, ad CTR).
 * Day keys are Tashkent 'YYYY-MM-DD' strings; weekdays are computed on the
 * key itself (UTC date arithmetic), so no server-clock dependence.
 */

export type ScKey = 'worst' | 'average' | 'best';
export const SC_KEYS: ScKey[] = ['worst', 'average', 'best'];
export const SC_NAMES: Record<ScKey, string> = { worst: 'Pessimistik', average: 'Bazaviy', best: 'Optimistik' };

/** All rates in percent; cpl in so'm per lead. */
export type Scenario = { churn: number; trial: number; conv: number; cpl: number; ctr: number };
export type OpsPlan = {
  target: number;
  deadline: string;
  /** Seats per room when the room register has no capacity. */
  seats: number;
  /** Working days per week (Mon..). 6 = Mon–Sat. */
  workDays: number;
  scenarios: Record<ScKey, Scenario>;
};

const ZERO: Scenario = { churn: 0, trial: 0, conv: 0, cpl: 0, ctr: 0 };
export const EMPTY_PLAN: OpsPlan = {
  target: 0,
  deadline: '',
  seats: 14,
  workDays: 6,
  scenarios: { worst: { ...ZERO }, average: { ...ZERO }, best: { ...ZERO } },
};

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
export function parseScenario(v: unknown): Scenario {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    churn: num(o.churn, 0, 100, 0),
    trial: num(o.trial, 0, 100, 0),
    conv: num(o.conv, 0, 100, 0),
    cpl: num(o.cpl, 0, 1e9, 0),
    ctr: num(o.ctr, 0, 100, 0),
  };
}
/** Sanitise a stored ops_settings 'plan' value (anything → a valid plan). */
export function parsePlan(v: unknown): OpsPlan {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const sc = (o.scenarios && typeof o.scenarios === 'object' ? o.scenarios : {}) as Record<string, unknown>;
  return {
    target: Math.round(num(o.target, 0, 100000, 0)),
    deadline: typeof o.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.deadline) ? o.deadline : '',
    seats: Math.round(num(o.seats, 1, 200, 14)),
    workDays: Math.round(num(o.workDays, 1, 7, 6)),
    scenarios: { worst: parseScenario(sc.worst), average: parseScenario(sc.average), best: parseScenario(sc.best) },
  };
}
export const planReady = (p: OpsPlan, today: string) => p.target > 0 && !!p.deadline && p.deadline >= today;

const ms = (k: string) => Date.parse(`${k}T00:00:00Z`);
const key = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (k: string, d: number) => key(ms(k) + d * 864e5);
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return key(Date.UTC(y, m, 0));
};
const nextYm = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Working days in [from, to] inclusive; Mon=1 … Sun=7, counted if ≤ perWeek. */
export function workDaysBetween(from: string, to: string, perWeek: number): number {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const wd = new Date(ms(k)).getUTCDay() || 7;
    if (wd <= perWeek) n++;
  }
  return n;
}

export type PlanMonth = {
  ym: string;
  start: number;
  churn: number;
  sales: number;
  end: number;
  leads: number;
  trials: number;
  reach: number;
  budget: number;
  days: number;
  dailyLeads: number;
};

/**
 * Month-by-month plan from `today` to the deadline. The net growth
 * (target − baseline) is spread by working days; each month must also win
 * back its churn (start × churn%, pro-rated for a part month), and the funnel
 * rates turn required sales into leads, trials and ad reach.
 */
export function planMonths(plan: OpsPlan, sc: Scenario, baseline: number, today: string): PlanMonth[] {
  if (!planReady(plan, today)) return [];
  const total = workDaysBetween(today, plan.deadline, plan.workDays);
  const out: PlanMonth[] = [];
  let start = baseline;
  let cum = 0;
  for (let ym = today.slice(0, 7); ym <= plan.deadline.slice(0, 7); ym = nextYm(ym)) {
    const from = ym === today.slice(0, 7) ? today : `${ym}-01`;
    const to = ym === plan.deadline.slice(0, 7) ? plan.deadline : monthEnd(ym);
    const days = workDaysBetween(from, to, plan.workDays);
    const full = workDaysBetween(`${ym}-01`, monthEnd(ym), plan.workDays) || 1;
    cum += days;
    const end = to === plan.deadline ? plan.target : Math.round(baseline + ((plan.target - baseline) * cum) / (total || 1));
    const churn = Math.round(((start * sc.churn) / 100) * (days / full));
    const sales = Math.max(0, end - start + churn);
    const leads = sc.conv > 0 ? Math.ceil(sales / (sc.conv / 100)) : 0;
    const trials = Math.ceil((leads * sc.trial) / 100);
    const reach = sc.ctr > 0 ? Math.ceil(leads / (sc.ctr / 100)) : 0;
    out.push({ ym, start, churn, sales, end, leads, trials, reach, budget: leads * sc.cpl, days, dailyLeads: days ? leads / days : 0 });
    start = end;
  }
  return out;
}

export type PlanSummary = {
  netGrowth: number;
  churnTotal: number;
  sales: number;
  leads: number;
  trials: number;
  reach: number;
  budget: number;
  days: number;
  dailyLeads: number;
  dailySales: number;
  cac: number;
};
export function planSummary(months: PlanMonth[], baseline: number, target: number): PlanSummary {
  const s = (f: (m: PlanMonth) => number) => months.reduce((a, m) => a + f(m), 0);
  const days = s((m) => m.days);
  const sales = s((m) => m.sales);
  const leads = s((m) => m.leads);
  const budget = s((m) => m.budget);
  return {
    netGrowth: target - baseline,
    churnTotal: s((m) => m.churn),
    sales,
    leads,
    trials: s((m) => m.trials),
    reach: s((m) => m.reach),
    budget,
    days,
    dailyLeads: days ? leads / days : 0,
    dailySales: days ? sales / days : 0,
    cac: sales ? budget / sales : 0,
  };
}

/** Lifetime value: monthly fee × expected lifetime (1 / churn) months. */
export const lifetimeValue = (avgFee: number, churnPct: number) => (churnPct > 0 ? avgFee / (churnPct / 100) : null);

/**
 * Forecast of month-end students if the current lead flow continues:
 * end = start − churn + leadsPerMonth × conversion.
 */
export function forecast(plan: OpsPlan, sc: Scenario, baseline: number, months: PlanMonth[], leadsPerMonth: number): number[] {
  let start = baseline;
  return months.map((m) => {
    const full = workDaysBetween(`${m.ym}-01`, monthEnd(m.ym), plan.workDays) || 1;
    const share = m.days / full;
    const end = Math.max(0, start - Math.round(((start * sc.churn) / 100) * share) + Math.round(leadsPerMonth * share * (sc.conv / 100)));
    start = end;
    return end;
  });
}

/** Plan-control tone of a month: actual sales vs plan. */
export const monthTone = (actual: number, plan: number): 'ok' | 'warn' | 'bad' =>
  plan <= 0 || actual >= plan ? 'ok' : actual >= plan * 0.7 ? 'warn' : 'bad';

/** Occupancy per time slot: busy cells / rooms. Peak = the busiest slot. */
export function peakLoad(busy: { room: string; time: string }[], rooms: string[], times: string[]) {
  if (!rooms.length || !times.length) return { pct: 0, time: '' };
  const set = new Set(busy.map((b) => `${b.room}|${b.time}`));
  let best = { pct: 0, time: '' };
  for (const t of times) {
    const pct = (rooms.filter((r) => set.has(`${r}|${t}`)).length / rooms.length) * 100;
    if (pct > best.pct) best = { pct, time: t };
  }
  return best;
}

/** Log-scale bar width (%) for the reverse funnel; min keeps labels legible. */
export function logWidth(v: number, max: number, min: number, floor = 22): number {
  if (v <= 0 || max <= 0) return floor;
  const lo = Math.log10(Math.max(1, min * 0.6));
  const hi = Math.log10(Math.max(max, 1));
  if (hi <= lo) return 100;
  return Math.max(floor, Math.min(100, ((Math.log10(v) - lo) / (hi - lo)) * 100));
}
