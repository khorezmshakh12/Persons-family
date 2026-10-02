import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// One frame for every inner page, so sections stop drifting apart in width
// and header style. Two widths only: 'default' for boards/lists/admin views,
// 'narrow' for a single person's form or settings. The gradient hero is kept
// for the dashboard alone — inner pages get a compact title row so the work
// itself starts on the first screen.

export function Page({
  width = 'default',
  className,
  children,
}: {
  width?: 'default' | 'narrow';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-5 px-4 pt-2 pb-8 sm:px-7',
        width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Optional avatar/icon left of the title (e.g. a person's finance page). */
  leading?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-bold tracking-tight text-au-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-au-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
