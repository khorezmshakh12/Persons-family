'use client';

import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  CircleAlert,
  CalendarDays,
  ListTodo,
  Megaphone,
  Settings,
  Send,
  TrendingUp,
  User,
  Wallet,
  Milestone,
  BookOpen,
  ShoppingBag,
  Star,
  Map as MapIcon,
  Sparkles,
  Calculator,
  Gauge,
  Layers,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEM, NAV_ITEM_ACTIVE } from '@/lib/glass';
import { groupedNavItemsForRole, type NavItem, type StaffRole } from '@/lib/nav';
import { useNavBadgeKeys } from './nav-badges-context';

const ICONS: Record<NavItem['key'], React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  dashboard: LayoutDashboard,
  core: Sparkles,
  staff: Users,
  chat: MessageSquare,
  issues: CircleAlert,
  lessonPlans: CalendarDays,
  tasks: ListTodo,
  companyNews: Megaphone,
  telegramSetup: Send,
  selfDevelopment: TrendingUp,
  finance: Wallet,
  roadmap: Milestone,
  market: ShoppingBag,
  strategy: MapIcon,
  accounting: Calculator,
  operations: Gauge,
  perforce: Layers,
  profile: User,
  settings: Settings,
  materials: BookOpen,
};

export function SidebarNav({
  role,
  materialsLinked = false,
  starBalance,
  onNavigate,
}: {
  role: StaffRole;
  /** Whether this employee's phone number matches an active Materials
   * account — hides the "Materials" item entirely when it doesn't. */
  materialsLinked?: boolean;
  /** Shown next to the Market entry; omitted = no pill. */
  starBalance?: number;
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  const tShell = useTranslations('shell');
  const pathname = usePathname();
  const groups = groupedNavItemsForRole(role, { materialsLinked });
  // Live-updating "new" dot state — see NavBadgesProvider for why this
  // can't just be the static prop the layout computed at request time.
  const newKeys = useNavBadgeKeys();

  return (
    <nav className="flex flex-col">
      {groups.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-0.5">
          {group !== 'main' && (
            <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.07em] text-au-muted uppercase">
              {tShell(`groups.${group}`)}
            </p>
          )}
          {items.map((item) => {
            const Icon = ICONS[item.key];
            const active = !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`));
            const itemClassName = active ? NAV_ITEM_ACTIVE : NAV_ITEM;

            const content = (
              <>
                <Icon
                  strokeWidth={1.75}
                  className={cn('size-[17px] shrink-0', active ? 'text-au-accent-text' : 'text-au-faint')}
                />
                <span className="truncate">{t(item.key)}</span>
                {item.key === 'market' && starBalance !== undefined && (
                  <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-au-accent-text tabular-nums">
                    <Star className="size-3 fill-current" strokeWidth={1.75} aria-hidden />
                    {starBalance}
                  </span>
                )}
                {newKeys.includes(item.key) && (
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full bg-au-accent',
                      !(item.key === 'market' && starBalance !== undefined) && 'ml-auto',
                    )}
                    aria-hidden
                  />
                )}
              </>
            );

            // Points at the Materials app on the other side of the gateway —
            // a plain <a> (not the i18n Link) so basePath/locale prefixing
            // doesn't mangle the cross-app URL.
            if (item.external) {
              return (
                <a key={item.key} href={item.href} onClick={onNavigate} className={itemClassName}>
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                // Every dynamic route below has its own loading.tsx, so a full
                // prefetch warms the actual page content in the background —
                // clicking a sidebar item then swaps in an already-fetched
                // response instead of starting cold.
                prefetch
                className={itemClassName}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
