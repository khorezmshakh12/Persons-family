import { getTranslations } from 'next-intl/server';
import { Users, Layers, CalendarDays, Wallet, Target, ListTodo } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { monthlyBuckets, momChangePercent } from '@/lib/dashboard-stats';
import { formatUZS } from '@/lib/format-currency';
import { StatCard } from './stat-card';

const MONTHS = 6;

type Card = {
  label: string;
  value: number | string;
  icon: typeof Users;
  tint: 'green' | 'blue' | 'orange';
  buckets: number[];
  href: string;
};

export async function StatsRow({
  showTotalStaff,
  showLessonPlanCards,
  personalDashboardUserId,
}: {
  /** CEO only. */
  showTotalStaff: boolean;
  /** Active Groups/Lesson Plans — CEO and Head Teacher see every group/
   * lesson (RLS scopes it platform-wide for both), teacher/assistant see
   * their own (RLS narrows it) — same flag, the row count just differs by
   * what the viewer's RLS lets the query return. */
  showLessonPlanCards: boolean;
  /** Every other non-teacher role (assistant, admin_manager, smm_mobilgrof,
   * internship, it_developer): a personal Finance/Missions/Tasks view
   * instead of company-wide totals that aren't relevant to their work.
   * Mutually exclusive with the two flags above. */
  personalDashboardUserId?: string;
}) {
  const t = await getTranslations('dashboard.stats');
  const supabase = await createClient();

  if (personalDashboardUserId) {
    const userId = personalDashboardUserId;
    const [{ data: financeRows }, { data: missionRows }, { data: taskRows }] = await Promise.all([
      supabase.from('finance_entries').select('amount, created_at').eq('staff_id', userId),
      supabase.from('missions').select('created_at, status').eq('staff_id', userId),
      supabase.from('tasks').select('created_at, status').eq('assigned_to', userId),
    ]);

    const netFinance = (financeRows ?? []).reduce((sum, r) => sum + r.amount, 0);
    const activeMissions = (missionRows ?? []).filter((m) => m.status !== 'approved' && m.status !== 'rejected');
    const activeTasks = (taskRows ?? []).filter((task) => task.status !== 'done');

    const financeBuckets = monthlyBuckets((financeRows ?? []).map((r) => r.created_at), MONTHS);
    const missionBuckets = monthlyBuckets(activeMissions.map((m) => m.created_at), MONTHS);
    const taskBuckets = monthlyBuckets(activeTasks.map((task) => task.created_at), MONTHS);

    const cards: Card[] = [
      {
        label: t('finance'),
        value: formatUZS(netFinance),
        icon: Wallet,
        tint: 'green',
        buckets: financeBuckets,
        href: `/finance/${userId}`,
      },
      {
        label: t('missions'),
        value: activeMissions.length,
        icon: Target,
        tint: 'blue',
        buckets: missionBuckets,
        href: `/missions/${userId}`,
      },
      {
        label: t('tasks'),
        value: activeTasks.length,
        icon: ListTodo,
        tint: 'orange',
        buckets: taskBuckets,
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
            changePercent={momChangePercent(c.buckets)}
            sparkline={c.buckets}
            href={c.href}
            index={index}
          />
        ))}
      </div>
    );
  }

  // Each RLS-scoped independently: profiles are visible platform-wide, but
  // groups/course_lessons narrow to what the viewer's own role can see
  // (their own groups for a teacher, assigned group for a TA, everything
  // for CEO/Head Teacher) — so a non-admin's cards naturally read as "my"
  // totals, not the company's, without any extra filtering logic here.
  const [{ data: staffRows }, { data: groupRows }, { data: lessonRows }] = await Promise.all([
    supabase.from('profiles').select('created_at, is_active'),
    showLessonPlanCards
      ? supabase.from('groups').select('created_at')
      : Promise.resolve({ data: [] as { created_at: string }[] }),
    showLessonPlanCards
      ? supabase.from('course_lessons').select('created_at')
      : Promise.resolve({ data: [] as { created_at: string }[] }),
  ]);

  const activeStaff = (staffRows ?? []).filter((r) => r.is_active);
  const staffBuckets = monthlyBuckets(activeStaff.map((r) => r.created_at), MONTHS);
  const groupBuckets = monthlyBuckets((groupRows ?? []).map((r) => r.created_at), MONTHS);
  const lessonBuckets = monthlyBuckets((lessonRows ?? []).map((r) => r.created_at), MONTHS);

  const cards = [
    showTotalStaff && {
      label: t('totalStaff'),
      value: activeStaff.length,
      icon: Users,
      tint: 'green' as const,
      buckets: staffBuckets,
      href: '/staff',
    },
    showLessonPlanCards && {
      label: t('activeGroups'),
      value: groupRows?.length ?? 0,
      icon: Layers,
      tint: 'blue' as const,
      buckets: groupBuckets,
      href: '/lesson-plans',
    },
    showLessonPlanCards && {
      label: t('lessonPlans'),
      value: lessonRows?.length ?? 0,
      icon: CalendarDays,
      tint: 'orange' as const,
      buckets: lessonBuckets,
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
          changePercent={momChangePercent(c.buckets)}
          sparkline={c.buckets}
          href={c.href}
          index={index}
        />
      ))}
    </div>
  );
}
