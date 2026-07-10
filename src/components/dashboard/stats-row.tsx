import { getTranslations } from 'next-intl/server';
import { Users, Layers, CalendarDays, MessagesSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { monthlyBuckets, momChangePercent } from '@/lib/dashboard-stats';
import { StatCard } from './stat-card';

const MONTHS = 6;

export async function StatsRow({ isAdminRole }: { isAdminRole: boolean }) {
  const t = await getTranslations('dashboard.stats');
  const supabase = await createClient();

  // Each RLS-scoped independently: profiles are visible platform-wide, but
  // groups/course_lessons/staff_chat_messages narrow to what the viewer's
  // own role can see (their own groups for a teacher, assigned group for a
  // TA) — so a non-admin's cards naturally read as "my" totals, not the
  // company's, without any extra filtering logic here.
  const [
    { data: staffRows },
    { data: groupRows },
    { data: lessonRows },
    { data: chatRowsA },
    { data: chatRowsB },
  ] = await Promise.all([
    supabase.from('profiles').select('created_at, is_active'),
    supabase.from('groups').select('created_at'),
    supabase.from('course_lessons').select('created_at'),
    supabase.from('staff_chats').select('created_at'),
    supabase.from('staff_chat_messages').select('created_at'),
  ]);

  const activeStaff = (staffRows ?? []).filter((r) => r.is_active);
  const staffBuckets = monthlyBuckets(activeStaff.map((r) => r.created_at), MONTHS);
  const groupBuckets = monthlyBuckets((groupRows ?? []).map((r) => r.created_at), MONTHS);
  const lessonBuckets = monthlyBuckets((lessonRows ?? []).map((r) => r.created_at), MONTHS);
  const chatTimestamps = [...(chatRowsA ?? []), ...(chatRowsB ?? [])].map((r) => r.created_at);
  const chatBuckets = monthlyBuckets(chatTimestamps, MONTHS);

  const cards = [
    // CEO/Admin get "Total Staff"; a teacher's own dashboard has no use for
    // company-wide headcount, so it's dropped for that role instead.
    isAdminRole && {
      label: t('totalStaff'),
      value: activeStaff.length,
      icon: Users,
      tint: 'green' as const,
      buckets: staffBuckets,
      href: '/staff',
    },
    {
      label: t('activeGroups'),
      value: groupRows?.length ?? 0,
      icon: Layers,
      tint: 'blue' as const,
      buckets: groupBuckets,
      href: '/lesson-plans',
    },
    {
      label: t('lessonPlans'),
      value: lessonRows?.length ?? 0,
      icon: CalendarDays,
      tint: 'orange' as const,
      buckets: lessonBuckets,
      href: '/lesson-plans',
    },
    // Teachers get their Self-Development chart in place of this card
    // instead (see DashboardPage), so it's only shown for CEO/Admin.
    isAdminRole && {
      label: t('chatActivity'),
      value: chatTimestamps.length,
      icon: MessagesSquare,
      tint: 'red' as const,
      buckets: chatBuckets,
      href: '/chat',
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: number;
    icon: typeof Users;
    tint: 'green' | 'blue' | 'orange' | 'red';
    buckets: number[];
    href: string;
  }>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          icon={c.icon}
          tint={c.tint}
          changePercent={momChangePercent(c.buckets)}
          sparkline={c.buckets}
          href={c.href}
        />
      ))}
    </div>
  );
}
