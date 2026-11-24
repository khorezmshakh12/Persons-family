import 'server-only';
import { sql } from '@/lib/db/client';
import { REAL_PAYMENT } from '@/lib/ops-students';
import { trendBuckets, type TrendKey } from '@/lib/ops-trend-buckets';
import {
  addDaysToKey,
  startOfPreviousTashkentMonthKey,
  startOfTashkentMonthKey,
  tashkentDayKey,
  tashkentDayOfWeek,
  tashkentYmd,
} from '@/lib/time';

// Operation HQ › Statistika: kunlik / haftalik / oylik figures, each against the
// previous equal span (yesterday; last week Mon..same weekday; last month 1..same day).

export type OpsPeriodKey = 'day' | 'week' | 'month';

export type OpsMetrics = {
  collected: number;
  payments: number;
  methods: { method: string; amount: number; n: number }[];
  newStudents: number;
  activated: number;
  left: number;
  newLeads: number;
  charged: number;
  charges: number;
};

export type OpsPeriod = { from: string; to: string; prevFrom: string; prevTo: string; cur: OpsMetrics; prev: OpsMetrics };

/** One line chart's worth per period tab (oldest first); money arrays are 0 without statsMoney. */
export type OpsTrend = {
  labels: string[];
  active: number[];
  newStudents: number[];
  left: number[];
  newLeads: number[];
  activated: number[];
  collected: number[];
  charged: number[];
  /** Why students left in the tab's current period (Nega ketishdi). */
  reasons: { reason: string; n: number }[];
};

export type OpsStatsData = {
  day: string;
  periods: Record<OpsPeriodKey, OpsPeriod>;
  series: { day: string; amount: number }[];
  /** `open` = not archived, status active (faol or not yet). */
  snapshot: { active: number; frozen: number; debtors: number; debt: number; open: number };
  trends: Record<OpsPeriodKey, OpsTrend>;
  /** Qarzdorlar soni by day, from crm_daily_stats (kept since 2026-11-23). */
  debtHistory: { day: string; debtors: number }[];
};

const KINDS: TrendKey[] = ['day', 'week', 'month'];

function emptyTrend(day: string, k: TrendKey): OpsTrend {
  const b = trendBuckets(day, k);
  const z = () => b.map(() => 0);
  return { labels: b.map((x) => x.label), active: z(), newStudents: z(), left: z(), newLeads: z(), activated: z(), collected: z(), charged: z(), reasons: [] };
}

const emptyMetrics = (): OpsMetrics => ({
  collected: 0, payments: 0, methods: [], newStudents: 0, activated: 0, left: 0, newLeads: 0, charged: 0, charges: 0,
});

function ranges(day: string, now: Date) {
  const monOffset = (tashkentDayOfWeek(now) + 6) % 7;
  const weekFrom = addDaysToKey(day, -monOffset);
  const monthFrom = startOfTashkentMonthKey(now);
  const prevMonthFrom = startOfPreviousTashkentMonthKey(now);
  const prevMonthEnd = addDaysToKey(monthFrom, -1);
  const sameDay = addDaysToKey(prevMonthFrom, tashkentYmd(now).day - 1);
  return {
    day: { from: day, to: day, prevFrom: addDaysToKey(day, -1), prevTo: addDaysToKey(day, -1) },
    week: { from: weekFrom, to: day, prevFrom: addDaysToKey(weekFrom, -7), prevTo: addDaysToKey(day, -7) },
    month: { from: monthFrom, to: day, prevFrom: prevMonthFrom, prevTo: sameDay < prevMonthEnd ? sameDay : prevMonthEnd },
  } satisfies Record<OpsPeriodKey, { from: string; to: string; prevFrom: string; prevTo: string }>;
}

function shell(day: string, now: Date): OpsStatsData {
  const r = ranges(day, now);
  const p = (k: OpsPeriodKey): OpsPeriod => ({ ...r[k], cur: emptyMetrics(), prev: emptyMetrics() });
  const series = Array.from({ length: 31 }, (_, i) => ({ day: addDaysToKey(day, i - 30), amount: 0 }));
  return {
    day,
    periods: { day: p('day'), week: p('week'), month: p('month') },
    series,
    snapshot: { active: 0, frozen: 0, debtors: 0, debt: 0, open: 0 },
    trends: { day: emptyTrend(day, 'day'), week: emptyTrend(day, 'week'), month: emptyTrend(day, 'month') },
    debtHistory: [],
  };
}

/** The same statistics with every money figure zeroed — for staff who see
 * student and lead figures only (operations.stats without statsMoney). */
export function withoutMoney(s: OpsStatsData): OpsStatsData {
  const strip = (m: OpsMetrics): OpsMetrics => ({ ...m, collected: 0, payments: 0, methods: [], charged: 0, charges: 0 });
  const periods = Object.fromEntries(
    Object.entries(s.periods).map(([k, p]) => [k, { ...p, cur: strip(p.cur), prev: strip(p.prev) }]),
  ) as OpsStatsData['periods'];
  const trends = Object.fromEntries(
    Object.entries(s.trends).map(([k, t]) => [k, { ...t, collected: t.collected.map(() => 0), charged: t.charged.map(() => 0) }]),
  ) as OpsStatsData['trends'];
  return { ...s, periods, trends, series: s.series.map((x) => ({ ...x, amount: 0 })), snapshot: { ...s.snapshot, debt: 0 } };
}

