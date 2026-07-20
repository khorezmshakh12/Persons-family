'use client';

import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  AlertCircle,
  CalendarDays,
  ListTodo,
  Megaphone,
  Settings,
  MessagesSquare,
  Send,
  TrendingUp,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { navItemsForRole, type NavItem, type StaffRole } from '@/lib/nav';

const ICONS: Record<NavItem['key'], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  staff: Users,
  chat: MessageSquare,
  issues: AlertCircle,
  lessonPlans: CalendarDays,
  tasks: ListTodo,
  companyNews: Megaphone,
  staffChat: MessagesSquare,
  telegramSetup: Send,
  selfDevelopment: TrendingUp,
  settings: Settings,
};

export function SidebarNav({
  role,
  newKeys = [],
  onNavigate,
  glass = false,
}: {
  role: StaffRole;
  /** Nav item keys with items created in the last 24h — draws a small
   * green "new" dot next to the link. */
  newKeys?: NavItem['key'][];
  onNavigate?: () => void;
  /** True inside the glassmorphism desktop sidebar (over a dynamic photo
   * background); false inside the mobile Sheet, which keeps a normal
   * opaque surface and needs the usual theme-aware text colors instead. */
  glass?: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <nav className="flex flex-col gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            // Every dynamic route below has its own loading.tsx, so a full
            // prefetch (not just the default up-to-loading-boundary prefetch)
            // warms the actual page content in the background on hover/
            // viewport-visibility — clicking a sidebar item then just swaps
            // in an already-fetched response instead of starting cold.
            prefetch
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all hover:scale-[1.02] active:scale-[0.98]',
              glass
                ? active
                  ? 'border border-teal-300/30 bg-teal-400/20 font-semibold text-white'
                  : 'text-white/70 hover:bg-white/10 font-medium'
                : active
                  ? 'bg-teal-50 text-teal-600 font-semibold dark:bg-teal-500/15 dark:text-teal-400'
                  : 'text-muted-foreground hover:bg-muted font-medium',
            )}
          >
            <Icon className="size-4" />
            {t(item.key)}
            {newKeys.includes(item.key) && (
              <span className="ml-auto size-2 shrink-0 rounded-full bg-green-500 animate-pulse" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
