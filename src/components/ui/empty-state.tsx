import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One shape for "nothing here yet": an icon, what this space is for, and
 * the next step — instead of a lone grey line. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-au-ctl border border-dashed border-au-line text-center',
        compact ? 'px-3 py-5' : 'px-6 py-10',
        className,
      )}
    >
      {Icon && (
        <span className="grid size-10 place-items-center rounded-full bg-au-card-2 text-au-muted">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <p className="text-sm font-semibold text-au-ink">{title}</p>
      {hint && <p className="max-w-sm text-xs text-au-muted">{hint}</p>}
      {action}
    </div>
  );
}
