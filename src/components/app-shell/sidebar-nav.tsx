'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
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
  User,
  Wallet,
  Target,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { navItemsForRole, type NavItem, type StaffRole } from '@/lib/nav';
import { useNavBadgeKeys } from './nav-badges-context';

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
  finance: Wallet,
  missions: Target,
  profile: User,
  settings: Settings,
};

export function SidebarNav({
  role,
  onNavigate,
  glass = false,
}: {
  role: StaffRole;
  onNavigate?: () => void;
  /** True inside the glassmorphism desktop sidebar (over a dynamic photo
   * background); false inside the mobile Sheet, which keeps a normal
   * opaque surface and needs the usual theme-aware text colors instead. */
  glass?: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const items = navItemsForRole(role);
  // Live-updating "new" dot state — see NavBadgesProvider for why this
  // can't just be the static prop the layout computed at request time.
  const newKeys = useNavBadgeKeys();
  // Desktop sidebar and the mobile Sheet's copy of this nav are both
  // mounted at once (the Sheet just starts visually hidden) — scoping the
  // layoutId per surface keeps framer-motion from trying to animate the
  // pill between two simultaneously-mounted instances.
  const pillId = glass ? 'sidebar-active-pill-glass' : 'sidebar-active-pill-mobile';

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
              'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-transform duration-200 ease-bounce hover:scale-[1.02] active:scale-95',
              glass
                ? active
                  ? 'font-semibold text-white'
                  : 'font-medium text-white/70 hover:bg-white/10'
                : active
                  ? 'font-semibold text-teal-600 dark:text-teal-400'
                  : 'text-muted-foreground hover:bg-muted font-medium',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className={cn(
                  'absolute inset-0 rounded-md',
                  glass
                    ? 'border border-teal-300/30 bg-teal-400/20'
                    : 'bg-teal-50 dark:bg-teal-500/15',
                )}
              />
            )}
            <Icon className="relative z-10 size-4" />
            <span className="relative z-10">{t(item.key)}</span>
            {newKeys.includes(item.key) && (
              <span
                className="relative z-10 ml-auto size-2 shrink-0 animate-pulse rounded-full bg-green-500"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
