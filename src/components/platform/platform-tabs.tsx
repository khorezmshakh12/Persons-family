import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function PlatformTabs({ tab, labels }: { tab: string; labels: Record<'roles' | 'access' | 'targets', string> }) {
  return (
    <nav className="flex gap-1 self-start rounded-au-ctl bg-au-card p-1 shadow-[var(--au-shadow-card)]" aria-label="Platform">
      {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
        <Link
          key={k}
          href={`/platform?tab=${k}`}
          aria-current={tab === k ? 'page' : undefined}
          className={cn('rounded-au-ctl px-4 py-1.5 text-sm font-semibold transition-colors', tab === k ? 'bg-au-accent-soft text-au-accent-text' : 'text-au-muted hover:text-au-ink')}
        >
          {labels[k]}
        </Link>
      ))}
    </nav>
  );
}
