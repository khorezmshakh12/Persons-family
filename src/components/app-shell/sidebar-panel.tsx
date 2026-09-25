'use client';

import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { cn } from '@/lib/utils';
import type { StaffRole } from '@/lib/nav';
import { PersonsLogo } from '@/components/brand/persons-logo';
import { SidebarNav } from './sidebar-nav';
import { UserBadge } from './user-badge';

export type SidebarGoal = { title: string; progress: number };

/** Brand mark: the two-tone teal Persons "P" on a light tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'brand-mark grid size-[34px] shrink-0 place-items-center rounded-au-ctl border border-au-line bg-au-card shadow-au-card',
        className,
      )}
      aria-hidden
    >
      <PersonsLogo className="size-[26px]" />
    </span>
  );
}

/**
 * Everything inside the Aurora sidebar — rendered by the fixed desktop
 * <aside> and again inside the mobile drawer, so both stay identical.
 */
export function SidebarPanel({
  role,
  roleLabel,
  materialsLinked,
  coreViews,
  starBalance,
  goal,
  userId,
  version,
  onNavigate,
}: {
  role: StaffRole;
  roleLabel: string;
  materialsLinked: boolean;
  coreViews: string[];
  starBalance: number;
  goal: SidebarGoal | null;
  userId: string;
  version: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations('shell');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-[11px] px-1.5 pb-5">
        <BrandMark />
        <span className="flex min-w-0 flex-col">
          <span className="text-base leading-[18px] font-bold text-au-ink">Persons</span>
          <span className="text-xs text-au-muted">{t('subtitle')}</span>
        </span>
      </Link>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        <SidebarNav
          role={role}
          materialsLinked={materialsLinked}
          coreViews={coreViews}
          starBalance={starBalance}
          onNavigate={onNavigate}
        />
      </div>

      {goal && (
        <Link
          href="/roadmap"
          onClick={onNavigate}
          className="relative overflow-hidden rounded-[14px] border border-au-line bg-au-card p-3.5 transition-shadow duration-150 hover:shadow-au-card"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-8 -right-8 size-[110px] rounded-full bg-[radial-gradient(circle,var(--au-accent-soft),transparent_70%)]"
          />
          <span className="relative block text-[11px] font-semibold tracking-[0.06em] text-au-muted uppercase">
            {t('goalLabel')}
          </span>
          <span className="relative mt-0.5 block truncate text-[13px] font-bold text-au-ink">{goal.title}</span>
          <span className="relative mt-1 mb-2.5 block text-xs text-au-muted">
            {t('goalProgress', { progress: goal.progress })}
          </span>
          <span className="relative block h-1.5 overflow-hidden rounded-full bg-au-card-2">
            <span
              className="block h-full rounded-full bg-au-accent"
              style={{ width: `${Math.min(100, Math.max(0, goal.progress))}%` }}
            />
          </span>
        </Link>
      )}

      <div className="flex items-center gap-2 px-1.5 pt-3.5">
        <Link href="/profile" onClick={onNavigate} className="min-w-0 flex-1">
          <UserBadge userId={userId} nameClassName="font-semibold text-au-ink text-[13px]" subtitle={roleLabel} />
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label={t('logout')}
            title={t('logout')}
            className="grid size-8 place-items-center rounded-au-ctl text-au-muted transition-colors hover:bg-au-card hover:text-au-bad"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </form>
      </div>
      <span className="pt-3 text-center text-[11px] tracking-wider text-au-muted">Persons ERP {version}</span>
    </div>
  );
}
