'use server';

import { getFormatter } from 'next-intl/server';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';

/**
 * One Asia/Tashkent calendar month of the Administration team's task KPI.
 * `monthKey` is 'YYYY-MM'; `label` is already localised (the chart is a dumb
 * renderer and never re-derives a date from the key).
 */
export type AdminTeamKpiMonth = {
  monthKey: string;
  label: string;
  due: number;
  onTime: number;
  late: number;
  notDone: number;
  efficiency: number;
};

type AdminTeamKpiRow = {
  month_key: string;
  due: number;
  on_time: number;
  late: number;
  not_done: number;
};

/**
 * Month-by-month task efficiency of the Administration team (active
 * `admin_manager` profiles), for the last 12 Asia/Tashkent months.
 *
 * CEO-only, and checked *here* rather than relying on the /analytics page's
 * `notFound()` — a Server Action is its own POST endpoint and a page guard
 * does not gate it (DEVELOPMENT.md, "Missing authz on an action").
 *
 * Bucketing happens in SQL: the whole staff is in Tashkent while Cloud Run's
 * clock is UTC, so both the month a `deadline` belongs to and the 12-month
 * lower bound must be derived in that zone (mirrors `currentMonthStart()` in
 * actions/tasks.ts). `completed_at <= deadline` is an instant comparison
 * between two timestamptz values, so it needs no zone of its own.
 *
 * efficiency % = max(0, round((onTime - late) / due * 100)) — a late task is
 * a *minus*, not just a zero, and a month with nothing due scores 100 rather
 * than NaN. Same formula as src/lib/task-efficiency.ts, which documents it.
 */
export async function getAdminTeamKpiAction(): Promise<{
  data?: AdminTeamKpiMonth[];
  error?: string;
}> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  let rows: AdminTeamKpiRow[];
  try {
    rows = await sql<AdminTeamKpiRow[]>`
      with months as (
        select to_char(
                 date_trunc('month', now() at time zone 'Asia/Tashkent') - make_interval(months => g),
                 'YYYY-MM'
               ) as month_key
        from generate_series(0, 11) as g
      ),
      admin_tasks as (
        select
          to_char(t.deadline at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key,
          t.status,
          t.deadline,
          t.completed_at
        from tasks t
        join profiles p on p.id = t.assigned_to
        where p.role = 'admin_manager'
          and p.is_active = true
          and t.deadline >= (
            date_trunc('month', now() at time zone 'Asia/Tashkent') - interval '11 months'
          ) at time zone 'Asia/Tashkent'
      )
      select
        m.month_key,
        count(a.month_key)::int as due,
        count(*) filter (
          where a.status = 'done' and a.completed_at is not null and a.completed_at <= a.deadline
        )::int as on_time,
        count(*) filter (
          where a.status = 'done' and a.completed_at is not null and a.completed_at > a.deadline
        )::int as late,
        -- The "a.month_key is not null" test guards the left join: without
        -- it a month with no admin tasks matches this filter through its
        -- all-NULL row and reports one phantom not-done task.
        count(*) filter (
          where a.month_key is not null and (a.status <> 'done' or a.completed_at is null)
        )::int as not_done
      from months m
      left join admin_tasks a on a.month_key = m.month_key
      group by m.month_key
      order by m.month_key
    `;
  } catch (error) {
    console.error(
      'getAdminTeamKpiAction failed',
      error instanceof Error ? error.message : error,
    );
    return { error: 'loadFailed' };
  }

  const format = await getFormatter();

  return {
    data: rows.map((row) => ({
      monthKey: row.month_key,
      // The key is a Tashkent month rendered as a UTC instant purely so the
      // formatter names the right month — formatting it in any local zone
      // would slide 'YYYY-MM-01' back into the previous month.
      label: format.dateTime(new Date(`${row.month_key}-01T00:00:00Z`), {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      due: row.due,
      onTime: row.on_time,
      late: row.late,
      notDone: row.not_done,
      efficiency:
        row.due === 0 ? 100 : Math.max(0, Math.round(((row.on_time - row.late) / row.due) * 100)),
    })),
  };
}