export function emptyOpsStats(day: string): OpsStatsData {
  return shell(day, new Date(`${day}T12:00:00+05:00`));
}

/** Right-now counts (faol / muzlatilgan / qarzdorlar); crm-billing stores one a day in crm_daily_stats. */
export async function loadOpsSnapshot(): Promise<OpsStatsData['snapshot']> {
  const [row] = await sql<{ active: number; frozen: number; debtors: number; debt: number; open: number }[]>`
    select
    count(*) filter (where s.status = 'active'
      and coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) > 0
      and s.discount_pct < 100
      and (s.paid_elsewhere_at is not null or exists (select 1 from crm_payments p where p.student_id = s.id and not p.is_refund and p.amount > 0 and not exists (select 1 from crm_payments r where r.reverses = p.id))))::int as active,
    count(*) filter (where s.status = 'frozen')::int as frozen,
    count(*) filter (where s.status = 'active')::int as open,
    count(*) filter (where s.balance < 0)::int as debtors,
    coalesce(sum(-s.balance) filter (where s.balance < 0), 0) as debt
    from crm_students s where s.archived_at is null`;
  return row ? { ...row, debt: Number(row.debt) } : { active: 0, frozen: 0, debtors: 0, debt: 0, open: 0 };
}

/**
 * Grafiklar: per bucket counts and sums. «Faol» at a bucket's end is
 * rebuilt from history: activated (first real payment or paid elsewhere)
 * by then, not archived by then, fee set and under 100% discount today.
 * Freezes are not kept historically, so the last point is the live count.
 */
async function loadTrends(day: string, ranges: Record<OpsPeriodKey, { from: string; to: string }>, live: number) {
  const out = { day: emptyTrend(day, 'day'), week: emptyTrend(day, 'week'), month: emptyTrend(day, 'month') };
  const buckets = sql.json(KINDS.flatMap((k) => trendBuckets(day, k).map((b, i) => ({ k, i, a: b.from, b: b.to }))) as never);
  const spans = sql.json(KINDS.map((k) => ({ k, a: ranges[k].from, b: ranges[k].to })) as never);
  const [people, money, reasons, debt] = await Promise.all([
    sql<{ k: TrendKey; i: number; created: number; left: number; leads: number; activated: number; active: number }[]>`
      with pay as (
        select y.student_id as sid, min(y.paid_at) as first from crm_payments y
        where y.student_id is not null and not y.is_refund and y.amount > 0
          and not exists (select 1 from crm_payments r where r.reverses = y.id)
        group by y.student_id
      ), act as (
        select s.id, s.archived_at, least(pay.first, (s.paid_elsewhere_at at time zone 'Asia/Tashkent')::date) as since
        from crm_students s left join pay on pay.sid = s.id
        where s.discount_pct < 100
          and coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) > 0
      )
      select t.k, t.i,
        (select count(*) from crm_students s where (s.created_at at time zone 'Asia/Tashkent')::date between t.a and t.b)::int as created,
        (select count(*) from crm_students s where (s.archived_at at time zone 'Asia/Tashkent')::date between t.a and t.b)::int as left,
        (select count(*) from crm_leads l where l.archived_at is null and (l.created_at at time zone 'Asia/Tashkent')::date between t.a and t.b)::int as leads,
        (select count(*) from pay where pay.first between t.a and t.b)::int as activated,
        (select count(*) from act where act.since <= t.b and (act.archived_at is null or (act.archived_at at time zone 'Asia/Tashkent')::date > t.b))::int as active
      from jsonb_to_recordset(${buckets}::jsonb) as t(k text, i int, a date, b date)`,
    sql<{ k: TrendKey; i: number; collected: number; charged: number }[]>`
      select t.k, t.i,
        (select coalesce(sum(case when p.is_refund then -p.amount else p.amount end), 0) from crm_payments p
          where p.paid_at between t.a and t.b and ${REAL_PAYMENT('p')}) as collected,
        (select coalesce(sum(c.amount), 0) from crm_charges c
          where c.due_date between t.a and t.b and c.source in ('auto', 'manual') and c.status <> 'waived') as charged
      from jsonb_to_recordset(${buckets}::jsonb) as t(k text, i int, a date, b date)`,
    sql<{ k: TrendKey; reason: string; n: number }[]>`
      select r.k, coalesce(nullif(s.leave_reason, ''), 'Sababsiz') as reason, count(*)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      join crm_students s on (s.archived_at at time zone 'Asia/Tashkent')::date between r.a and r.b
      group by 1, 2 order by 3 desc`,
    sql<{ day: string; debtors: number }[]>`
      select * from (select day::text as day, debtors from crm_daily_stats order by day desc limit 90) x order by day`,
  ]);
  for (const r of people) {
    const t = out[r.k];
    t.newStudents[r.i] = r.created;
    t.left[r.i] = r.left;
    t.newLeads[r.i] = r.leads;
    t.activated[r.i] = r.activated;
    t.active[r.i] = r.active;
  }
  for (const r of money) {
    out[r.k].collected[r.i] = Number(r.collected);
    out[r.k].charged[r.i] = Number(r.charged);
  }
  for (const r of reasons) out[r.k].reasons.push({ reason: r.reason, n: r.n });
  for (const t of Object.values(out)) t.active[t.active.length - 1] = live;
  return { trends: out, debtHistory: debt };
}

