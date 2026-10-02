'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
// Aliased: the component below is itself called TaskStats, so importing the
// payload type under its own name would collide.
import type { TaskStats as TaskStatsData } from '@/lib/actions/task-stats';

/**
 * Pure renderer for the per-employee task statistics panel — the page fetches
 * the numbers (getTaskStatsAction) and hands them over already localised
 * (month labels) and pre-computed (rates), so nothing here re-derives a date
 * or a percentage. Mirrors IssuesStats (components/issues/issues-stats.tsx).
 *
 * `stats` is null whenever the action returned an error (or the caller has no
 * data yet); that renders the muted placeholder card rather than throwing —
 * the stats panel must never be able to take the task board down with it.
 */
export function TaskStats({ stats }: { stats: TaskStatsData | null }) {
  const t = useTranslations('tasks.stats');

  if (!stats) {
    return <div className={cn(GLASS_CARD, 'p-6 text-sm text-au-muted')}>{t('noData')}</div>;
  }

  const { overall, byMonth } = stats;

  const tiles = [
    { key: 'total', value: String(overall.total) },
    { key: 'done', value: String(overall.done) },
    { key: 'completionRate', value: `${overall.completionRate}%` },
    {
      key: 'avgCompletion',
      value: overall.avgCompletionDays == null ? '—' : t('days', { count: overall.avgCompletionDays }),
    },
  ];

  // Months with nothing due are noise ("0 due · 0 on time · 0 late").
  const months = byMonth.filter((m) => m.due > 0 || m.doneOnTime > 0 || m.doneLate > 0);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-5')}>
      <div>
        <h2 className="text-base font-semibold text-au-ink">{t('title')}</h2>
        <p className="mt-0.5 text-sm text-au-muted">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex flex-col gap-0.5 rounded-xl bg-au-card-2 px-3 py-2.5">
            <span className="text-xl font-bold tracking-tight text-au-ink tabular-nums">{tile.value}</span>
            <span className="text-xs text-au-muted">{t(`tiles.${tile.key}`)}</span>
          </div>
        ))}
      </div>

      {/* The detail stays one click away instead of pushing the page down. */}
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-au-muted select-none hover:text-au-ink [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-open:rotate-90">›</span> {t('byMonth')}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {/* Three independent counts over every task ever assigned, NOT a
              partition of `total`: "overdue" is only the tasks past their
              deadline, so a task still open and not yet due is in none. */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="tint" tint="green" className="tabular-nums">
              {t('onTime', { count: overall.onTime })}
            </Badge>
            <Badge variant="tint" tint="amber" className="tabular-nums">
              {t('late', { count: overall.late })}
            </Badge>
            <Badge variant="tint" tint="red" className="tabular-nums">
              {t('notDone', { count: overall.notDone })}
            </Badge>
          </div>
          {months.length === 0 ? (
            <p className="text-sm text-au-muted">{t('noData')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {months.map((month) => (
                <li
                  key={month.monthKey}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:flex-nowrap"
                >
                  <span className="w-20 shrink-0 capitalize text-au-ink">{month.label}</span>
                  <span className="w-40 shrink-0 text-au-muted">
                    {t('monthCounts', {
                      due: month.due,
                      onTime: month.doneOnTime,
                      late: month.doneLate,
                    })}
                  </span>
                  <div className="relative h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-au-card-2">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-400/80"
                      style={{ width: `${month.onTimeRate}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums text-au-muted">
                    {month.onTimeRate}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
