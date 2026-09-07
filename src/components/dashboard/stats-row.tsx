import { getTranslations } from 'next-intl/server';
import { Users, Layers, CalendarDays, Wallet, Target, ListTodo } from 'lucide-react';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import {
  cumulativeMonthlyBuckets,
  cumulativeMonthlyAmountBuckets,
  momChangePercent,
  lastPoint,
} from '@/lib/dashboard-stats';
import { formatUZS } from '@/lib/format-currency';
import { StatCard } from './stat-card';

const MONTHS = 6;

// Every card on this row is built series-first: `buckets` is the metric's
// value at the end of each of the last MONTHS Asia/Tashkent months, the
// headline is that series' last point (`lastPoint`), and the badge is that
// series' last-vs-previous change (`momChangePercent`). Nothing here may
// measure the headline, the sparkline or the badge a second, separate way —
// that divergence is exactly what made these cards contradict each other.

type Card = {
  label: string;
  value: number | string;
  icon: typeof Users;
  tint: 'green' | 'blue' | 'orange';
  buckets: number[];
  href: string;
  maskable?: boolean;
  percent: number;
};

export async function StatsRow({
  showTotalStaff,
  showLessonPlanCards,
  personalDashboardUserId,
  financeUserId,
}: {
  /** CEO only. */
  showTotalStaff: boolean;
  /** Active Groups/Lesson Plans — CEO and Head Teacher see every group/
   * lesson (RLS scopes it platform-wide for both), teacher/assistant see
   * their own (RLS narrows it) — same flag, the row count just differs by
   * what the viewer's RLS lets the query return. */
  showLessonPlanCards: boolean;
  /** Every other non-teacher role (assistant, admin_manager, mmd,
   * internship, it_developer): a personal Finance/Missions/Tasks view
   * instead of company-wide totals that aren't relevant to their work.
   * Mutually exclusive with the two flags above. */
  personalDashboardUserId?: string;
  /** Teacher/assistant/Head Teacher: adds their own Finance card alongside
   * the Active Groups/Lesson Plans cards below, so every non-CEO role sees
   * their own earnings on the dashboard, not just the personal-dashboard
   * tier above. */
  financeUserId?: string;
}) {
  const t = await getTranslations('dashboard.stats');

  if (personalDashboardUserId) {
    const userId = personalDashboardUserId;
    const [financeRows, missionRows, taskRows] = await Promise.all([
      sql<{ amount: number; created_at: string }[]>`
        select amount::float8 as amount, created_at from finance_entries where staff_id = ${userId}
      `,
      sql<{ created_at: string; status: string }[]>`
        select created_at, status from missions where staff_id = ${userId}
      `,
      sql<{ created_at: string; status: string }[]>`
        select created_at, status from tasks where assigned_to = ${userId}
      `,
    ]);

    const activeMissions = missionRows.filter((m) => m.status !== 'approved' && m.status !== 'rejected');
    const activeTasks = taskRows.filter((task) => task.status !== 'done');

    // 1. Finance: the running net balance at each Tashkent month end, so the
    // last bar is the headline net total rather than this month's net alone.
    const financeBuckets = cumulativeMonthlyAmountBuckets(financeRows, MONTHS);
    // 2/3. Missions & Tasks: the headline counts what is still open, so the
    // series counts the same open rows by the month they were raised in —
    // the backlog as it built up. Its last point is that open count.
    const missionBuckets = cumulativeMonthlyBuckets(
      activeMissions.map((m) => m.created_at),
      MONTHS,
    );
    const taskBuckets = cumulativeMonthlyBuckets(
      activeTasks.map((task) => task.created_at),
      MONTHS,
    );

    const cards: Card[] = [
      {
        label: t('finance'),
        value: formatUZS(lastPoint(financeBuckets)),
        icon: Wallet,
        tint: 'green',
        buckets: financeBuckets,
        percent: momChangePercent(financeBuckets),
        href: `/finance/${userId}`,
        maskable: true,
      },
      {
        label: t('missions'),
        value: lastPoint(missionBuckets),
        icon: Target,
        tint: 'blue',
        buckets: missionBuckets,
        percent: momChangePercent(missionBuckets),
        href: `/missions/${userId}`,
      },
      {
        label: t('tasks'),
        value: lastPoint(taskBuckets),
        icon: ListTodo,
        tint: 'orange',
        buckets: taskBuckets,
        percent: momChangePercent(taskBuckets),
        href: '/tasks',
      },
    ];

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, index) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value}
            icon={c.icon}
            tint={c.tint}
            changePercent={c.percent}
            sparkline={c.buckets}
            href={c.href}
            index={index}
            maskable={c.maskable}
          />
        ))}
      </div>
    );
  }

  // profiles are visible platform-wide, but groups/course_lessons used to
  // be narrowed by RLS to what the viewer's own role can see (their own
  // groups for a teacher, assigned group for a TA, everything for CEO/
  // Head Teacher) — RLS is gone, so that scoping (mirrors the old
  // groups_select/course_lessons_select policies + is_group_owner/
  // is_assigned_ta, pulled from the source DB) is replicated explicitly
  // below, so a non-admin's cards keep reading as "my" totals, not the
  // company's.
  const { user, profile } = await getAuthState();
  const isCeoOrHeadTeacher = profile?.role === 'ceo' || profile?.role === 'head_teacher';
  const uid = user?.id ?? '';

  const [staffRows, groupRows, lessonRows, financeRows] = await Promise.all([
    sql<{ created_at: string; is_active: boolean }[]>`select created_at, is_active from profiles`,
    showLessonPlanCards
      ? sql<{ created_at: string }[]>`
          select created_at from groups
          where ${isCeoOrHeadTeacher} or teacher_id = ${uid} or assigned_ta_id = ${uid}
        `
      : Promise.resolve([]),
    showLessonPlanCards
      ? sql<{ created_at: string }[]>`
          select cl.created_at from course_lessons cl
          join groups g on g.id = cl.group_id
          where ${isCeoOrHeadTeacher} or g.teacher_id = ${uid} or g.assigned_ta_id = ${uid}
        `
      : Promise.resolve([]),
    financeUserId
      ? sql<{ amount: number; created_at: string }[]>`
          select amount::float8 as amount, created_at from finance_entries where staff_id = ${financeUserId}
        `
      : Promise.resolve([]),
  ]);

  const activeStaff = staffRows.filter((r) => r.is_active);
  // Count cards (Total Staff / Active Groups / Lesson Plans): headline is a
  // running total, so the sparkline + trend run on the cumulative row count
  // over time — its last value equals the headline — not on new rows/month.
  const staffBuckets = cumulativeMonthlyBuckets(activeStaff.map((r) => r.created_at), MONTHS);
  const groupBuckets = cumulativeMonthlyBuckets(groupRows.map((r) => r.created_at), MONTHS);
  const lessonBuckets = cumulativeMonthlyBuckets(lessonRows.map((r) => r.created_at), MONTHS);
  // Finance is a running net balance too, so its series has to be cumulative
  // as well — on monthlyAmountBuckets the last bar was only this month's net
  // while the headline showed the all-time total.
  const financeBuckets = cumulativeMonthlyAmountBuckets(financeRows, MONTHS);

  const cards: Card[] = [
    showTotalStaff && {
      label: t('totalStaff'),
      value: lastPoint(staffBuckets),
      icon: Users,
      tint: 'green' as const,
      buckets: staffBuckets,
      percent: momChangePercent(staffBuckets),
      href: '/staff',
    },
    financeUserId && {
      label: t('finance'),
      value: formatUZS(lastPoint(financeBuckets)),
      icon: Wallet,
      tint: 'green' as const,
      buckets: financeBuckets,
      percent: momChangePercent(financeBuckets),
      href: `/finance/${financeUserId}`,
      maskable: true,
    },
    showLessonPlanCards && {
      label: t('activeGroups'),
      value: lastPoint(groupBuckets),
      icon: Layers,
      tint: 'blue' as const,
      buckets: groupBuckets,
      percent: momChangePercent(groupBuckets),
      href: '/lesson-plans',
    },
    showLessonPlanCards && {
      label: t('lessonPlans'),
      value: lastPoint(lessonBuckets),
      icon: CalendarDays,
      tint: 'orange' as const,
      buckets: lessonBuckets,
      percent: momChangePercent(lessonBuckets),
      href: '/lesson-plans',
    },
  ].filter(Boolean) as Card[];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, index) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          icon={c.icon}
          tint={c.tint}
          changePercent={c.percent}
          sparkline={c.buckets}
          href={c.href}
          index={index}
          maskable={c.maskable}
        />
      ))}
    </div>
  );
}