export async function loadOpsStats(): Promise<OpsStatsData> {
  const now = new Date();
  const day = tashkentDayKey(now);
  const out = shell(day, now);
  const r = ranges(day, now);
  // Six spans: 'day', 'day:prev', 'week', ... — one recordset joined by every query.
  // Passed with sql.json: a pre-stringified string gets JSON.stringify'd again
  // by postgres-js (the param is typed jsonb), so jsonb_to_recordset saw a
  // scalar string and every query failed — Statistika showed all zeros.
  const spans = sql.json(
    (Object.keys(r) as OpsPeriodKey[]).flatMap((k) => [
      { k, a: r[k].from, b: r[k].to },
      { k: `${k}:prev`, a: r[k].prevFrom, b: r[k].prevTo },
    ]) as never,
  );
  const seriesFrom = addDaysToKey(day, -30);

  const [pay, methods, students, activated, leads, charges, series, snap] = await Promise.all([
    sql<{ k: string; collected: number; n: number }[]>`
      select r.k, coalesce(sum(case when p.is_refund then -p.amount else p.amount end), 0) as collected,
        count(p.id) filter (where not p.is_refund)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      left join crm_payments p on p.paid_at between r.a and r.b and ${REAL_PAYMENT('p')}
      group by r.k`,
    sql<{ k: string; method: string; amount: number; n: number }[]>`
      select r.k, case when p.method in ('cash', 'card', 'click', 'payme', 'uzum', 'transfer', 'online') then p.method else 'other' end as method,
        sum(case when p.is_refund then -p.amount else p.amount end) as amount,
        count(*) filter (where not p.is_refund)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      join crm_payments p on p.paid_at between r.a and r.b and ${REAL_PAYMENT('p')}
      group by 1, 2`,
    sql<{ k: string; created: number; left: number }[]>`
      select r.k,
        (select count(*) from crm_students s where (s.created_at at time zone 'Asia/Tashkent')::date between r.a and r.b)::int as created,
        (select count(*) from crm_students s where (s.archived_at at time zone 'Asia/Tashkent')::date between r.a and r.b)::int as left
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)`,
    sql<{ k: string; n: number }[]>`
      with f as (
        select y.student_id, min(y.paid_at) as first_paid from crm_payments y
        where y.student_id is not null and not y.is_refund and y.amount > 0
          and not exists (select 1 from crm_payments r where r.reverses = y.id)
        group by y.student_id
      )
      select r.k, count(f.student_id)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      left join f on f.first_paid between r.a and r.b
      group by r.k`,
    sql<{ k: string; n: number }[]>`
      select r.k, (select count(*) from crm_leads l where l.archived_at is null
        and (l.created_at at time zone 'Asia/Tashkent')::date between r.a and r.b)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)`,
    sql<{ k: string; amount: number; n: number }[]>`
      select r.k, coalesce(sum(c.amount), 0) as amount, count(c.id)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      left join crm_charges c on c.due_date between r.a and r.b and c.source in ('auto', 'manual') and c.status <> 'waived'
      group by r.k`,
    sql<{ day: string; amount: number }[]>`
      select paid_at::text as day, sum(case when is_refund then -amount else amount end) as amount
      from crm_payments p where paid_at between ${seriesFrom} and ${day} and ${REAL_PAYMENT('p')}
      group by paid_at`,
    loadOpsSnapshot(),
  ]);

  const at = (k: string): OpsMetrics => {
    const [key, prev] = k.split(':') as [OpsPeriodKey, string | undefined];
    return prev ? out.periods[key].prev : out.periods[key].cur;
  };
  for (const x of pay) Object.assign(at(x.k), { collected: Number(x.collected), payments: x.n });
  for (const x of methods) at(x.k).methods.push({ method: x.method, amount: Number(x.amount), n: x.n });
  for (const x of students) Object.assign(at(x.k), { newStudents: x.created, left: x.left });
  for (const x of activated) at(x.k).activated = x.n;
  for (const x of leads) at(x.k).newLeads = x.n;
  for (const x of charges) Object.assign(at(x.k), { charged: Number(x.amount), charges: x.n });
  for (const p of Object.values(out.periods)) for (const m of [p.cur, p.prev]) m.methods.sort((a, b) => b.amount - a.amount);

  const byDay = new Map(series.map((s) => [s.day, Number(s.amount)]));
  for (const s of out.series) s.amount = byDay.get(s.day) ?? 0;
  out.snapshot = snap;
  Object.assign(out, await loadTrends(day, r, snap.active + snap.frozen));
  return out;
}
