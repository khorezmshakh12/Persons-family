import { getTranslations } from 'next-intl/server';
import { Users, Layers, CalendarDays, Wallet, Target, ListTodo } from 'lucide-react';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import {
  buildPeriodSeries,
  cumulativeAmountSeries,
  cumulativeCountSeries,
  openBacklogSeries,
  type PeriodSeries,
} from '@/lib/dashboard-stats';
import { getNetEarningEntries } from '@/lib/finance-net';
import { StatCard, type StatValueFormat } from './stat-card';
import { StatsPeriodToggle } from './stats-period';

// Every card on this row is built series-first: the card gets the metric's
// value at the end of each bucket, for all three periods, and derives its
// headline (the series' last point), its sparkline (the series) and its
// trend badge (last-vs-previous) from whichever period is selected. Nothing
// here may measure the headline, the sparkline or the badge a second,
// separate way — that divergence is exactly what made these cards contradict
// each other and contradict the pages they link to.
//
// All three grains come out of ONE fetch per source (the bucketing is a pure
// reduce over the rows already in memory), so the kunlik/haftalik/oylik
// toggle costs no extra query.

type Card = {
  label: string;
  series: PeriodSeries;
  format?: StatValueFormat;
  icon: typeof Users;
  tint: 'green' | 'blue' | 'orange';
  href: string;
  maskable?: boolean;
  /** false for backlogs: growing unfinished work is bad news, not good. */
  higherIsBetter?: boolean;
};

/** Missions are open until the CEO approves them (a rejection sends them
 * back to in_progress, so it isn't a terminal state) — the same rule
 * /missions counts "active" by. */
const isMissionOpen = (status: string) => status !== 'approved' && status !== 'rejected';

export async function StatsRow({
  showTotalStaff,
  showLessonPlanCards,
  personalDashboardUserId,
  financeUserId,
}: {
  /** CEO only. */
  showTotalStaff: boolean;
  /** Active Groups/Lesson Plans — CEO and Head Teacher see every group/
   * lesson, teacher/assistant see their own. */
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
    const [financeEntries, missionRows, taskRows] = await Promise.all([
      // The *whole* net-earnings ledger (salary + bonus/penalty + self
      // development + approved missions), which is what /finance/[id] totals.
      // This card used to sum finance_entries alone and so disagreed with the
      // page it links to.
      getNetEarningEntries(userId),
      sql<{ created_at: string; status: string; approved_at: string | null }[]>`
        select created_at, status, approved_at from missions where staff_id = ${userId}
      `,
      sql<{ created_at: string; status: string; completed_at: string | null }[]>`
        select created_at, status, completed_at from tasks where assigned_to = ${userId}
      `,
    ]);

    // 1. Finance: the running net balance at each bucket end, so the last bar
    // is the headline net total rather than one period's net alone.
    const financeSeries = buildPeriodSeries((period) =>
      cumulativeAmountSeries(financeEntries, period),
    );

    // 2/3. Missions & Tasks: how many were still OPEN at each bucket end.
    // The old series counted "rows open today, by the month they were raised
    // in", which only ever went up — the badge on an open-work card could
    // never report a decrease however much work was closed.
    const missionBacklog = missionRows.map((m) => ({
      createdAt: m.created_at,
      openUntil: isMissionOpen(m.status) ? null : (m.approved_at ?? m.created_at),
    }));
    const taskBacklog = taskRows.map((task) => ({
      createdAt: task.created_at,
      openUntil: task.status !== 'done' ? null : (task.completed_at ?? task.created_at),
    }));

    const missionSeries = buildPeriodSeries((period) => openBacklogSeries(missionBacklog, period));
    const taskSeries = buildPeriodSeries((period) => openBacklogSeries(taskBacklog, period));

    const cards: Card[] = [
      {
        label: t('finance'),
        series: financeSeries,
        format: 'uzs',
        icon: Wallet,
        tint: 'green',
        href: `/finance/${userId}`,
        maskable: true,
      },
      {
        label: t('missions'),
        series: missionSeries,
        icon: Target,
        tint: 'blue',
        href: `/missions/${userId}`,
        higherIsBetter: false,
      },
      {
        label: t('tasks'),
        series: taskSeries,
        icon: ListTodo,
        tint: 'orange',
        href: '/tasks',
        higherIsBetter: false,
      },
    ];

    return <CardsGrid cards={cards} columns={3} />;
  }

  // profiles are visible platform-wide, but groups/course_lessons used to
  // be narrowed by RLS to what the viewer's own role can see (their own
  // groups for a teacher, assigned group for a TA, everything for CEO/
  // Head Teacher) — RLS is gone, so that scoping is replicated explicitly
  // below, so a non-admin's cards keep reading as "my" totals, not the
  // company's.
  const { user, profile } = await getAuthState();
  const isCeoOrHeadTeacher = profile?.role === 'ceo' || profile?.role === 'head_teacher';
  const uid = user?.id ?? '';

  const [staffRows, groupRows, lessonRows, financeEntries] = await Promise.all([
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
    financeUserId ? getNetEarningEntries(financeUserId) : Promise.resolve([]),
  ]);

  const activeStaff = staffRows.filter((r) => r.is_active);
  // Count cards (Total Staff / Active Groups / Lesson Plans): the headline is
  // a running total, so the sparkline + trend run on the cumulative row count
  // over time — its last value equals the headline — not on new rows/bucket.
  const staffSeries = buildPeriodSeries((p) =>
    cumulativeCountSeries(activeStaff.map((r) => r.created_at), p),
  );
  const groupSeries = buildPeriodSeries((p) =>
    cumulativeCountSeries(groupRows.map((r) => r.created_at), p),
  );
  const lessonSeries = buildPeriodSeries((p) =>
    cumulativeCountSeries(lessonRows.map((r) => r.created_at), p),
  );
  const financeSeries = buildPeriodSeries((p) => cumulativeAmountSeries(financeEntries, p));

  const cards: Card[] = [
    showTotalStaff && {
      label: t('totalStaff'),
      series: staffSeries,
      icon: Users,
      tint: 'green' as const,
      href: '/staff',
    },
    financeUserId && {
      label: t('finance'),
      series: financeSeries,
      format: 'uzs' as const,
      icon: Wallet,
      tint: 'green' as const,
      href: `/finance/${financeUserId}`,
      maskable: true,
    },
    showLessonPlanCards && {
      label: t('activeGroups'),
      series: groupSeries,
      icon: Layers,
      tint: 'blue' as const,
      href: '/lesson-plans',
    },
    showLessonPlanCards && {
      label: t('lessonPlans'),
      series: lessonSeries,
      icon: CalendarDays,
      tint: 'orange' as const,
      href: '/lesson-plans',
    },
  ].filter(Boolean) as Card[];

  return <CardsGrid cards={cards} columns={4} />;
}

function CardsGrid({ cards, columns }: { cards: Card[]; columns: 3 | 4 }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <StatsPeriodToggle />
      </div>
      <div
        className={
          columns === 3
            ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'
        }
      >
        {cards.map((c, index) => (
          <StatCard
            key={c.label}
            label={c.label}
            series={c.series}
            format={c.format}
            icon={c.icon}
            tint={c.tint}
            href={c.href}
            index={index}
            maskable={c.maskable}
            higherIsBetter={c.higherIsBetter}
          />
        ))}
      </div>
    </div>
  );
}
