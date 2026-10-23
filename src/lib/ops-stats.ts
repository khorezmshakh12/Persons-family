import 'server-only';
import { sql } from '@/lib/db/client';
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

export type OpsStatsData = {
  day: string;
  periods: Record<OpsPeriodKey, OpsPeriod>;
  series: { day: string; amount: number }[];
  snapshot: { active: number; frozen: number; debtors: number; debt: number };
};

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
  return { day, periods: { day: p('day'), week: p('week'), month: p('month') }, series, snapshot: { active: 0, frozen: 0, debtors: 0, debt: 0 } };
}

export function emptyOpsStats(day: string): OpsStatsData {
  return shell(day, new Date(`${day}T12:00:00+05:00`));
}

export async function loadOpsStats(): Promise<OpsStatsData> {
  const now = new Date();
  const day = tashkentDayKey(now);
  const out = shell(day, now);
  const r = ranges(day, now);
  // Six spans: 'day', 'day:prev', 'week', ... — one recordset joined by every query.
  const spans = JSON.stringify(
    (Object.keys(r) as OpsPeriodKey[]).flatMap((k) => [
      { k, a: r[k].from, b: r[k].to },
      { k: `${k}:prev`, a: r[k].prevFrom, b: r[k].prevTo },
    ]),
  );
  const seriesFrom = addDaysToKey(day, -30);

  const [pay, methods, students, activated, leads, charges, series, snap] = await Promise.all([
    sql<{ k: string; collected: number; n: number }[]>`
      select r.k, coalesce(sum(case when p.is_refund then -p.amount else p.amount end), 0) as collected,
        count(p.id) filter (where not p.is_refund)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      left join crm_payments p on p.paid_at between r.a and r.b
      group by r.k`,
    sql<{ k: string; method: string; amount: number; n: number }[]>`
      select r.k, case when p.method in ('cash', 'card', 'click', 'payme', 'uzum', 'transfer', 'online') then p.method else 'other' end as method,
        sum(case when p.is_refund then -p.amount else p.amount end) as amount,
        count(*) filter (where not p.is_refund)::int as n
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)
      join crm_payments p on p.paid_at between r.a and r.b
      group by 1, 2`,
    sql<{ k: string; created: number; left: number }[]>`
      select r.k,
        (select count(*) from crm_students s where (s.created_at at time zone 'Asia/Tashkent')::date between r.a and r.b)::int as created,
        (select count(*) from crm_students s where (s.archived_at at time zone 'Asia/Tashkent')::date between r.a and r.b)::int as left
      from jsonb_to_recordset(${spans}::jsonb) as r(k text, a date, b date)`,
    sql<{ k: string; n: number }[]>`
      with f as (
        select student_id, min(paid_at) as first_paid from crm_payments
        where student_id is not null and not is_refund and amount > 0 group by student_id
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
      from crm_payments where paid_at between ${seriesFrom} and ${day}
      group by paid_at`,
    sql<{ active: number; frozen: number; debtors: number; debt: number }[]>`
      select
        count(*) filter (where s.status = 'active'
          and coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) > 0
          and exists (select 1 from crm_payments p where p.student_id = s.id and not p.is_refund and p.amount > 0))::int as active,
        count(*) filter (where s.status = 'frozen')::int as frozen,
        count(*) filter (where s.balance < 0)::int as debtors,
        coalesce(sum(-s.balance) filter (where s.balance < 0), 0) as debt
      from crm_students s where s.archived_at is null`,
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
  if (snap[0]) out.snapshot = { ...snap[0], debt: Number(snap[0].debt) };
  return out;
}
