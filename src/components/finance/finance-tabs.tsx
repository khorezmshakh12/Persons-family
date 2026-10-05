'use client';

import { BookOpenCheck, Wallet } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Finance and Hisob-kitob are one section (owner, 2026-10-05): payroll on
 * /finance, the books on /accounting — switched here instead of two
 * sidebar entries. Rendered only for people who can open both. */
export function FinanceTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: '/finance', n: 'Ish haqi', Icon: Wallet },
    { href: '/accounting', n: 'Hisob-kitob', Icon: BookOpenCheck },
  ] as const;
  return (
    <nav aria-label="Moliya bo‘limlari" className={cn('inline-flex gap-1 rounded-au-ctl border border-au-line bg-au-card-2 p-1', className)}>
      {tabs.map(({ href, n, Icon }) => {
        const on = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-colors',
              on ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink',
            )}
          >
            <Icon className="size-4" />
            {n}
          </Link>
        );
      })}
    </nav>
  );
}
