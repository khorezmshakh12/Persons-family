import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { LogoutButton } from '@/components/auth/logout-button';
import { SidebarNav } from './sidebar-nav';
import { MobileNav } from './mobile-nav';
import type { Profile } from '@/lib/auth/session';

export async function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const t = await getTranslations('app');

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r p-4 md:flex">
        <span className="mb-6 text-sm font-semibold tracking-tight">{t('name')}</span>
        <SidebarNav role={profile.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background sticky top-0 z-40 flex h-14 items-center border-b px-4">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav role={profile.role} />
            <span className="text-sm font-semibold tracking-tight">{t('name')}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {profile.first_name} {profile.last_name}
            </span>
            <ThemeToggle />
            <LanguageSwitcher />
            <LogoutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
