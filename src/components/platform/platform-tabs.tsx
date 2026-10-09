import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function PlatformTabs({ tab, labels }: { tab: string; labels: Record<string, string> }) {
  return (
    <nav className="flex max-w-full gap-1 self-start overflow-x-auto rounded-au-ctl bg-au-card p-1 shadow-[var(--au-shadow-card)]" aria-label="Platform">
      {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
        <Link
          key={k}
          href={`/platform?tab=${k}`}
          aria-current={tab === k ? 'page' : undefined}
          className={cn('shrink-0 rounded-au-ctl px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors', tab === k ? 'bg-au-accent-soft text-au-accent-text' : 'text-au-muted hover:text-au-ink')}
        >
          {labels[k]}
        </Link>
      ))}
    </nav>
  );
}
