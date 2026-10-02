import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Profile section tabs — plain links (?tab=…), so each tab is a real,
 * shareable URL and only the open tab's cards are rendered server-side. */
export function ProfileTabs({
  current,
  tabs,
  hrefBase,
  labels,
}: {
  current: string;
  tabs: readonly string[];
  hrefBase: string;
  labels: Record<string, string>;
}) {
  return (
    <nav aria-label="Profile" className="-mx-1 flex gap-1 overflow-x-auto border-b border-au-line px-1">
      {tabs.map((k) => {
        const on = k === current;
        return (
          <Link
            key={k}
            href={k === 'overview' ? hrefBase : `${hrefBase}?tab=${k}`}
            aria-current={on ? 'page' : undefined}
            scroll={false}
            className={cn(
              'nav-motion -mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              on ? 'border-au-accent font-semibold text-au-ink' : 'border-transparent font-medium text-au-muted hover:text-au-ink',
            )}
          >
            {labels[k]}
          </Link>
        );
      })}
    </nav>
  );
}
