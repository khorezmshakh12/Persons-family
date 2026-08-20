import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { computeNavBadgeKeys } from '@/lib/nav-badges';
import { checkMaterialsLink } from '@/lib/sso/checkMaterialsLink';
import { AppShell } from '@/components/app-shell/app-shell';
import { BirthdayReminder } from '@/components/birthday-reminder';
import { getUpcomingBirthdays, tashkentTodayKey } from '@/lib/upcoming-birthdays';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, suspended } = await getAuthState();
  const locale = await getLocale();

  if (!user || !profile) {
    redirect({ href: suspended ? { pathname: '/login', query: { reason: 'suspended' } } : '/login', locale });
  }
  if (profile!.must_change_password) redirect({ href: '/set-password', locale });

  const [
    activeProfiles,
    unreadChatRows,
    unseenIssueRows,
    unseenTaskRows,
    unseenWarningRows,
    unseenLessonPlanAlertRows,
    newNavKeys,
    materialsLinked,
  ] = await Promise.all([
      sql<{ id: string; first_name: string; last_name: string; date_of_birth: string | null }[]>`
        select id, first_name, last_name, date_of_birth from profiles where is_active = true
      `,
      sql<{ id: string; sender_id: string; message_text: string | null; created_at: string }[]>`
        select id, sender_id, message_text, created_at from staff_chats
        where receiver_id = ${user!.id} and is_read = false
        order by created_at desc limit 50
      `,
      sql<{ id: string; title: string; created_at: string }[]>`
        select id, title, created_at from issues
        where assigned_to = ${user!.id} and is_seen = false
        order by created_at desc limit 50
      `,
      sql<{ id: string; title: string; created_at: string }[]>`
        select id, title, created_at from tasks
        where assigned_to = ${user!.id} and is_seen = false
        order by created_at desc limit 50
      `,
      sql<{ id: string; reason: string; created_at: string }[]>`
        select id, reason, created_at from staff_warnings
        where staff_id = ${user!.id} and is_seen = false
        order by created_at desc limit 50
      `,
      // No staff_id filter — this table is CEO-only in practice (only the
      // CEO gets alerts assigned), so a non-CEO viewer's query simply comes
      // back empty, same behavior the old RLS policy gave for free.
      sql<{ id: string; summary: string; created_at: string }[]>`
        select id, summary, created_at from lesson_plan_compliance_alerts
        where is_seen = false
        order by created_at desc limit 50
      `,
      computeNavBadgeKeys(user!.id),
      checkMaterialsLink(profile!.phone),
    ]);
  // Real per-user "unseen" state — not a time-based heuristic — so each dot
  // clears the moment its page is visited (see MarkTasksSeen/MarkIssuesSeen/
  // MarkCompanyNewsSeen/MarkWarningsSeen) instead of just aging out after a
  // day. This is only the initial snapshot for first paint —
  // NavBadgesProvider takes over from here and keeps it live via the
  // Firestore nav_badge_signals doc without needing a refresh.
  const upcomingBirthdays = getUpcomingBirthdays(
    activeProfiles.filter((p): p is typeof p & { date_of_birth: string } => p.date_of_birth !== null),
  );
  const birthdayNames = upcomingBirthdays.map((p) => `${p.first_name} ${p.last_name}`);
  const profileNames = Object.fromEntries(activeProfiles.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const initialUnreadChats = unreadChatRows.map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    messageText: m.message_text,
    createdAt: m.created_at,
  }));
  const initialUnseenIssues = unseenIssueRows.map((i) => ({
    id: i.id,
    title: i.title,
    createdAt: i.created_at,
  }));
  const initialUnseenTasks = unseenTaskRows.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.created_at,
  }));
  const initialUnseenWarnings = unseenWarningRows.map((w) => ({
    id: w.id,
    reason: w.reason,
    createdAt: w.created_at,
  }));
  const initialUnseenLessonPlanAlerts = unseenLessonPlanAlertRows.map((a) => ({
    id: a.id,
    summary: a.summary,
    createdAt: a.created_at,
  }));

  return (
    <AppShell
      profile={profile!}
      userId={user!.id}
      profileNames={profileNames}
      initialUnreadChats={initialUnreadChats}
      initialUnseenIssues={initialUnseenIssues}
      initialUnseenTasks={initialUnseenTasks}
      initialUnseenWarnings={initialUnseenWarnings}
      initialUnseenLessonPlanAlerts={initialUnseenLessonPlanAlerts}
      newNavKeys={newNavKeys}
      materialsLinked={materialsLinked}
    >
      <BirthdayReminder names={birthdayNames} todayKey={tashkentTodayKey()} />
      {children}
    </AppShell>
  );
}
