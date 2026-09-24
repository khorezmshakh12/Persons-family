import 'server-only';
import { cache } from 'react';
import { sql } from '@/lib/db/client';
import { getStarBalances } from '@/lib/stars';
import { getPayrollSummary, getStaffPayroll } from '@/lib/payroll';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { LESSON_PLAN_ROLES, type StaffRole } from '@/lib/nav';
import { addDaysToKey, tashkentDayKey, tashkentDayOfWeek, tashkentMidnight, startOfTashkentMonthKey, startOfPreviousTashkentMonthKey } from '@/lib/time';
import { changePercent, lastPoint, openBacklogSeries, periodBucketEnds } from '@/lib/dashboard-stats';

/**
 * Data for the Persons Aurora dashboard (hero, leaderboard, KPI row, lesson
 * plan week, task status donut, activity feed).
 *
 * Scoping mirrors the rest of the app: the CEO sees company-wide numbers,
 * everyone else sees their own tasks / issues / stars. Every loader is
 * read-only and swallows its own failure into `null`, so one broken query
 * renders an empty state instead of taking the dashboard down.
 */

export type Viewer = { userId: string; role: StaffRole };

const isCompanyWide = (v: Viewer) => v.role === 'ceo';

/** Monday 00:00 Tashkent of the current week, as a day key. */
function mondayKey(at: Date = new Date()): string {
  const today = tashkentDayKey(at);
  return addDaysToKey(today, -((tashkentDayOfWeek(at) + 6) % 7));
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[aurora-dashboard] ${label} failed`, error);
    return null;
  }
}

/* ------------------------------------------------------------------ tasks */

type TaskRow = { status: string; created_at: string; completed_at: string | null; deadline: string | null };

async function loadTaskRows(v: Viewer): Promise<TaskRow[]> {
  return isCompanyWide(v)
    ? sql<TaskRow[]>`select status, created_at, completed_at, deadline from tasks`
    : sql<TaskRow[]>`select status, created_at, completed_at, deadline from tasks where assigned_to = ${v.userId}`;
}

export type TaskStatusBreakdown = { done: number; inProgress: number; todo: number; overdue: number; total: number };

function breakdown(rows: TaskRow[], scope: 'all' | 'month', now = Date.now()): TaskStatusBreakdown {
  const monthStart = tashkentMidnight(startOfTashkentMonthKey()).getTime();
  const out = { done: 0, inProgress: 0, todo: 0, overdue: 0, total: 0 };
  for (const r of rows) {
    if (r.status === 'done') {
      // 'all' = every task ever completed (the status donut); 'month' = only
      // this month's completions (the hero's monthly-plan ring).
      const at = new Date(r.completed_at ?? r.created_at).getTime();
      if (scope === 'all' || at >= monthStart) out.done += 1;
      continue;
    }
    const due = r.deadline ? new Date(r.deadline).getTime() : NaN;
    if (Number.isFinite(due) && due < now) out.overdue += 1;
    else if (r.status === 'pending') out.todo += 1;
    else out.inProgress += 1;
  }
  out.total = out.done + out.inProgress + out.todo + out.overdue;
  return out;
}

/* ----------------------------------------------------------------- hero */

export type HeroData = {
  activeTasks: number;
  dueToday: number;
  teamStarsThisWeek: number;
  /** All-time: every completed task + everything still open. */
  status: TaskStatusBreakdown;
  /** This month's completions + everything still open (hero ring). */
  monthStatus: TaskStatusBreakdown;
};

/* ------------------------------------------------------------------ KPIs */

export type Kpi = {
  value: number;
  /** Signed change for the delta chip; null = no chip. */
  delta: number | null;
  deltaUnit: 'percent' | 'absolute';
  /** Whether a positive delta is good news (green) or bad (red). */
  higherIsBetter: boolean;
  /** 7 values oldest → newest for the mini bars. */
  bars: number[];
  /** Extra count for the caption (e.g. resolved issues). */
  extra?: number;
};

export type KpiSet = { activeTasks: Kpi; openIssues: Kpi; stars: Kpi; doneTasks: Kpi };

/** Per-day count of instants over the last 7 Tashkent days (oldest → newest). */
function dailyCounts(instants: (string | null)[], days = 7): number[] {
  const ends = periodBucketEnds('daily');
  const starts = ends.map((e) => e - 24 * 60 * 60 * 1000);
  const times = instants.map((i) => (i ? new Date(i).getTime() : NaN)).filter(Number.isFinite);
  return ends.slice(-days).map((end, i) => {
    const start = starts[starts.length - days + i];
    return times.reduce((n, t) => (t >= start && t < end ? n + 1 : n), 0);
  });
}

type IssueRow = { status: string; created_at: string; resolved_at: string | null };
type StarRow = { delta: number; created_at: string };

async function loadDashboardCoreImpl(v: Viewer): Promise<{ hero: HeroData | null; kpis: KpiSet | null }> {
  const result = await safe('core', async () => {
    const weekStart = tashkentMidnight(mondayKey()).toISOString();
    const monthStart = tashkentMidnight(startOfTashkentMonthKey()).toISOString();
    const todayKey = tashkentDayKey();

    const [tasks, issues, stars, teamWeek] = await Promise.all([
      loadTaskRows(v),
      isCompanyWide(v)
        ? sql<IssueRow[]>`select status, created_at, resolved_at from issues`
        : sql<IssueRow[]>`
            select status, created_at, resolved_at from issues
            where created_by = ${v.userId} or assigned_to = ${v.userId}
          `,
      isCompanyWide(v)
        ? sql<StarRow[]>`
            select st.delta, st.created_at from star_transactions st
            join profiles p on p.id = st.user_id
            where p.role <> 'ceo' and p.is_active = true
          `
        : sql<StarRow[]>`select delta, created_at from star_transactions where user_id = ${v.userId}`,
      sql<{ total: number }[]>`
        select coalesce(sum(st.delta), 0)::int as total
        from star_transactions st
        join profiles p on p.id = st.user_id
        where st.delta > 0 and st.created_at >= ${weekStart} and p.role <> 'ceo'
      `,
    ]);

    const status = breakdown(tasks, 'all');
    const monthStatus = breakdown(tasks, 'month');
    const open = tasks.filter((t) => t.status !== 'done');
    const dueToday = open.filter((t) => t.deadline && tashkentDayKey(new Date(t.deadline)) === todayKey).length;

    // Active tasks: point-in-time open backlog, daily bars, weekly change.
    const taskBacklog = tasks.map((t) => ({
      createdAt: t.created_at,
      openUntil: t.status === 'done' ? (t.completed_at ?? t.created_at) : null,
    }));
    const activeDaily = openBacklogSeries(taskBacklog, 'daily');
    const activeWeekly = openBacklogSeries(taskBacklog, 'weekly');

    // Open issues: same backlog maths, closed = resolved.
    const issueBacklog = issues.map((i) => ({
      createdAt: i.created_at,
      openUntil: i.status === 'done' ? (i.resolved_at ?? i.created_at) : null,
    }));
    const issuesDaily = openBacklogSeries(issueBacklog, 'daily');
    const issuesWeekly = openBacklogSeries(issueBacklog, 'weekly');
    const resolvedThisMonth = issues.filter(
      // Wire timestamps are raw postgres strings — compare as instants.
      (i) => i.status === 'done' && i.resolved_at && new Date(i.resolved_at) >= new Date(monthStart),
    ).length;

    // Stars: running balance at the end of each of the last 7 days.
    const starEnds = periodBucketEnds('daily');
    const starTimes = stars.map((s) => ({ t: new Date(s.created_at).getTime(), d: Number(s.delta) || 0 }));
    const starDaily = starEnds.map((end) => starTimes.reduce((sum, s) => (s.t < end ? sum + s.d : sum), 0));
    const starsThisMonth = starTimes.reduce(
      (sum, s) => (s.t >= new Date(monthStart).getTime() ? sum + s.d : sum),
      0,
    );

    // Done tasks: completions per day this week vs the 7 days before.
    const completions = tasks.filter((t) => t.status === 'done').map((t) => t.completed_at);
    const doneDaily = dailyCounts(completions, 7);
    const doneLast7 = doneDaily.reduce((a, b) => a + b, 0);
    const doneEnds = periodBucketEnds('daily');
    const prevStart = doneEnds[0] - 8 * 24 * 60 * 60 * 1000;
    const prevEnd = doneEnds[0] - 24 * 60 * 60 * 1000;
    const donePrev7 = completions.filter((c) => {
      const t = c ? new Date(c).getTime() : NaN;
      return t >= prevStart && t < prevEnd;
    }).length;

    const hero: HeroData = {
      activeTasks: open.length,
      dueToday,
      teamStarsThisWeek: teamWeek[0]?.total ?? 0,
      status,
      monthStatus,
    };

    const kpis: KpiSet = {
      activeTasks: {
        value: lastPoint(activeDaily),
        delta: changePercent(activeWeekly),
        deltaUnit: 'percent',
        higherIsBetter: false,
        bars: activeDaily,
      },
      openIssues: {
        value: lastPoint(issuesDaily),
        delta: changePercent(issuesWeekly),
        deltaUnit: 'percent',
        higherIsBetter: false,
        bars: issuesDaily,
        extra: resolvedThisMonth,
      },
      stars: {
        value: lastPoint(starDaily),
        delta: starsThisMonth,
        deltaUnit: 'absolute',
        higherIsBetter: true,
        bars: starDaily,
      },
      doneTasks: {
        value: completions.length,
        delta: changePercent([donePrev7, doneLast7]),
        deltaUnit: 'percent',
        higherIsBetter: true,
        bars: doneDaily,
        extra: doneLast7,
      },
    };

    return { hero, kpis };
  });

  return result ?? { hero: null, kpis: null };
}

/** Hero, KPI row and the status donut all read this — cached per request so
 * the three Suspense boundaries share one set of queries. */
export const loadDashboardCore = cache((userId: string, role: StaffRole) => loadDashboardCoreImpl({ userId, role }));

/* ---------------------------------------------------------- leaderboard */

export type LeaderboardPerson = {
  id: string;
  name: string;
  shortName: string;
  avatarUrl: string | null;
  /** All-time balance (sum of every delta). */
  total: number;
  /** Balance as of this Monday — for the all-time rank trend. */
  totalAtWeekStart: number;
  week: number;
  prevWeek: number;
  month: number;
  prevMonth: number;
};

export async function loadLeaderboard(): Promise<LeaderboardPerson[] | null> {
  return safe('leaderboard', async () => {
    const weekStart = tashkentMidnight(mondayKey()).toISOString();
    const prevWeekStart = tashkentMidnight(addDaysToKey(mondayKey(), -7)).toISOString();
    const monthStart = tashkentMidnight(startOfTashkentMonthKey()).toISOString();
    const prevMonthStart = tashkentMidnight(startOfPreviousTashkentMonthKey()).toISOString();

    // Same population as the classic StarLeaderboard: active, non-CEO (the
    // CEO awards stars rather than earning them).
    const people = await sql<
      {
        id: string;
        first_name: string;
        last_name: string;
        avatar_url: string | null;
        week: number;
        prev_week: number;
        month: number;
        prev_month: number;
      }[]
    >`
      select p.id, p.first_name, p.last_name, p.avatar_url,
        coalesce(sum(st.delta) filter (where st.created_at >= ${weekStart}), 0)::int as week,
        coalesce(sum(st.delta) filter (where st.created_at >= ${prevWeekStart} and st.created_at < ${weekStart}), 0)::int as prev_week,
        coalesce(sum(st.delta) filter (where st.created_at >= ${monthStart}), 0)::int as month,
        coalesce(sum(st.delta) filter (where st.created_at >= ${prevMonthStart} and st.created_at < ${monthStart}), 0)::int as prev_month
      from profiles p
      left join star_transactions st on st.user_id = p.id
      where p.is_active = true and p.role <> 'ceo'
      group by p.id
      order by p.first_name asc
    `;
    if (people.length === 0) return [];

    // The all-time balance comes from the one shared helper (lib/stars.ts),
    // never a second copy of the sum.
    const balances = await getStarBalances(people.map((p) => p.id));

    // Sign avatar URLs only for people who can actually appear with a photo
    // (top of any board) — signing is a network call per path.
    const byTotal = [...people].sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0));
    const byMonth = [...people].sort((a, b) => b.month - a.month);
    const byWeek = [...people].sort((a, b) => b.week - a.week);
    const visible = new Set<string>();
    for (const list of [byTotal, byMonth, byWeek]) list.slice(0, 6).forEach((p) => visible.add(p.id));
    const paths = [
      ...new Set(people.filter((p) => visible.has(p.id) && p.avatar_url).map((p) => p.avatar_url as string)),
    ];
    const signed = new Map(await Promise.all(paths.map(async (p) => [p, await resolveAvatarUrl(p)] as const)));

    return people.map((p) => {
      const total = balances[p.id] ?? 0;
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        shortName: `${p.first_name} ${p.last_name ? `${p.last_name[0]}.` : ''}`.trim(),
        avatarUrl: p.avatar_url && visible.has(p.id) ? (signed.get(p.avatar_url) ?? null) : null,
        total,
        totalAtWeekStart: total - p.week,
        week: p.week,
        prevWeek: p.prev_week,
        month: p.month,
        prevMonth: p.prev_month,
      };
    });
  });
}

/* ------------------------------------------------- lesson-plan week chart */

export type WeekBar = {
  dayKey: string;
  /** 0 = Monday … 5 = Saturday */
  index: number;
  complete: number;
  total: number;
  isToday: boolean;
  isFuture: boolean;
};

// Same completeness rule as the lesson-plan compliance cron
// (api/cron/lesson-plan-check): these five fields filled = complete; a lesson
// moved to another date counts as done.
type LessonRow = {
  group_id: string;
  topic: string | null;
  aim: string | null;
  language_focus: string | null;
  anticipated_problems: string | null;
  homework: string | null;
  moved_to_lesson_id: string | null;
};
const isComplete = (l: LessonRow) =>
  Boolean(
    l.topic?.trim() && l.aim?.trim() && l.language_focus?.trim() && l.anticipated_problems?.trim() && l.homework?.trim(),
  ) || l.moved_to_lesson_id !== null;

export function canSeeLessonPlans(role: StaffRole): boolean {
  return LESSON_PLAN_ROLES.includes(role);
}

export async function loadLessonPlanWeek(v: Viewer): Promise<WeekBar[] | null> {
  if (!canSeeLessonPlans(v.role)) return null;
  return safe('lesson-week', async () => {
    const monday = mondayKey();
    const today = tashkentDayKey();
    const days = Array.from({ length: 6 }, (_, i) => addDaysToKey(monday, i)); // Mon–Sat (6-day week)
    const everything = v.role === 'ceo' || v.role === 'head_teacher';

    const groups = await sql<{ id: string; schedule_type: string | null }[]>`
      select id, schedule_type from groups
      where ${everything} or teacher_id = ${v.userId} or assigned_ta_id = ${v.userId}
    `;
    const scheduled = groups.filter((g) => g.schedule_type === 'odd' || g.schedule_type === 'even');
    const lessons =
      scheduled.length > 0
        ? await sql<(LessonRow & { lesson_date: string })[]>`
            select group_id, to_char(lesson_date, 'YYYY-MM-DD') as lesson_date, topic, aim, language_focus,
                   anticipated_problems, homework, moved_to_lesson_id
            from course_lessons
            where group_id in ${sql(scheduled.map((g) => g.id))}
              and lesson_date >= ${days[0]} and lesson_date <= ${days[5]}
          `
        : [];

    return days.map((dayKey, index) => {
      // Mon/Wed/Fri = odd, Tue/Thu/Sat = even — the center's rotation.
      const parity = index % 2 === 0 ? 'odd' : 'even';
      const dayGroups = scheduled.filter((g) => g.schedule_type === parity);
      const complete = dayGroups.filter((g) =>
        lessons.some((l) => l.group_id === g.id && l.lesson_date === dayKey && isComplete(l)),
      ).length;
      return { dayKey, index, complete, total: dayGroups.length, isToday: dayKey === today, isFuture: dayKey > today };
    });
  });
}

export type MonthBar = {
  /** 'YYYY-MM' (Tashkent) */
  monthKey: string;
  complete: number;
  total: number;
  isCurrent: boolean;
};

const HISTORY_MONTHS = 6;

/** The last HISTORY_MONTHS Tashkent month keys, oldest → newest. */
function recentMonthKeys(): string[] {
  const [y, m] = startOfTashkentMonthKey().split('-').map(Number);
  return Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (HISTORY_MONTHS - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * Lesson-plan history: per month, how many lessons that already took place
 * (lesson_date <= today) have a complete plan. Same completeness rule and
 * role scoping as the weekly chart. Future, pre-generated empty rows are
 * left out so they can't drag the ratio down.
 */
export async function loadLessonPlanMonths(v: Viewer): Promise<MonthBar[] | null> {
  if (!canSeeLessonPlans(v.role)) return null;
  return safe('lesson-months', async () => {
    const months = recentMonthKeys();
    const today = tashkentDayKey();
    const everything = v.role === 'ceo' || v.role === 'head_teacher';
    const rows = await sql<(LessonRow & { ym: string })[]>`
      select to_char(cl.lesson_date, 'YYYY-MM') as ym, cl.group_id, cl.topic, cl.aim, cl.language_focus,
             cl.anticipated_problems, cl.homework, cl.moved_to_lesson_id
      from course_lessons cl
      join groups g on g.id = cl.group_id
      where cl.lesson_date >= ${`${months[0]}-01`} and cl.lesson_date <= ${today}
        and (${everything} or g.teacher_id = ${v.userId} or g.assigned_ta_id = ${v.userId})
    `;
    const current = months[months.length - 1];
    return months.map((monthKey) => {
      const inMonth = rows.filter((r) => r.ym === monthKey);
      return {
        monthKey,
        complete: inMonth.filter(isComplete).length,
        total: inMonth.length,
        isCurrent: monthKey === current,
      };
    });
  });
}

/** Task history: per month, tasks completed vs tasks that were due. */
export async function loadTasksDoneMonths(v: Viewer): Promise<MonthBar[] | null> {
  return safe('tasks-months', async () => {
    const months = recentMonthKeys();
    const rows = await loadTaskRows(v);
    const monthOf = (iso: string) => tashkentDayKey(new Date(iso)).slice(0, 7);
    const current = months[months.length - 1];
    return months.map((monthKey) => {
      const complete = rows.filter((r) => r.status === 'done' && r.completed_at && monthOf(r.completed_at) === monthKey).length;
      const due = rows.filter((r) => r.deadline && monthOf(r.deadline) === monthKey).length;
      return { monthKey, complete, total: Math.max(due, complete), isCurrent: monthKey === current };
    });
  });
}

/** Non-lesson roles get "tasks completed per day this week" in the same chart. */
export async function loadTasksDoneWeek(v: Viewer): Promise<WeekBar[] | null> {
  return safe('tasks-week', async () => {
    const monday = mondayKey();
    const today = tashkentDayKey();
    const days = Array.from({ length: 6 }, (_, i) => addDaysToKey(monday, i));
    const rows = await loadTaskRows(v);
    const doneKeys = rows
      .filter((r) => r.status === 'done' && r.completed_at)
      .map((r) => tashkentDayKey(new Date(r.completed_at as string)));
    const dueKeys = rows.filter((r) => r.deadline).map((r) => tashkentDayKey(new Date(r.deadline as string)));
    return days.map((dayKey, index) => {
      const complete = doneKeys.filter((k) => k === dayKey).length;
      const due = dueKeys.filter((k) => k === dayKey).length;
      return {
        dayKey,
        index,
        complete,
        total: Math.max(due, complete),
        isToday: dayKey === today,
        isFuture: dayKey > today,
      };
    });
  });
}

/* ------------------------------------------------------------- activity */

export type ActivityItem = {
  id: string;
  kind: 'stars' | 'starsLost' | 'taskDone' | 'issue' | 'order';
  name: string;
  at: string;
  delta?: number;
  detail?: string | null;
};

export async function loadActivity(v: Viewer, limit = 5): Promise<ActivityItem[] | null> {
  return safe('activity', async () => {
    const all = isCompanyWide(v);
    const [stars, tasks, issues] = await Promise.all([
      sql<{ id: string; delta: number; reason: string | null; source_type: string | null; created_at: string; first_name: string; last_name: string }[]>`
        select st.id, st.delta, st.reason, st.source_type, st.created_at, p.first_name, p.last_name
        from star_transactions st join profiles p on p.id = st.user_id
        where ${all} or st.user_id = ${v.userId}
        order by st.created_at desc limit ${limit}
      `,
      sql<{ id: string; title: string; completed_at: string; first_name: string; last_name: string }[]>`
        select t.id, t.title, t.completed_at, p.first_name, p.last_name
        from tasks t join profiles p on p.id = t.assigned_to
        where t.status = 'done' and t.completed_at is not null and (${all} or t.assigned_to = ${v.userId})
        order by t.completed_at desc limit ${limit}
      `,
      sql<{ id: string; title: string; created_at: string; first_name: string; last_name: string }[]>`
        select i.id, i.title, i.created_at, p.first_name, p.last_name
        from issues i join profiles p on p.id = i.created_by
        where ${all} or i.created_by = ${v.userId} or i.assigned_to = ${v.userId}
        order by i.created_at desc limit ${limit}
      `,
    ]);

    const short = (f: string, l: string) => `${f} ${l ? `${l[0]}.` : ''}`.trim();
    const items: ActivityItem[] = [
      ...stars.map((s) => ({
        id: `s-${s.id}`,
        kind: (s.source_type === 'market' ? 'order' : s.delta >= 0 ? 'stars' : 'starsLost') as ActivityItem['kind'],
        name: short(s.first_name, s.last_name),
        at: s.created_at,
        delta: s.delta,
        detail: s.reason,
      })),
      ...tasks.map((t) => ({
        id: `t-${t.id}`,
        kind: 'taskDone' as const,
        name: short(t.first_name, t.last_name),
        at: t.completed_at,
        detail: t.title,
      })),
      ...issues.map((i) => ({
        id: `i-${i.id}`,
        kind: 'issue' as const,
        name: short(i.first_name, i.last_name),
        at: i.created_at,
        detail: i.title,
      })),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
  });
}

/* -------------------------------------------------------------- finance */

/**
 * The dashboard's Finance card (it took the place of the old task-status
 * card). Same source as /finance and the profile's SalaryCard —
 * lib/payroll.ts — for the current Asia/Tashkent month, so the three can
 * never disagree:
 *   - CEO: the whole team's payroll (planned gross, paid, still owed).
 *   - everyone else: their own gross salary, paid so far, remaining.
 */
export type FinanceSnapshot = {
  scope: 'company' | 'self';
  /** 'YYYY-MM-01' (Tashkent). */
  period: string;
  gross: number;
  paid: number;
  remaining: number;
  /** CEO only: how many active staff are on this month's payroll plan. */
  staffCount?: number;
};

export async function loadFinanceSnapshot(v: Viewer): Promise<FinanceSnapshot | null> {
  return safe('finance', async () => {
    const period = startOfTashkentMonthKey();
    if (isCompanyWide(v)) {
      const summary = await getPayrollSummary(period);
      return {
        scope: 'company' as const,
        period,
        ...summary.totals,
        staffCount: summary.rows.filter((r) => r.gross > 0).length,
      };
    }
    const own = await getStaffPayroll(v.userId, period);
    return { scope: 'self' as const, period, gross: own.gross, paid: own.paid, remaining: own.remaining };
  });
}

/* ------------------------------------------------------------ task feed */

/**
 * CEO: what employees recently handed in — submitted for review, awaiting
 * the proof upload, or approved — newest first.
 * Everyone else: the tasks assigned to them that are still on their plate
 * (open or under review), soonest deadline first.
 *
 * Same visibility the rest of the dashboard uses: the CEO sees every
 * employee's tasks, anyone else only `assigned_to = self`.
 */
export type TaskFeedItem = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  /** CEO feed: when the work was handed in (completed_at ?? submitted_at). */
  at: string | null;
  /** CEO feed: handed in at/before the deadline (no deadline = on time). */
  onTime: boolean | null;
  /** CEO feed: the assignee. */
  name: string | null;
};

export async function loadTaskFeed(v: Viewer, limit = 6): Promise<TaskFeedItem[] | null> {
  return safe('task-feed', async () => {
    if (isCompanyWide(v)) {
      const rows = await sql<
        {
          id: string;
          title: string;
          status: string;
          deadline: string | null;
          at: string;
          first_name: string;
          last_name: string;
        }[]
      >`
        select t.id, t.title, t.status, t.deadline,
               coalesce(t.completed_at, t.submitted_at) as at,
               p.first_name, p.last_name
        from tasks t
        join profiles p on p.id = t.assigned_to
        where t.status in ('submitted', 'awaiting_upload', 'done')
          and coalesce(t.completed_at, t.submitted_at) is not null
          and p.role <> 'ceo'
        order by coalesce(t.completed_at, t.submitted_at) desc
        limit ${limit}
      `;
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        deadline: r.deadline,
        at: r.at,
        // Instant comparison, never a calendar-day one — same rule as
        // getTaskStatsAction / the weekly report.
        onTime: r.deadline ? new Date(r.at).getTime() <= new Date(r.deadline).getTime() : true,
        name: `${r.first_name} ${r.last_name ? `${r.last_name[0]}.` : ''}`.trim(),
      }));
    }

    // Open work only, so the list is small — sorted in JS (soonest deadline
    // first, no-deadline last) rather than a SQL "asc limit".
    const rows = await sql<{ id: string; title: string; status: string; deadline: string | null; created_at: string }[]>`
      select id, title, status, deadline, created_at
      from tasks
      where assigned_to = ${v.userId} and status <> 'done'
    `;
    const key = (d: string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
    return rows
      .sort((a, b) => key(a.deadline) - key(b.deadline) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
      .map((r) => ({ id: r.id, title: r.title, status: r.status, deadline: r.deadline, at: null, onTime: null, name: null }));
  });
}

/* -------------------------------------------------- employee statistics */

/**
 * CEO-only panel: per active employee, the tasks they were assigned, how
 * many are done, the on-time share of those, how many are overdue right now
 * and their star balance. "On time" = completed_at <= deadline (a task with
 * no deadline can't be late); "overdue" = still open (pending/in_progress)
 * past its deadline — the same rules as getTaskStatsAction and `is_overdue`.
 */
export type EmployeeTaskStat = {
  id: string;
  name: string;
  assigned: number;
  done: number;
  /** 0-100, null when nothing is done yet. */
  onTimeRate: number | null;
  overdue: number;
  stars: number;
};

export async function loadEmployeeTaskStats(): Promise<EmployeeTaskStat[] | null> {
  return safe('employee-stats', async () => {
    const rows = await sql<
      {
        id: string;
        first_name: string;
        last_name: string;
        assigned: number;
        done: number;
        on_time: number;
        overdue: number;
      }[]
    >`
      select p.id, p.first_name, p.last_name,
        count(t.id)::int as assigned,
        count(t.id) filter (where t.status = 'done')::int as done,
        count(t.id) filter (
          where t.status = 'done' and (t.deadline is null or (t.completed_at is not null and t.completed_at <= t.deadline))
        )::int as on_time,
        count(t.id) filter (
          where t.status in ('pending', 'in_progress') and t.deadline < now()
        )::int as overdue
      from profiles p
      left join tasks t on t.assigned_to = p.id
      where p.is_active = true and p.role <> 'ceo'
      group by p.id
      order by p.first_name asc
    `;
    const balances = await getStarBalances(rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      assigned: r.assigned,
      done: r.done,
      onTimeRate: r.done > 0 ? Math.round((r.on_time / r.done) * 100) : null,
      overdue: r.overdue,
      stars: balances[r.id] ?? 0,
    }));
  });
}
