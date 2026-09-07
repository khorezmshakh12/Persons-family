'use server';

import { getFormatter } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';

/**
 * "How am I doing on my own tasks" — the per-employee counterpart to
 * getIssueStatsAction (actions/issue-stats.ts), which this mirrors for its
 * shape, its auth try/catch, its DB-read try/catch and its getFormatter()
 * month labels. The component that consumes this never re-derives a date or
 * a percentage: month bucketing, labels and rates are all computed here.
 *
 * Deliberately **not** role-gated: every signed-in employee gets this panel,
 * scoped to their own tasks. That scoping is the security boundary, so it
 * lives in the queries themselves (`assigned_to = user.id`) rather than in
 * the page — a Server Action is its own POST endpoint and a page guard does
 * not gate it. `assigned_to` and not `assigned_by`: this scores the work a
 * person was asked to do, which is what the weekly bot and the monthly
 * archive's efficiency also score.
 *
 * Month bucketing happens in SQL: the whole staff is in Asia/Tashkent while
 * the server clock is UTC, so both the month a `deadline` belongs to and the
 * 6-month lower bound are derived in that zone. A task belongs to the month
 * it was **due** in (same rule as efficiencyForMonth in lib/task-efficiency.ts
 * — a task due in March but never finished is March's "not done", even though
 * it has no completed_at at all). `completed_at - created_at` is an interval
 * between two timestamptz values, so it needs no zone of its own.
 *
 * "On time" = `completed_at <= deadline`, an instant comparison, never a
 * calendar-day one — matching MonthlyArchive's badge and the weekly report.
 */
export type TaskStatsMonth = {
  monthKey: string;
  label: string;
  /** Tasks whose deadline falls in this month, done or not. */
  due: number;
  doneOnTime: number;
  doneLate: number;
  /** Due this month and not finished (or finished with no completed_at). */
  notDone: number;
  /** 0-100, rounded. A month with nothing due is 0, not 100 — an empty
   * green bar would misread as "everything on time". */
  onTimeRate: number;
};

export type TaskStats = {
  overall: {
    total: number;
    done: number;
    onTime: number;
    late: number;
    /** Past its deadline and still not done. */
    notDone: number;
    /** 0-100, rounded. 100 when there are no tasks at all. */
    completionRate: number;
    /** avg(completed_at - created_at) over completed tasks, in days, 1
     * decimal. null when nothing is done. */
    avgCompletionDays: number | null;
  };
  /** Last 6 Asia/Tashkent months, oldest -> newest. */
  byMonth: TaskStatsMonth[];
};

/** total === 0 scores 100 rather than NaN — same convention as the
 * efficiency % in lib/task-efficiency.ts. */
const asRate = (part: number, whole: number) =>
  whole === 0 ? 100 : Math.round((part / whole) * 100);

type OverallRow = {
  total: number;
  done: number;
  on_time: number;
  late: number;
  not_done: number;
  avg_seconds: number | null;
};
type MonthRow = {
  month_key: string;
  due: number;
  done_on_time: number;
  done_late: number;
  not_done: number;
};

export async function getTaskStatsAction(): Promise<{ data?: TaskStats; error?: string }> {
  let userId: string;
  try {
    const { user } = await getAuthState();
    if (!user) return { error: 'sessionExpired' };
    userId = user.id;
  } catch (error) {
    console.error('getTaskStatsAction auth failed', error instanceof Error ? error.message : error);
    return { error: 'forbidden' };
  }

  let overallRows: OverallRow[];
  let monthRows: MonthRow[];
  try {
    [overallRows, monthRows] = await Promise.all([
      sql<OverallRow[]>`
        select
          count(*)::int as total,
          count(*) filter (where status = 'done')::int as done,
          count(*) filter (
            where status = 'done' and completed_at is not null and completed_at <= deadline
          )::int as on_time,
          count(*) filter (
            where status = 'done' and completed_at is not null and completed_at > deadline
          )::int as late,
          count(*) filter (where status <> 'done' and deadline < now())::int as not_done,
          avg(extract(epoch from (completed_at - created_at)))
            filter (where status = 'done' and completed_at is not null) as avg_seconds
        from tasks
        where assigned_to = ${userId}
      `,
      sql<MonthRow[]>`
        with months as (
          select to_char(
                   date_trunc('month', now() at time zone 'Asia/Tashkent') - make_interval(months => g),
                   'YYYY-MM'
                 ) as month_key
          from generate_series(0, 5) as g
        ),
        due_in_window as (
          select
            to_char(t.deadline at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key,
            t.status,
            t.completed_at,
            t.deadline
          from tasks t
          where t.assigned_to = ${userId}
            and t.deadline >= (
              date_trunc('month', now() at time zone 'Asia/Tashkent') - interval '5 months'
            ) at time zone 'Asia/Tashkent'
        )
        select
          m.month_key,
          count(d.month_key)::int as due,
          count(*) filter (
            where d.status = 'done' and d.completed_at is not null and d.completed_at <= d.deadline
          )::int as done_on_time,
          count(*) filter (
            where d.status = 'done' and d.completed_at is not null and d.completed_at > d.deadline
          )::int as done_late,
          -- The "d.month_key is not null" guard is load-bearing: for a month
          -- with nothing due the left join produces one all-NULL row, and
          -- "d.completed_at is null" alone would be TRUE for it and count a
          -- phantom "not done".
          count(*) filter (
            where d.month_key is not null and (d.status <> 'done' or d.completed_at is null)
          )::int as not_done
        from months m
        left join due_in_window d on d.month_key = m.month_key
        group by m.month_key
        order by m.month_key
      `,
    ]);
  } catch (error) {
    console.error('getTaskStatsAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }

  const format = await getFormatter();

  const overall = overallRows[0] ?? {
    total: 0,
    done: 0,
    on_time: 0,
    late: 0,
    not_done: 0,
    avg_seconds: null,
  };

  return {
    data: {
      overall: {
        total: overall.total,
        done: overall.done,
        onTime: overall.on_time,
        late: overall.late,
        notDone: overall.not_done,
        completionRate: asRate(overall.done, overall.total),
        avgCompletionDays:
          overall.avg_seconds == null
            ? null
            : Math.round((overall.avg_seconds / 86400) * 10) / 10,
      },
      byMonth: monthRows.map((row) => ({
        monthKey: row.month_key,
        // The key is a Tashkent month rendered as a UTC instant purely so
        // the formatter names the right month — formatting 'YYYY-MM-01' in
        // any local zone would slide it back into the previous month.
        label: format.dateTime(new Date(`${row.month_key}-01T00:00:00Z`), {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        due: row.due,
        doneOnTime: row.done_on_time,
        doneLate: row.done_late,
        notDone: row.not_done,
        onTimeRate: row.due === 0 ? 0 : Math.round((row.done_on_time / row.due) * 100),
      })),
    },
  };
}
