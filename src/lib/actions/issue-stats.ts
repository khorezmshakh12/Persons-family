'use server';

import { getFormatter } from 'next-intl/server';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';

/**
 * The CEO's dashboard for "how well do we resolve what staff raise"
 * (redesigned 2026-10-06). Everything is computed here, in SQL, in
 * Asia/Tashkent — the component only draws it.
 *
 * Fixes vs. the old panel: a month's "resolved" is now what was actually
 * resolved IN that month (by resolved_at), not "issues created that month
 * that are done today" — the old way showed ~100% for every past month.
 *
 * CEO-only (issues.manage) and checked here: a Server Action is its own POST
 * endpoint, a page guard doesn't cover it.
 */
export type IssueStatsMonth = { monthKey: string; label: string; created: number; resolved: number };
export type IssueStatsRole = { role: string; raised: number; resolved: number; resolutionRate: number };
export type IssueStatsAssignee = { id: string | null; name: string; open: number; resolved: number; avgDays: number | null };
export type IssueStatsCategory = { category: string; total: number; open: number };

export type IssueStats = {
  overall: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    /** 0-100; 100 when there are no issues. */
    resolutionRate: number;
    /** Average days from report to resolution (resolved issues), 1 decimal. */
    avgResolutionDays: number | null;
    /** Median, more honest when a few issues dragged on for weeks. */
    medianResolutionDays: number | null;
    createdThisMonth: number;
    resolvedThisMonth: number;
    /** Not done and older than 7 days. */
    stale: number;
    /** Not done and nobody assigned. */
    unassigned: number;
    /** v8: deadlines passed — open past their deadline now, or resolved late. */
    slaBreached: number;
    /** Share of resolved issues (with a deadline) resolved in time, 0-100. */
    slaOnTimePct: number | null;
    /** Average reporter rating (1-5), 1 decimal. */
    avgRating: number | null;
    ratedCount: number;
    /** Resolved issues the reporter sent back at least once, %. */
    reopenPct: number | null;
    awaitingConfirm: number;
  };
  byKind: { kind: string; total: number; open: number }[];
  /** Not-done issues by age. */
  aging: { lt1: number; d1to3: number; d3to7: number; gt7: number };
  /** Last 6 Tashkent months, oldest → newest. */
  byMonth: IssueStatsMonth[];
  byAssignee: IssueStatsAssignee[];
  byCategory: IssueStatsCategory[];
  byReporterRole: IssueStatsRole[];
};

const asRate = (part: number, whole: number) => (whole === 0 ? 100 : Math.round((part / whole) * 100));
const days = (seconds: number | null) => (seconds == null ? null : Math.round((seconds / 86400) * 10) / 10);

