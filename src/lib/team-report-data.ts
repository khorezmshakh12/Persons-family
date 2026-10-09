import 'server-only';
import { sql } from '@/lib/db/client';
import { ROLE_DEPT, type Department, type Role } from '@/lib/permissions';
import { startOfTashkentMonthKey, tashkentDayKey, tashkentDayOfMonth, tashkentMidnight } from '@/lib/time';
import { buckets, insights, METRICS, type AttentionRow, type Bucket, type DeptRow, type Insight, type Range, type Series } from '@/lib/team-report';

export const DEPT_NAME: Record<Department, string> = {
  top: 'Rahbariyat',
  acad: 'Akademik',
  com: 'Tijorat',
  ops: 'Operatsiya',
  fin: 'Moliya',
  hr: 'HR',
};

export type ReportNote = { id: string; metric: string; week: string; body: string; author: string | null };

export type TeamReport = {
  range: Range;
  dept: Department | null;
  buckets: Bucket[];
  series: Series;
  depts: DeptRow[];
  attention: AttentionRow[];
  insights: Insight[];
  notes: ReportNote[];
  missing: { selfDev: number; kpiPlan: number; staff: number };
  generatedAt: string;
};

type Person = { id: string; first_name: string | null; last_name: string | null; role: Role };
const nameOf = (p: Person) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Xodim';

/** `kpiDetail`: per-person KPI grades are CEO-scoped; others get the
 * attention list without them. */
