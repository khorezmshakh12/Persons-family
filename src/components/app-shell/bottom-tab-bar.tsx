'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutGrid, LogOut } from 'lucide-react';
import { StarIcon } from '@/components/ui/star-icon';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Link, usePathname } from '@/i18n/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { groupedNavItemsForRole, navItemsForRole, type NavGroup, type NavItem, type StaffRole } from '@/lib/nav';
import { haptic } from '@/lib/telegram-webapp';
import { cn } from '@/lib/utils';
import { ICONS } from './sidebar-nav';
import { UserBadge } from './user-badge';
import { useNavBadgeKeys } from './nav-badges-context';

/** First four of these the person can open become the tabs; everything
 * (these included) is also in the Menu sheet. */
const TAB_PRIORITY: NavItem['key'][] = [
  'dashboard',
  'tasks',
  'chat',
  'market',
  'issues',
  'companyNews',
  'lessonPlans',
  'staff',
  'profile',
];

const TILE: Record<NavGroup, string> = {
  daily: 'bg-au-accent-soft text-au-accent-text',
  me: 'bg-au-ok-soft text-au-ok',
  team: 'bg-au-info-soft text-au-info',
  manage: 'bg-au-card-2 text-au-ink',
  system: 'bg-au-card-2 text-au-muted',
};

function isActive(pathname: string, item: NavItem) {
  return !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`));
}

/**
 * Below 960px the app is laid out like a native mobile app: this fixed
 * bottom tab bar replaces the sidebar, and its last tab opens a sheet with
 * every section the person can open. Same visibility rules as the sidebar
 * (navItemsForRole); the sidebar itself stays the desktop layout.
 */
export function BottomTabBar({
  role,
  roleLabel,
  materialsLinked,
  coreViews,
  starBalance,
  userId,
  version,
}: {
  role: StaffRole;
  roleLabel: string;
  materialsLinked: boolean;
  coreViews: string[];
  starBalance: number;
  userId: string;
  version: string;
}) {
  const t = useTranslations('nav');
  const tApp = useTranslations('appMode');
  const tShell = useTranslations('shell');
  const pathname = usePathname();
  const newKeys = useNavBadgeKeys();
  const [open, setOpen] = useState(false);

  const visible = navItemsForRole(role, { materialsLinked, coreViews });
  const tabs = TAB_PRIORITY.map((key) => visible.find((i) => i.key === key && !i.external))
    .filter((i): i is NavItem => !!i)
    .slice(0, 4);
  const groups = groupedNavItemsForRole(role, { materialsLinked, coreViews });
  const onTab = tabs.some((i) => isActive(pathname, i));
  const menuHasNew = visible.some((i) => newKeys.includes(i.key) && !tabs.includes(i));

  return (
    <>
      <nav className="app-tabbar app-only min-[960px]:hidden" aria-label={tApp('allSections')}>
        {tabs.map((item) => {
          const Icon = ICONS[item.key];
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch
              aria-current={active ? 'page' : undefined}
              onClick={() => haptic('select')}
              className="app-tab"
              data-active={active || undefined}
            >
              <span className="app-tab-icon">
                <Icon strokeWidth={active ? 2.1 : 1.75} className="size-[21px]" />
                {newKeys.includes(item.key) && <span className="app-tab-dot" aria-hidden />}
              </span>
              <span className="app-tab-label">{item.key === 'dashboard' ? tApp('home') : t(item.key)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => {
            haptic('tap');
            setOpen(true);
          }}
          className="app-tab"
          data-active={!onTab || open || undefined}
          aria-haspopup="dialog"
        >
          <span className="app-tab-icon">
            <LayoutGrid strokeWidth={!onTab || open ? 2.1 : 1.75} className="size-[21px]" />
            {menuHasNew && <span className="app-tab-dot" aria-hidden />}
          </span>
          <span className="app-tab-label">{tApp('more')}</span>
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="app-sheet max-h-[86dvh] gap-0 rounded-t-[26px] border-au-line bg-au-bg px-0 pt-2 pb-0"
        >
          <span className="mx-auto mb-3 h-[5px] w-10 shrink-0 rounded-full bg-au-line" aria-hidden />
          <SheetTitle className="sr-only">{tApp('allSections')}</SheetTitle>

          <div className="flex items-center gap-3 px-5 pb-4">
            <Link href="/profile" onClick={() => setOpen(false)} className="min-w-0 flex-1">
              <UserBadge userId={userId} nameClassName="font-semibold text-au-ink text-[15px]" subtitle={roleLabel} />
            </Link>
            <Link
              href="/market"
              onClick={() => setOpen(false)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-au-accent-soft px-3 text-[13px] font-bold text-au-accent-text tabular-nums"
            >
              <StarIcon className="size-[14px]" />
              {starBalance}
            </Link>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {groups.map(({ group, items }) => (
              <section key={group} className="mb-3 rounded-[20px] bg-au-card p-3 shadow-au-card">
                <h3 className="px-1 pb-2 text-[11px] font-semibold tracking-[0.07em] text-au-muted uppercase">
                  {tShell(`groups.${group}`)}
                </h3>
                <div className="grid grid-cols-4 gap-y-3">
                  {items.map((item) => {
                    const Icon = ICONS[item.key];
                    const active = isActive(pathname, item);
                    const body = (
                      <>
                        <span
                          className={cn(
                            'app-tile relative grid size-[52px] place-items-center rounded-[16px]',
                            TILE[group],
                            active && 'ring-2 ring-au-accent ring-offset-2 ring-offset-au-card',
                          )}
                        >
                          <Icon strokeWidth={1.9} className="size-[22px]" />
                          {newKeys.includes(item.key) && (
                            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-au-card bg-au-bad" />
                          )}
                        </span>
                        <span className="line-clamp-2 w-full px-0.5 text-center text-[11px] leading-[13px] font-medium text-au-ink">
                          {t(item.key)}
                        </span>
                      </>
                    );
                    const cls = 'flex flex-col items-center gap-1.5 active:scale-95 transition-transform';
                    return item.external ? (
                      <a key={item.key} href={item.href} className={cls} onClick={() => haptic('select')}>
                        {body}
                      </a>
                    ) : (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={cls}
                        onClick={() => {
                          haptic('select');
                          setOpen(false);
                        }}
                      >
                        {body}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <LanguageSwitcher compact />
              <div className="flex-1" />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex h-[38px] items-center gap-2 rounded-au-ctl border border-au-line bg-au-card px-3.5 text-[13px] font-semibold text-au-bad"
                >
                  <LogOut className="size-4" strokeWidth={1.9} />
                  {tShell('logout')}
                </button>
              </form>
            </div>
            <p className="pt-3 text-center text-[11px] tracking-wider text-au-muted">Persons ERP {version}</p>
          </div>
          <div className="app-safe-bottom shrink-0" aria-hidden />
        </SheetContent>
      </Sheet>
    </>
  );
}
