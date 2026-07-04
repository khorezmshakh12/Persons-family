'use client';

import { useTranslations } from 'next-intl';
import { LayoutDashboard, Users, Clock, MessageSquare, AlertCircle, BookOpen } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { navItemsForRole, type NavItem, type StaffRole } from '@/lib/nav';

const ICONS: Record<NavItem['key'], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  staff: Users,
  attendance: Clock,
  chat: MessageSquare,
  issues: AlertCircle,
  lessonPlans: BookOpen,
};

export function SidebarNav({ role, onNavigate }: { role: StaffRole; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="size-4" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
