import 'server-only';
import { sql } from '@/lib/db/client';
import { FINANCE_METRICS, type Checkin, type KeyResult, type Objective, type OkrMetric } from '@/lib/strategy-okr';

// Calendar month in Tashkent, as timestamptz bounds and as a date range.
const MONTH_START = sql`(date_trunc('month', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent')`;
const MONTH_DAY0 = sql`date_trunc('month', now() at time zone 'Asia/Tashkent')::date`;

/** Live values of every auto metric. Finance metrics only when `finance`. */
async function liveMetrics(spaceId: string, finance: boolean): Promise<Partial<Record<OkrMetric, number>>> {
  const [r] = await sql<
    {
      leads: number;
      enrolled: number;
      students: number;
      revenue: number | null;
      st_total: number;
      st_done: number;
      tasks_done: number;
      issues_done: number;
      staff: number;
    }[]
  >`
    select
      (select count(*) from ops_leads where created_at >= ${MONTH_START})::int as leads,
      (select count(*) from ops_leads where stage = 'enrolled' and enrolled_at >= ${MONTH_START})::int as enrolled,
      (select coalesce(sum(students), 0) from acct_courses)::int as students,
      ${
        finance
          ? sql`(select coalesce(sum(e.amount), 0) from acct_entries e
                 join acct_accounts a on a.code = e.credit and a.type = 'R'
                 where e.entry_date >= ${MONTH_DAY0})::float8`
          : sql`null::float8`
      } as revenue,
      (select count(*) from strategy_tasks where space_id = ${spaceId})::int as st_total,
      (select count(*) from strategy_tasks where space_id = ${spaceId} and status = 'done')::int as st_done,
      (select count(*) from tasks where status = 'done' and completed_at >= ${MONTH_START})::int as tasks_done,
      (select count(*) from issues where status = 'done' and resolved_at >= ${MONTH_START})::int as issues_done,
      (select count(*) from profiles where is_active)::int as staff`;
  const out: Partial<Record<OkrMetric, number>> = {
    leads_month: r.leads,
    enrolled_month: r.enrolled,
    conversion_month: r.leads ? Math.round((r.enrolled / r.leads) * 1000) / 10 : 0,
    students_total: r.students,
    strategy_done_pct: r.st_total ? Math.round((r.st_done / r.st_total) * 100) : 0,
    tasks_done_month: r.tasks_done,
    issues_resolved_month: r.issues_done,
    staff_active: r.staff,
  };
  if (finance && r.revenue !== null) out.revenue_month = Math.round((r.revenue / 1e6) * 10) / 10;
  return out;
}

/** A space's objectives with their key results, live values filled in. */
export async function loadOkr(spaceId: string, finance: boolean): Promise<Objective[]> {
  const [objs, krs, live, links, checkins] = await Promise.all([
    sql<Omit<Objective, 'krs'>[]>`
      select id, space_id, title, owner_id, quarter, status, final_score, retro from strategy_objectives
      where space_id = ${spaceId} order by status = 'closed', sort_order, created_at`,
    sql<(Omit<KeyResult, 'current' | 'task_ids' | 'checkins'> & { current_value: number })[]>`
      select k.id, k.objective_id, k.title, k.metric, k.start_value as start_value,
             k.target_value as target_value, k.current_value as current_value, k.unit,
             k.owner_id, k.jev_verdict, k.jev_at
      from strategy_key_results k
      join strategy_objectives o on o.id = k.objective_id
      where o.space_id = ${spaceId}
      order by k.sort_order, k.updated_at`,
    liveMetrics(spaceId, finance),
    sql<{ kr_id: string; task_id: string; status: string }[]>`
      select l.kr_id, l.task_id, t.status from strategy_kr_tasks l
      join strategy_tasks t on t.id = l.task_id where t.space_id = ${spaceId}`.catch(() => []),
    // The last 13 weeks per KR, oldest first.
    sql<Checkin[]>`
      select * from (
        select c.id, c.kr_id, c.week::text as week, c.value, c.confidence, c.note, c.author_id, c.created_at,
          row_number() over (partition by c.kr_id order by c.week desc) as rn
        from strategy_checkins c
        join strategy_key_results k on k.id = c.kr_id
        join strategy_objectives o on o.id = k.objective_id
        where o.space_id = ${spaceId}
      ) x where rn <= 13 order by week`.catch(() => []),
  ]);
  return objs.map((o) => ({
    ...o,
    krs: krs
      .filter((k) => k.objective_id === o.id)
      .map(({ current_value, ...k }) => ({
        ...k,
        task_ids: links.filter((l) => l.kr_id === k.id).map((l) => l.task_id),
        checkins: checkins.filter((c) => c.kr_id === k.id).map((c): Checkin => ({ id: c.id, kr_id: c.kr_id, week: c.week, value: c.value, confidence: c.confidence, note: c.note, author_id: c.author_id, created_at: c.created_at })),
        current:
          k.metric === 'linked_tasks'
            ? linkedPct(links.filter((l) => l.kr_id === k.id))
            : k.metric === 'manual'
            ? current_value
            : FINANCE_METRICS.includes(k.metric) && !finance
              ? null
              : (live[k.metric] ?? 0),
      })),
  }));
}

/** % of linked strategy tasks that are done (0 when nothing is linked). */
function linkedPct(rows: { status: string }[]): number {
  return rows.length ? Math.round((rows.filter((r) => r.status === 'done').length / rows.length) * 100) : 0;
}
