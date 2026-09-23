'use server';

import { getFormatter } from 'next-intl/server';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';

/**
 * The CEO's read on "how well have we resolved the problems teachers & staff
 * raised". Rendered read-only on the Issues page; the component that
 * consumes this never re-derives a date or a percentage — everything below
 * (month bucketing, labels, rates) is computed here.
 *
 * CEO-only, and checked *here* rather than relying on the /issues page's
 * `notFound()` — a Server Action is its own POST endpoint and a page guard
 * does not gate it (AGENTS.md, "a page guard doesn't gate the POST
 * endpoint"). Mirrors getAdminTeamKpiAction in actions/analytics.ts for the
 * timezone idiom, the auth try/catch, the DB-read try/catch and the
 * getFormatter() month-label approach.
 *
 * Month bucketing happens in SQL: the whole staff is in Asia/Tashkent while
 * the server clock is UTC, so both the month a `created_at` belongs to and
 * the 6-month lower bound are derived in that zone. `resolved_at -
 * created_at` is an interval between two timestamptz values, so it needs no
 * zone of its own.
 */
export type IssueStatsMonth = {
  monthKey: string;
  label: string;
  created: number;
  resolved: number;
  resolutionRate: number;
};

export type IssueStatsRole = {
  role: string;
  raised: number;
  resolved: number;
  resolutionRate: number;
};

export type IssueStats = {
  overall: {
    total: number;
    resolved: number;
    open: number;
    /** 0-100, rounded. 100 when there are no issues at all. */
    resolutionRate: number;
    /** avg(resolved_at - created_at) over resolved issues, in days, 1
     * decimal. null when nothing is resolved (or no resolved issue has a
     * resolved_at). */
    avgResolutionDays: number | null;
  };
  /** Last 6 Asia/Tashkent months, oldest -> newest. */
  byMonth: IssueStatsMonth[];
  /** Every reporter role that has raised >= 1 issue. */
  byReporterRole: IssueStatsRole[];
};

/** total === 0 scores 100 rather than NaN — same convention as the
 * efficiency % in actions/analytics.ts. */
const asRate = (part: number, whole: number) =>
  whole === 0 ? 100 : Math.round((part / whole) * 100);

type OverallRow = {
  total: number;
  resolved: number;
  open: number;
  avg_seconds: number | null;
};
type MonthRow = { month_key: string; created: number; resolved: number };
type RoleRow = { role: string; raised: number; resolved: number };

export async function getIssueStatsAction(): Promise<{ data?: IssueStats; error?: string }> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  let overallRows: OverallRow[];
  let monthRows: MonthRow[];
  let roleRows: RoleRow[];
  try {
    [overallRows, monthRows, roleRows] = await Promise.all([
      sql<OverallRow[]>`
        select
          count(*)::int as total,
          count(*) filter (where status = 'done')::int as resolved,
          count(*) filter (where status <> 'done')::int as open,
          avg(extract(epoch from (resolved_at - created_at)))
            filter (where status = 'done' and resolved_at is not null) as avg_seconds
        from issues
      `,
      sql<MonthRow[]>`
        with months as (
          select to_char(
                   date_trunc('month', now() at time zone 'Asia/Tashkent') - make_interval(months => g),
                   'YYYY-MM'
                 ) as month_key
          from generate_series(0, 5) as g
        ),
        created_in_window as (
          select
            to_char(i.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key,
            i.status
          from issues i
          where i.created_at >= (
            date_trunc('month', now() at time zone 'Asia/Tashkent') - interval '5 months'
          ) at time zone 'Asia/Tashkent'
        )
        select
          m.month_key,
          count(c.month_key)::int as created,
          count(*) filter (where c.status = 'done')::int as resolved
        from months m
        left join created_in_window c on c.month_key = m.month_key
        group by m.month_key
        order by m.month_key
      `,
      sql<RoleRow[]>`
        select
          p.role as role,
          count(*)::int as raised,
          count(*) filter (where i.status = 'done')::int as resolved
        from issues i
        join profiles p on p.id = i.created_by
        group by p.role
        order by p.role
      `,
    ]);
  } catch (error) {
    console.error('getIssueStatsAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }

  const format = await getFormatter();

  const overall = overallRows[0] ?? { total: 0, resolved: 0, open: 0, avg_seconds: null };

  return {
    data: {
      overall: {
        total: overall.total,
        resolved: overall.resolved,
        open: overall.open,
        resolutionRate: asRate(overall.resolved, overall.total),
        avgResolutionDays:
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
        created: row.created,
        resolved: row.resolved,
        // A month with nothing raised is 0%, not 100% — an empty green bar
        // would misread as "all resolved".
        resolutionRate: row.created === 0 ? 0 : Math.round((row.resolved / row.created) * 100),
      })),
      byReporterRole: roleRows.map((row) => ({
        role: row.role,
        raised: row.raised,
        resolved: row.resolved,
        resolutionRate: asRate(row.resolved, row.raised),
      })),
    },
  };
}
