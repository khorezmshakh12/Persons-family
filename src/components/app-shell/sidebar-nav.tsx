'use client';

import { useTranslations } from 'next-intl';
import { LayoutDashboard, Users, MessageSquare, AlertCircle, BookOpen, ListTodo } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { navItemsForRole, type NavItem, type StaffRole } from '@/lib/nav';

const ICONS: Record<NavItem['key'], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  staff: Users,
  chat: MessageSquare,
  issues: AlertCircle,
  lessonPlans: BookOpen,
  tasks: ListTodo,
};

export function SidebarNav({ role, onNavigate }: { role: StaffRole; onNavigate?: () => void }) {
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
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all hover:scale-[1.02] active:scale-[0.98]',
              active
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted font-medium',
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
