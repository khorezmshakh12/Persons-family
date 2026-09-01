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
  Send,
  TrendingUp,
  User,
  Wallet,
  Target,
  Milestone,
  BookOpen,
  ShoppingBag,
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
  telegramSetup: Send,
  selfDevelopment: TrendingUp,
  finance: Wallet,
  missions: Target,
  roadmap: Milestone,
  market: ShoppingBag,
  profile: User,
  settings: Settings,
  materials: BookOpen,
};

export function SidebarNav({
  role,
  materialsLinked = false,
  onNavigate,
  glass = false,
}: {
  role: StaffRole;
  /** Whether this employee's phone number matches an active Materials
   * account — hides the "Materials" item entirely when it doesn't. */
  materialsLinked?: boolean;
  onNavigate?: () => void;
  /** True inside the glassmorphism desktop sidebar (over a dynamic photo
   * background); false inside the mobile Sheet, which keeps a normal
   * opaque surface and needs the usual theme-aware text colors instead. */
  glass?: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const items = navItemsForRole(role, { materialsLinked });
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
        const active = !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`));

        const itemClassName = cn(
          'relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 ease-bounce hover:scale-[1.02] active:scale-95',
          glass
            ? active
              ? 'font-semibold text-white'
              : 'font-medium text-white/70 hover:bg-white/10 hover:text-white'
            : active
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground hover:bg-muted font-medium',
        );

        const content = (
          <>
            {active && (
              <motion.span
                layoutId={pillId}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className={cn(
                  'absolute inset-0 rounded-xl',
                  glass
                    ? 'border border-teal-400/35 bg-teal-500/20 shadow-[0_0_20px_rgba(45,212,191,0.25)]'
                    : 'bg-muted',
                )}
              />
            )}
            <Icon className={cn('relative z-10 size-4 transition-colors', active && 'text-teal-300')} />
            <span className="relative z-10">{t(item.key)}</span>
            {newKeys.includes(item.key) && (
              <span
                className="relative z-10 ml-auto size-2 shrink-0 animate-pulse rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf]"
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
            // Every dynamic route below has its own loading.tsx, so a full
            // prefetch (not just the default up-to-loading-boundary prefetch)
            // warms the actual page content in the background on hover/
            // viewport-visibility — clicking a sidebar item then just swaps
            // in an already-fetched response instead of starting cold.
            prefetch
            className={itemClassName}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