export async function getIssueStatsAction(): Promise<{ data?: IssueStats; error?: string }> {
  try {
    await requireCap('issues.manage');
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  try {
    const [[o], [aging], months, assignees, categories, roles] = await Promise.all([
      sql<
        {
          total: number;
          open: number;
          in_progress: number;
          resolved: number;
          avg_s: number | null;
          median_s: number | null;
          created_month: number;
          resolved_month: number;
          stale: number;
          unassigned: number;
          sla_breached: number;
          sla_due_resolved: number;
          sla_on_time: number;
          avg_rating: number | null;
          rated: number;
          reopened: number;
          awaiting: number;
        }[]
      >`
        with m as (select (date_trunc('month', now() at time zone 'Asia/Tashkent')) at time zone 'Asia/Tashkent' as start)
        select
          count(*)::int as total,
          count(*) filter (where status = 'open')::int as open,
          count(*) filter (where status = 'in_progress')::int as in_progress,
          count(*) filter (where status = 'done')::int as resolved,
          avg(extract(epoch from (resolved_at - created_at))) filter (where status = 'done' and resolved_at is not null) as avg_s,
          percentile_cont(0.5) within group (order by extract(epoch from (resolved_at - created_at)))
            filter (where status = 'done' and resolved_at is not null) as median_s,
          count(*) filter (where created_at >= (select start from m))::int as created_month,
          count(*) filter (where status = 'done' and resolved_at >= (select start from m))::int as resolved_month,
          count(*) filter (where status <> 'done' and created_at < now() - interval '7 days')::int as stale,
          count(*) filter (where status <> 'done' and assigned_to is null)::int as unassigned,
          count(*) filter (where (status <> 'done' and ((accepted_at is null and status = 'open' and respond_by < now()) or resolve_by < now()))
                              or (status = 'done' and resolve_by is not null and resolved_at > resolve_by))::int as sla_breached,
          count(*) filter (where status = 'done' and resolve_by is not null and resolved_at is not null)::int as sla_due_resolved,
          count(*) filter (where status = 'done' and resolve_by is not null and resolved_at <= resolve_by)::int as sla_on_time,
          avg(rating) filter (where rating is not null) as avg_rating,
          count(*) filter (where rating is not null)::int as rated,
          count(*) filter (where status = 'done' and reopen_count > 0)::int as reopened,
          count(*) filter (where status = 'done' and closed_at is null)::int as awaiting
        from issues
      `,
      sql<{ lt1: number; d1to3: number; d3to7: number; gt7: number }[]>`
        select
          count(*) filter (where age < interval '1 day')::int as lt1,
          count(*) filter (where age >= interval '1 day' and age < interval '3 days')::int as d1to3,
          count(*) filter (where age >= interval '3 days' and age < interval '7 days')::int as d3to7,
          count(*) filter (where age >= interval '7 days')::int as gt7
        from (select now() - created_at as age from issues where status <> 'done') x
      `,
      sql<{ month_key: string; created: number; resolved: number }[]>`
        with months as (
          select to_char(date_trunc('month', now() at time zone 'Asia/Tashkent') - make_interval(months => g), 'YYYY-MM') as month_key
          from generate_series(0, 5) as g
        )
        select
          m.month_key,
          (select count(*)::int from issues i
            where to_char(i.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') = m.month_key) as created,
          (select count(*)::int from issues i
            where i.status = 'done' and i.resolved_at is not null
              and to_char(i.resolved_at at time zone 'Asia/Tashkent', 'YYYY-MM') = m.month_key) as resolved
        from months m
        order by m.month_key
      `,
      sql<{ id: string | null; first_name: string | null; last_name: string | null; open: number; resolved: number; avg_s: number | null }[]>`
        select
          i.assigned_to as id, p.first_name, p.last_name,
          count(*) filter (where i.status <> 'done')::int as open,
          count(*) filter (where i.status = 'done')::int as resolved,
          avg(extract(epoch from (i.resolved_at - i.created_at))) filter (where i.status = 'done' and i.resolved_at is not null) as avg_s
        from issues i
        left join profiles p on p.id = i.assigned_to
        group by i.assigned_to, p.first_name, p.last_name
        order by count(*) filter (where i.status <> 'done') desc, count(*) desc
        limit 12
      `,
      sql<{ category: string | null; total: number; open: number }[]>`
        select a.category, count(*)::int as total, count(*) filter (where i.status <> 'done')::int as open
        from issues i
        left join issue_ai a on a.issue_id = i.id and coalesce(a.category_confidence, 0) >= 0.5
        group by a.category
        order by count(*) desc
      `,
      sql<{ role: string; raised: number; resolved: number }[]>`
        select p.role::text as role, count(*)::int as raised, count(*) filter (where i.status = 'done')::int as resolved
        from issues i join profiles p on p.id = i.created_by
        where not i.anonymous
        group by p.role
        order by count(*) desc
      `,
    ]);
    const kinds = await sql<{ kind: string; total: number; open: number }[]>`
      select kind, count(*)::int as total, count(*) filter (where status <> 'done')::int as open
      from issues group by kind order by 2 desc`;

    const format = await getFormatter();
    return {
      data: {
        overall: {
          total: o.total,
          open: o.open,
          inProgress: o.in_progress,
          resolved: o.resolved,
          resolutionRate: asRate(o.resolved, o.total),
          avgResolutionDays: days(o.avg_s),
          medianResolutionDays: days(o.median_s),
          createdThisMonth: o.created_month,
          resolvedThisMonth: o.resolved_month,
          stale: o.stale,
          unassigned: o.unassigned,
          slaBreached: o.sla_breached,
          slaOnTimePct: o.sla_due_resolved ? Math.round((o.sla_on_time / o.sla_due_resolved) * 100) : null,
          avgRating: o.avg_rating == null ? null : Math.round(o.avg_rating * 10) / 10,
          ratedCount: o.rated,
          reopenPct: o.resolved ? Math.round((o.reopened / o.resolved) * 100) : null,
          awaitingConfirm: o.awaiting,
        },
        byKind: [...kinds],
        aging,
        byMonth: months.map((r) => ({
          monthKey: r.month_key,
          label: format.dateTime(new Date(`${r.month_key}-01T00:00:00Z`), { month: 'short', timeZone: 'UTC' }),
          created: r.created,
          resolved: r.resolved,
        })),
        byAssignee: assignees.map((r) => ({
          id: r.id,
          name: r.id ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—' : '',
          open: r.open,
          resolved: r.resolved,
          avgDays: days(r.avg_s),
        })),
        byCategory: categories.map((r) => ({ category: r.category ?? 'none', total: r.total, open: r.open })),
        byReporterRole: roles.map((r) => ({ ...r, resolutionRate: asRate(r.resolved, r.raised) })),
      },
    };
  } catch (error) {
    console.error('getIssueStatsAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }
}
