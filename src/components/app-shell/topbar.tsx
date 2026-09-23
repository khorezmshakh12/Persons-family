'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight, Search, Star } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { navItemForPath } from '@/lib/nav';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/command-palette/command-palette';

/** "Persons › <current section>" — derived from the nav config, so it
 * never needs a per-page prop. */
export function Breadcrumbs() {
  const t = useTranslations('nav');
  const tShell = useTranslations('shell');
  const pathname = usePathname();
  const item = navItemForPath(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-au-muted">
      <Link href="/dashboard" className="hidden transition-colors hover:text-au-ink sm:inline">
        {tShell('root')}
      </Link>
      {item && (
        <>
          <ChevronRight className="hidden size-3.5 shrink-0 text-au-faint sm:block" aria-hidden />
          <span className="truncate font-semibold text-au-ink">{t(item.key)}</span>
        </>
      )}
    </nav>
  );
}

/** Looks like a search field, opens the existing ⌘K command palette. */
export function SearchTrigger() {
  const t = useTranslations('shell');
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
      aria-label={t('search')}
      className="flex h-[38px] items-center gap-2 rounded-au-ctl border border-au-line bg-au-card px-3 text-[13px] text-au-muted transition-colors hover:border-au-faint max-md:w-[38px] max-md:justify-center max-md:px-0 md:w-[300px] max-[1180px]:md:w-[220px]"
    >
      <Search className="size-[17px] shrink-0" strokeWidth={1.75} />
      <span className="hidden truncate md:inline">{t('search')}</span>
      <kbd className="ml-auto hidden rounded-[5px] border border-au-line bg-au-card-2 px-1.5 py-px text-[11px] font-semibold text-au-muted md:inline">
        ⌘K
      </kbd>
    </button>
  );
}

export function StarPill({ balance }: { balance: number }) {
  const t = useTranslations('shell');
  return (
    <Link
      href="/market"
      title={t('starBalance')}
      aria-label={`${t('starBalance')}: ${balance}`}
      className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-au-ctl border border-au-accent/30 bg-au-accent-soft px-3 font-bold text-au-accent-text tabular-nums transition-colors hover:border-au-accent/60"
    >
      <Star className="size-[15px] fill-current" strokeWidth={1.75} aria-hidden />
      {balance}
    </Link>
  );
}