export async function loadTeamReport(range: Range, dept: Department | null = null, kpiDetail = true): Promise<TeamReport> {
  const today = tashkentDayKey();
  const bs = buckets(range, today);
  const starts = bs.map((b) => tashkentMidnight(b.start).toISOString());
  const ends = bs.map((b) => tashkentMidnight(b.end).toISOString());
  const months = bs.map((b) => `${b.start.slice(0, 7)}-01`);
  const monthEnds = bs.map((b) => (range === 'week' ? `${b.start.slice(0, 7)}-01` : `${b.end.slice(0, 7)}-01`));

  const people = (await sql<Person[]>`select id, first_name, last_name, role from profiles where is_active order by first_name`).filter(
    (p) => !dept || ROLE_DEPT[p.role] === dept,
  );
  const ids = people.map((p) => p.id);
  // The CEO files no self-development report — keep them out of both sides of the rate.
  const sdIds = people.filter((p) => p.role !== 'ceo').map((p) => p.id);
  const staffCount = people.filter((p) => p.role !== 'ceo').length;

  const rows = await sql<
    {
      i: number;
      tasks_done: number;
      on_time: number;
      missed: number;
      issues_new: number;
      issues_resolved: number;
      leads: number;
      enrolled: number;
      self_dev: number;
      kpi_avg: number | null;
    }[]
  >`
    with b as (
      select ord::int - 1 as i, s, e, m, me
      from unnest(${sql.array(starts)}::timestamptz[], ${sql.array(ends)}::timestamptz[], ${sql.array(months)}::date[], ${sql.array(monthEnds)}::date[])
        with ordinality as t(s, e, m, me, ord)
    )
    select b.i,
      (select count(*)::int from tasks t where t.status = 'done' and t.completed_at >= b.s and t.completed_at < b.e
        and t.assigned_to = any(${sql.array(ids)}::uuid[])) as tasks_done,
      (select count(*)::int from tasks t where t.status = 'done' and t.completed_at >= b.s and t.completed_at < b.e
        and (t.deadline is null or coalesce(t.submitted_at, t.completed_at) <= t.deadline)
        and t.assigned_to = any(${sql.array(ids)}::uuid[])) as on_time,
      (select count(*)::int from tasks t where t.deadline >= b.s and t.deadline < b.e and t.deadline < now()
        and coalesce(t.submitted_at, t.completed_at, 'infinity'::timestamptz) > t.deadline
        and t.assigned_to = any(${sql.array(ids)}::uuid[])) as missed,
      (select count(*)::int from issues i where i.created_at >= b.s and i.created_at < b.e) as issues_new,
      (select count(*)::int from issues i where i.status = 'done' and i.resolved_at >= b.s and i.resolved_at < b.e) as issues_resolved,
      (select count(*)::int from ops_leads l where l.created_at >= b.s and l.created_at < b.e) as leads,
      (select count(*)::int from ops_leads l where l.enrolled_at >= b.s and l.enrolled_at < b.e) as enrolled,
      (select count(*)::int from self_development sd where sd.month = b.m and sd.user_id = any(${sql.array(sdIds)}::uuid[])) as self_dev,
      (select avg(k.grade_pct)::float8 from kpi_plans k where k.grade is not null
        and k.month >= b.m and k.month ${range === 'week' ? sql`<=` : sql`<`} b.me
        and k.user_id = any(${sql.array(ids)}::uuid[])) as kpi_avg
    from b order by b.i`;

  const series = Object.fromEntries(METRICS.map((m) => [m, bs.map(() => null as number | null)])) as Series;
  for (const r of rows) {
    series.tasksDone[r.i] = r.tasks_done;
    series.onTime[r.i] = r.tasks_done ? (r.on_time / r.tasks_done) * 100 : null;
    series.missed[r.i] = r.missed;
    series.issuesNew[r.i] = r.issues_new;
    series.issuesResolved[r.i] = r.issues_resolved;
    series.leads[r.i] = r.leads;
    series.enrolled[r.i] = r.enrolled;
    series.selfDevRate[r.i] = staffCount ? Math.min(100, (r.self_dev / staffCount) * 100) : null;
    series.kpiAvg[r.i] = r.kpi_avg;
  }

  // Per person, current bucket → departments and the attention list.
  const cur = bs[bs.length - 1];
  const curS = starts[starts.length - 1];
  const curE = ends[ends.length - 1];
  const month = startOfTashkentMonthKey();
  const nextMonth = (() => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  })();
  const per = await sql<
    { id: string; done: number; on_time: number; overdue: number; self_dev: boolean; kpi_next: boolean; kpi_pct: number | null; stale_issues: number }[]
  >`
    select p.id,
      (select count(*)::int from tasks t where t.assigned_to = p.id and t.status = 'done' and t.completed_at >= ${curS} and t.completed_at < ${curE}) as done,
      (select count(*)::int from tasks t where t.assigned_to = p.id and t.status = 'done' and t.completed_at >= ${curS} and t.completed_at < ${curE}
        and (t.deadline is null or coalesce(t.submitted_at, t.completed_at) <= t.deadline)) as on_time,
      (select count(*)::int from tasks t where t.assigned_to = p.id and t.status in ('pending', 'in_progress') and t.deadline < now()) as overdue,
      exists (select 1 from self_development sd where sd.user_id = p.id and sd.month = ${month}) as self_dev,
      exists (select 1 from kpi_plans k where k.user_id = p.id and k.month = ${nextMonth} and k.status in ('submitted', 'approved')) as kpi_next,
      (select k.grade_pct::float8 from kpi_plans k where k.user_id = p.id and k.grade is not null order by k.month desc limit 1) as kpi_pct,
      (select count(*)::int from issues i where i.assigned_to = p.id and i.status <> 'done' and i.created_at < now() - interval '7 days') as stale_issues
    from profiles p where p.id = any(${sql.array(ids)}::uuid[])`;
  const byId = new Map(per.map((r) => [r.id, r]));
  const dom = tashkentDayOfMonth(new Date());

  const deptMap = new Map<Department, DeptRow & { _on: number; _sd: number; _sdN: number; _kpi: number[] }>();
  const attention: AttentionRow[] = [];
  for (const p of people) {
    const r = byId.get(p.id);
    if (!r) continue;
    const d = ROLE_DEPT[p.role];
    const row = deptMap.get(d) ?? { dept: DEPT_NAME[d], people: 0, tasksDone: 0, onTime: null, overdueNow: 0, selfDevRate: null, kpiAvg: null, _on: 0, _sd: 0, _sdN: 0, _kpi: [] };
    row.people++;
    row.tasksDone += r.done;
    row._on += r.on_time;
    row.overdueNow += r.overdue;
    if (p.role !== 'ceo') {
      row._sdN++;
      if (r.self_dev) row._sd++;
    }
    if (r.kpi_pct !== null) row._kpi.push(r.kpi_pct);
    deptMap.set(d, row);

    if (p.role === 'ceo') continue;
    const reasons: string[] = [];
    if (r.overdue) reasons.push(`${r.overdue} ta muddati o‘tgan vazifa`);
    if (r.stale_issues) reasons.push(`${r.stale_issues} ta 7 kundan ortiq ochiq muammo`);
    if (!r.self_dev && dom >= 20) reasons.push('o‘zini rivojlantirish hisoboti topshirilmagan');
    if (!r.kpi_next && dom >= 25) reasons.push('keyingi oy KPI rejasi topshirilmagan');
    if (kpiDetail && r.kpi_pct !== null && r.kpi_pct < 0) reasons.push(`oxirgi KPI: ${Math.round(r.kpi_pct)}%`);
    if (reasons.length) attention.push({ staffId: p.id, name: nameOf(p), dept: DEPT_NAME[d], reasons });
  }
  const depts: DeptRow[] = [...deptMap.values()].map(({ _on, _sd, _sdN, _kpi, ...d }) => ({
    ...d,
    onTime: d.tasksDone ? (_on / d.tasksDone) * 100 : null,
    selfDevRate: _sdN ? (_sd / _sdN) * 100 : null,
    kpiAvg: _kpi.length ? _kpi.reduce((a, b) => a + b, 0) / _kpi.length : null,
  }));
  attention.sort((a, b) => b.reasons.length - a.reasons.length);

  const notes = await sql<{ id: string; metric: string; week: string; body: string; first_name: string | null; last_name: string | null }[]>`
    select n.id, n.metric, n.week::text as week, n.body, p.first_name, p.last_name
    from report_notes n left join profiles p on p.id = n.author_id
    where n.week >= ${bs[0].start} and n.week < ${cur.end}
    order by n.created_at`;

  const notSelfDev = people.filter((p) => p.role !== 'ceo' && !byId.get(p.id)?.self_dev).length;
  const notKpi = people.filter((p) => p.role !== 'ceo' && !byId.get(p.id)?.kpi_next).length;

  return {
    range,
    dept,
    buckets: bs,
    series,
    depts: depts.sort((a, b) => b.people - a.people),
    attention,
    insights: insights(series, bs.map((b) => b.label), depts, attention, dom),
    notes: notes.map((n) => ({ id: n.id, metric: n.metric, week: n.week.slice(0, 10), body: n.body, author: n.first_name ? `${n.first_name} ${n.last_name ?? ''}`.trim() : null })),
    missing: { selfDev: notSelfDev, kpiPlan: notKpi, staff: staffCount },
    generatedAt: new Date().toISOString(),
  };
}
