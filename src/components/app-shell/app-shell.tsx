import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LogoutButton } from '@/components/auth/logout-button';
import { BackgroundProvider } from '@/components/theme/background-context';
import { DynamicBackground } from '@/components/theme/dynamic-background';
import { SidebarNav } from './sidebar-nav';
import { MobileNav } from './mobile-nav';
import { ProfileProvider } from './profile-context';
import { NavBadgesProvider } from './nav-badges-context';
import { UserBadge } from './user-badge';
import { NotificationBell, type UnreadChatItem, type UnseenIssueItem, type UnseenTaskItem } from './notification-bell';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { PresenceProvider } from '@/components/presence/presence-context';
import { PageTransition } from './page-transition';
import { AnnouncementBanner } from '@/components/announcements/announcement-banner';
import { TashkentClock } from './tashkent-clock';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/auth/session';
import type { NavItem } from '@/lib/nav';

const GLASS_CONTROL = 'border-white/30 bg-white/10 text-white hover:bg-white/20';

export async function AppShell({
  profile,
  userId,
  profileNames,
  initialUnreadChats,
  initialUnseenIssues,
  initialUnseenTasks,
  newNavKeys,
  children,
}: {
  profile: Profile;
  userId: string;
  profileNames: Record<string, string>;
  initialUnreadChats: UnreadChatItem[];
  initialUnseenIssues: UnseenIssueItem[];
  initialUnseenTasks: UnseenTaskItem[];
  newNavKeys: NavItem['key'][];
  children: ReactNode;
}) {
  const t = await getTranslations('app');
  const supabase = await createClient();
  const { data: announcement } = await supabase
    .from('platform_announcements')
    .select('message')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <BackgroundProvider>
      <AnnouncementBanner initialMessage={announcement?.message ?? null} />
      <ProfileProvider
        initialFirstName={profile.first_name}
        initialLastName={profile.last_name}
        initialAvatarUrl={profile.avatar_url}
      >
        <PresenceProvider userId={userId}>
          <NavBadgesProvider userId={userId} initialKeys={newNavKeys}>
            <DynamicBackground />
            <CommandPalette />
            <div className="relative flex min-h-screen">
              <aside className="hidden w-60 shrink-0 transform-gpu flex-col border-r border-white/20 bg-white/10 p-4 text-white shadow-xl backdrop-blur-lg will-change-transform md:flex">
                <span className="font-heading mb-6 text-sm font-semibold tracking-tight text-white">
                  {t('name')}
                </span>
                <SidebarNav role={profile.role} glass />
                <UserBadge className="mt-auto border-t border-white/10 pt-4" userId={userId} />
                <span className="pt-3 text-center text-xs tracking-wider text-white/50">
                  Persons ERP v1.7.0
                </span>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                {/* transform-gpu lives on the sticky header itself, not this wrapper —
                  a transformed ancestor can break position: sticky in some browsers. */}
                <header className="sticky top-0 z-40 flex h-14 transform-gpu items-center border-b border-white/20 bg-white/10 px-4 text-white backdrop-blur-lg will-change-transform">
                  <div className="flex items-center gap-2 md:hidden">
                    <MobileNav role={profile.role} />
                    <span className="font-heading text-sm font-semibold tracking-tight text-white">
                      {t('name')}
                    </span>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    <NotificationBell
                      userId={userId}
                      profileNames={profileNames}
                      initialUnreadChats={initialUnreadChats}
                      initialUnseenIssues={initialUnseenIssues}
                      initialUnseenTasks={initialUnseenTasks}
                    />
                    <UserBadge className="hidden sm:flex" userId={userId} />
                    <LanguageSwitcher className={GLASS_CONTROL} />
                    <LogoutButton className={GLASS_CONTROL} />
                  </div>
                </header>

                <main className="min-h-0 min-w-0 flex-1 transform-gpu will-change-transform">
                  <PageTransition>{children}</PageTransition>
                </main>

                <footer className="flex h-8 shrink-0 items-center justify-end border-t border-white/20 bg-white/10 px-4 text-xs text-white/60 backdrop-blur-lg">
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
