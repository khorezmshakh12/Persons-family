import { Target } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { BTN_PRIMARY, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

/** My KPI nudge on the dashboard: the employee's plan is due, or (CEO)
 * plans are waiting for approval. */
export function KpiReminder({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <section className={cn(SURFACE_CARD, 'au-highlight flex flex-col gap-3 border-l-4 border-l-au-accent p-5 sm:flex-row sm:items-center')}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
        <Target className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-au-ink">{title}</h2>
        <p className="text-sm text-au-muted">{body}</p>
      </div>
      <Link href="/my-kpi" className={cn(BTN_PRIMARY, 'shrink-0')}>
        {cta}
      </Link>
    </section>
  );
}
