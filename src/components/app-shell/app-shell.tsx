import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { LogoutButton } from '@/components/auth/logout-button';
import { BackgroundProvider } from '@/components/theme/background-context';
import { DynamicBackground } from '@/components/theme/dynamic-background';
import { SidebarNav } from './sidebar-nav';
import { MobileNav } from './mobile-nav';
import type { Profile } from '@/lib/auth/session';

const GLASS_CONTROL = 'border-white/30 bg-white/10 text-white hover:bg-white/20';

export async function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const t = await getTranslations('app');

  return (
    <BackgroundProvider>
      <DynamicBackground />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-white/20 bg-white/10 p-4 text-white shadow-xl backdrop-blur-lg md:flex">
          <span className="mb-6 text-sm font-semibold tracking-tight text-white">{t('name')}</span>
          <SidebarNav role={profile.role} glass />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center border-b border-white/20 bg-white/10 px-4 text-white backdrop-blur-lg">
            <div className="flex items-center gap-2 md:hidden">
              <MobileNav role={profile.role} />
              <span className="text-sm font-semibold tracking-tight text-white">{t('name')}</span>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-sm text-white/70 sm:inline">
                {profile.first_name} {profile.last_name}
              </span>
              <ThemeToggle className={GLASS_CONTROL} />
              <LanguageSwitcher className={GLASS_CONTROL} />
              <LogoutButton className={GLASS_CONTROL} />
            </div>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </BackgroundProvider>
  );
}
