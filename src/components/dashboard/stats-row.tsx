import { getTranslations } from 'next-intl/server';
import { Users, Layers, CalendarDays, Wallet, Target, ListTodo } from 'lucide-react';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import {
  monthlyBuckets,
  monthlyAmountBuckets,
  cumulativeMonthlyBuckets,
  momChangePercent,
} from '@/lib/dashboard-stats';
import { formatUZS } from '@/lib/format-currency';
import { tashkentMonthKey } from '@/lib/time';
import { efficiencyForMonth } from '@/lib/task-efficiency';
import { StatCard } from './stat-card';

const MONTHS = 6;

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
      sql<{ created_at: string; status: string; deadline: string; completed_at: string | null }[]>`
        select created_at, status, deadline, completed_at from tasks where assigned_to = ${userId}
      `,
    ]);

    const netFinance = financeRows.reduce((sum, r) => sum + r.amount, 0);
    const activeMissions = missionRows.filter((m) => m.status !== 'approved' && m.status !== 'rejected');
    const activeTasks = taskRows.filter((task) => task.status !== 'done');

    // 1. Finance: sum of amounts per month for sparkline + safe MoM change
    const financeBuckets = monthlyAmountBuckets(financeRows, MONTHS);
    const financeChange = momChangePercent(financeBuckets);

    // 2. Missions: all mission count per month for sparkline + current-month
    // completion rate % (of missions created this Tashkent month, the share
    // that are approved; 100 if none were created — nothing to miss).
    const missionBuckets = monthlyBuckets(
      missionRows.map((m) => m.created_at),
      MONTHS,
    );
    const missionMonth = tashkentMonthKey();
    const missionsThisMonth = missionRows.filter(
      (m) => tashkentMonthKey(new Date(m.created_at)) === missionMonth,
    );
    const approvedThisMonth = missionsThisMonth.filter((m) => m.status === 'approved');
    const missionPercent =
      missionsThisMonth.length === 0
        ? 100
        : Math.round((approvedThisMonth.length / missionsThisMonth.length) * 100);

    // 3. Tasks: all task count per month for sparkline + current month efficiency %
    const taskBuckets = monthlyBuckets(
      taskRows.map((task) => task.created_at),
      MONTHS,
    );
    const currentMonth = tashkentMonthKey();
    const taskStats = efficiencyForMonth(taskRows, currentMonth);
    const taskPercent = taskStats.efficiencyPct;

    const cards: Card[] = [
      {
        label: t('finance'),
        value: formatUZS(netFinance),
        icon: Wallet,
        tint: 'green',
        buckets: financeBuckets,
        percent: financeChange,
        href: `/finance/${userId}`,
        maskable: true,
      },
      {
        label: t('missions'),
        value: activeMissions.length,
        icon: Target,
        tint: 'blue',
        buckets: missionBuckets,
        percent: missionPercent,
        href: `/missions/${userId}`,
      },
      {
        label: t('tasks'),
        value: activeTasks.length,
        icon: ListTodo,
        tint: 'orange',
        buckets: taskBuckets,
        percent: taskPercent,
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
  const netFinance = financeRows.reduce((sum, r) => sum + r.amount, 0);
  const financeBuckets = monthlyAmountBuckets(financeRows, MONTHS);

  const cards: Card[] = [
    showTotalStaff && {
      label: t('totalStaff'),
      value: activeStaff.length,
      icon: Users,
      tint: 'green' as const,
      buckets: staffBuckets,
      percent: momChangePercent(staffBuckets),
      href: '/staff',
    },
    financeUserId && {
      label: t('finance'),
      value: formatUZS(netFinance),
      icon: Wallet,
      tint: 'green' as const,
      buckets: financeBuckets,
      percent: momChangePercent(financeBuckets),
      href: `/finance/${financeUserId}`,
      maskable: true,
    },
    showLessonPlanCards && {
      label: t('activeGroups'),
      value: groupRows.length,
      icon: Layers,
      tint: 'blue' as const,
      buckets: groupBuckets,
      percent: momChangePercent(groupBuckets),
      href: '/lesson-plans',
    },
    showLessonPlanCards && {
      label: t('lessonPlans'),
      value: lessonRows.length,
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
