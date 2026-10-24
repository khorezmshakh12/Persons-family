'use client';

import { BookOpenCheck, Target, Wallet } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Finance is one section with three views (owner design, 2026-10-21):
 * payroll on /finance, the books on /accounting, and the viewer's own pay +
 * B-nuqta on /finance/<own id>. Only the views the viewer may open show. */
export function FinanceTabs({
  meId,
  payroll,
  accounting,
  className,
}: {
  meId: string;
  payroll: boolean;
  accounting: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const mine = `/finance/${meId}`;
  const tabs = [
    payroll && {
      href: '/finance',
      n: 'Ish haqi va Avanslar',
      Icon: Wallet,
      on: pathname === '/finance' || (pathname.startsWith('/finance/') && pathname !== mine),
    },
    accounting && { href: '/accounting', n: 'Hisob-kitob', Icon: BookOpenCheck, on: pathname.startsWith('/accounting') },
    {
      href: payroll ? mine : '/finance',
      n: 'Mening moliyam & B-nuqta',
      Icon: Target,
      on: pathname === mine || (!payroll && pathname === '/finance'),
    },
  ].filter((t) => !!t);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Moliya bo‘limlari" className={cn('flex flex-wrap items-center gap-1.5 border-b border-au-line pb-2.5', className)}>
      {tabs.map(({ href, n, Icon, on }) => (
        <Link
          key={href}
          href={href}
          aria-current={on ? 'page' : undefined}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-au-ctl px-3 text-xs font-semibold transition',
            on ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink',
          )}
        >
          <Icon className="size-3.5" />
          {n}
        </Link>
      ))}
    </nav>
  );
}
