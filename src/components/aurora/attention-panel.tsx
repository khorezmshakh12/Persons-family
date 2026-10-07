import type { ComponentType } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  GraduationCap,
  Hourglass,
  ListChecks,
  Sparkles,
  Target,
  Undo2,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_TITLE, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { AttentionItem } from '@/lib/aurora-dashboard';

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

const ICONS: Record<string, Icon> = {
  taskReview: ListChecks,
  kpiReview: Target,
  overdue: AlarmClock,
  staleIssues: Hourglass,
  selfDevRate: GraduationCap,
  selfDevMissing: GraduationCap,
  kpiMissing: Target,
  myOverdue: AlarmClock,
  kpiReturned: Undo2,
  kpiThis: Target,
  kpiNext: CalendarClock,
  selfDev: GraduationCap,
  myDueToday: ClipboardCheck,
  myIssues: CircleAlert,
};

const TONE = {
  bad: { dot: 'bg-au-bad', icon: 'bg-au-bad-soft text-au-bad', count: 'text-au-bad' },
  warn: { dot: 'bg-au-accent', icon: 'bg-au-accent-soft text-au-accent-text', count: 'text-au-accent-text' },
  info: { dot: 'bg-au-info', icon: 'bg-au-info-soft text-au-info', count: 'text-au-info' },
} as const;

/**
 * "Needs attention" — the dashboard's action list. Every line is a queue
 * with a count and a one-click way into it; an empty list is good news.
 * Replaces the separate KPI / self-development reminder banners.
 */
export async function AttentionPanel({ items, className }: { items: AttentionItem[] | null; className?: string }) {
  const t = await getTranslations('aurora.attention');
  const urgent = items?.filter((i) => i.tone === 'bad').length ?? 0;

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)} aria-labelledby="attention-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="attention-title" className={cn(CARD_TITLE, 'flex items-center gap-2')}>
          <span className="relative flex size-2.5" aria-hidden>
            {urgent > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-au-bad opacity-60" />}
            <span className={cn('relative inline-flex size-2.5 rounded-full', urgent > 0 ? 'bg-au-bad' : 'bg-au-ok')} />
          </span>
          {t('title')}
        </h2>
        {items && items.length > 0 && <span className="text-xs font-semibold text-au-muted tabular-nums">{t('count', { count: items.length })}</span>}
      </div>

      {items === null ? (
        <p className="py-6 text-center text-sm text-au-muted">{t('error')}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-au-ok-soft text-au-ok">
            <Sparkles className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="font-bold text-au-ink">{t('allClear')}</p>
          <p className="text-sm text-au-muted">{t('allClearHint')}</p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((item, i) => {
            const Icon = ICONS[item.key] ?? CircleAlert;
            const tone = TONE[item.tone];
            return (
              <li key={item.key} className="enter-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 rounded-au-ctl px-2 py-2.5 transition-colors hover:bg-au-card-2 focus-visible:bg-au-card-2 focus-visible:outline-none"
                >
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', tone.icon)}>
                    <Icon className="size-[17px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-au-ink">{t(`items.${item.key}.title`, { count: item.count })}</span>
                    <span className="block truncate text-xs text-au-muted">{t(`items.${item.key}.hint`, { count: item.count })}</span>
                  </span>
                  {item.count > 1 && (
                    <span className={cn('shrink-0 text-lg font-bold tabular-nums', tone.count)}>{item.count}</span>
                  )}
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-au-muted transition-colors group-hover:text-au-ink sm:inline-flex">
                    {t(`items.${item.key}.cta`)}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
