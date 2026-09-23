import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import packageJson from '../../../package.json';
import { LanguageSwitcher } from '@/components/language-switcher';
import { BackgroundProvider } from '@/components/theme/background-context';
import { MobileNav } from './mobile-nav';
import { SidebarPanel, type SidebarGoal } from './sidebar-panel';
import { Breadcrumbs, SearchTrigger, StarPill } from './topbar';
import { ProfileProvider } from './profile-context';
import { NavBadgesProvider } from './nav-badges-context';
import {
  NotificationBell,
  type UnreadChatItem,
  type UnseenIssueItem,
  type UnseenTaskItem,
  type UnseenWarningItem,
  type UnseenLessonPlanAlertItem,
} from './notification-bell';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { PresenceProvider } from '@/components/presence/presence-context';
import { PageTransition } from './page-transition';
import { AnnouncementBanner } from '@/components/announcements/announcement-banner';
import { VersionWatcher } from './version-watcher';
import { TashkentClock } from './tashkent-clock';
import { sql } from '@/lib/db/client';
import { getStarBalance } from '@/lib/stars';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import type { Profile } from '@/lib/auth/session';
import type { NavItem } from '@/lib/nav';

export async function AppShell({
  profile,
  userId,
  profileNames,
  initialUnreadChats,
  initialUnseenIssues,
  initialUnseenTasks,
  initialUnseenWarnings,
  initialUnseenLessonPlanAlerts,
  newNavKeys,
  materialsLinked = false,
  children,
}: {
  profile: Profile;
  userId: string;
  profileNames: Record<string, string>;
  initialUnreadChats: UnreadChatItem[];
  initialUnseenIssues: UnseenIssueItem[];
  initialUnseenTasks: UnseenTaskItem[];
  initialUnseenWarnings: UnseenWarningItem[];
  initialUnseenLessonPlanAlerts: UnseenLessonPlanAlertItem[];
  newNavKeys: NavItem['key'][];
  /** Whether this employee's phone number matches an active Materials
   * account — see src/lib/sso/checkMaterialsLink.ts. */
  materialsLinked?: boolean;
  children: ReactNode;
}) {
  const tStaff = await getTranslations('staff');
  // Roadmap goals are CEO / Administrative Manager territory (same gate as
  // the /roadmap page and its nav entry), so only they get the sidebar goal
  // card — everyone else simply doesn't render it.
  const canSeeGoals = profile.role === 'ceo' || profile.role === 'admin_manager';
  const [[announcement], initialAvatarUrl, starBalance, goalRows] = await Promise.all([
    sql<{ message: string }[]>`
      select message from platform_announcements order by created_at desc limit 1
    `,
    resolveAvatarUrl(profile.avatar_url),
    getStarBalance(userId),
    canSeeGoals
      ? sql<{ title: string; progress_percentage: number }[]>`
          select title, progress_percentage from roadmap_goals
          where timeframe = 'quarterly' and status = 'pending'
          order by created_at desc limit 1
        `
      : Promise.resolve([]),
  ]);
  const goal: SidebarGoal | null = goalRows[0]
    ? { title: goalRows[0].title, progress: Math.round(Number(goalRows[0].progress_percentage) || 0) }
    : null;
  const panelProps = {
    role: profile.role,
    roleLabel: tStaff(`roles.${profile.role}`),
    materialsLinked,
    starBalance,
    goal,
    userId,
    version: packageJson.version,
  };

  return (
    <BackgroundProvider>
      <AnnouncementBanner initialMessage={announcement?.message ?? null} />
      <VersionWatcher />
      <ProfileProvider
        initialFirstName={profile.first_name}
        initialLastName={profile.last_name}
        initialAvatarUrl={initialAvatarUrl}
      >
        <PresenceProvider userId={userId}>
          <NavBadgesProvider userId={userId} initialKeys={newNavKeys}>
            <CommandPalette />
            <div className="relative flex min-h-screen bg-au-bg">
              <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-au-line bg-au-sidebar px-3.5 py-5 min-[960px]:flex">
                <SidebarPanel {...panelProps} />
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-40 flex h-[62px] items-center gap-2 bg-au-bg px-4 sm:gap-3 sm:px-7 min-[960px]:h-[76px]">
                  <div className="min-[960px]:hidden">
                    <MobileNav {...panelProps} />
                  </div>
                  <Breadcrumbs />
                  <div className="flex-1" />
                  <SearchTrigger />
                  <NotificationBell
                    userId={userId}
                    profileNames={profileNames}
                    initialUnreadChats={initialUnreadChats}
                    initialUnseenIssues={initialUnseenIssues}
                    initialUnseenTasks={initialUnseenTasks}
                    initialUnseenWarnings={initialUnseenWarnings}
                    initialUnseenLessonPlanAlerts={initialUnseenLessonPlanAlerts}
                  />
                  <StarPill balance={starBalance} />
                  <LanguageSwitcher compact className="hidden sm:flex" />
                </header>

                <main className="min-h-0 min-w-0 flex-1">
                  <PageTransition>{children}</PageTransition>
                </main>

                <footer className="flex h-9 shrink-0 items-center justify-end px-4 text-xs text-au-muted sm:px-7">
                  <TashkentClock />
                </footer>
              </div>
            </div>
          </NavBadgesProvider>
        </PresenceProvider>
      </ProfileProvider>
    </BackgroundProvider>
  );
}
