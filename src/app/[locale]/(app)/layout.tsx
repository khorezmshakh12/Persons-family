import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell/app-shell';
import { BirthdayReminder } from '@/components/birthday-reminder';
import { getUpcomingBirthdays, tashkentTodayKey } from '@/lib/upcoming-birthdays';
import type { NavItem } from '@/lib/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, suspended } = await getAuthState();
  const locale = await getLocale();

  if (!user || !profile) {
    redirect({ href: suspended ? { pathname: '/login', query: { reason: 'suspended' } } : '/login', locale });
  }
  if (profile!.must_change_password) redirect({ href: '/set-password', locale });

  const supabase = await createClient();
  const [
    { data: activeProfiles },
    { data: unreadChatRows },
    { data: unseenIssueRows },
    { count: unseenTasksCount },
    { data: unseenCompanyNewsCount },
  ] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, date_of_birth').eq('is_active', true),
    supabase
      .from('staff_chats')
      .select('id, sender_id, message_text, created_at')
      .eq('receiver_id', user!.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('issues')
      .select('id, title, created_at')
      .eq('assigned_to', user!.id)
      .eq('is_seen', false)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', user!.id).eq('is_seen', false),
    supabase.rpc('unseen_company_news_count'),
  ]);
  // Real per-user "unseen" state — not a time-based heuristic — so each dot
  // clears the moment its page is visited (see MarkTasksSeen/MarkIssuesSeen/
  // MarkCompanyNewsSeen) instead of just aging out after a day.
  const newNavKeys: NavItem['key'][] = [
    ...(unseenTasksCount ? (['tasks'] as const) : []),
    ...((unseenIssueRows?.length ?? 0) > 0 ? (['issues'] as const) : []),
    ...((unseenCompanyNewsCount ?? 0) > 0 ? (['companyNews'] as const) : []),
  ];
  const upcomingBirthdays = getUpcomingBirthdays(activeProfiles ?? []);
  const birthdayNames = upcomingBirthdays.map((p) => `${p.first_name} ${p.last_name}`);
  const profileNames = Object.fromEntries(
    (activeProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]),
  );
  const initialUnreadChats = (unreadChatRows ?? []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    messageText: m.message_text,
    createdAt: m.created_at,
  }));
  const initialUnseenIssues = (unseenIssueRows ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    createdAt: i.created_at,
  }));

  return (
    <AppShell
      profile={profile!}
      userId={user!.id}
      profileNames={profileNames}
      initialUnreadChats={initialUnreadChats}
      initialUnseenIssues={initialUnseenIssues}
      newNavKeys={newNavKeys}
    >
      <BirthdayReminder names={birthdayNames} todayKey={tashkentTodayKey()} />
      {children}
    </AppShell>
  );
}
