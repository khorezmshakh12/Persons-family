'use client';

import { StarIcon } from '@/components/ui/star-icon';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { ChevronRight, ScanSearch } from 'lucide-react';
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

const subscribeNoop = () => () => {};
/** ⌘K on Apple devices, Ctrl K everywhere else (server render: Ctrl K). */
function useShortcutLabel() {
  return useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'),
    () => 'Ctrl K',
  );
}

/** Looks like a search field, opens the existing command palette. The icon
 * sits on its own soft accent tile (owner, 2026-10-05: the bare magnifier
 * looked off). */
export function SearchTrigger() {
  const t = useTranslations('shell');
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
      aria-label={t('search')}
      className="group flex h-[38px] items-center gap-2.5 rounded-au-ctl border border-au-line bg-gradient-to-r from-au-accent-soft/60 to-au-card pr-2 pl-1 text-[13px] text-au-muted shadow-[inset_0_1px_0_rgba(255,255,255,.5)] transition-all hover:border-au-accent/40 hover:shadow-au-card max-md:w-[38px] max-md:justify-center max-md:px-0 md:w-[300px] max-[1180px]:md:w-[220px]"
    >
      <span className="grid size-[28px] shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-au-accent to-au-accent-text text-white shadow-sm transition-transform group-hover:scale-105 max-md:size-[30px]">
        <ScanSearch className="size-[15px]" strokeWidth={2.1} />
      </span>
      <span className="hidden truncate md:inline">{t('search')}</span>
      <kbd className="ml-auto hidden rounded-[5px] border border-au-line bg-au-card px-1.5 py-px text-[11px] font-semibold whitespace-nowrap text-au-muted md:inline">
        {shortcut}
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
      <StarIcon className="size-[15px]" />
      {balance}
    </Link>
  );
}
