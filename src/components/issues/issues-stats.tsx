'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD } from '@/lib/glass';
import { roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { IssueStats } from '@/lib/actions/issue-stats';

/**
 * Pure renderer for the Issues statistics panel — the page fetches the
 * numbers (getIssueStatsAction) and hands them over already localised
 * (month labels) and pre-computed (rates), so nothing here re-derives a
 * date or a percentage.
 */
export function IssuesStats({ stats }: { stats: IssueStats | null }) {
  const t = useTranslations('issues.stats');
  const tStaff = useTranslations('staff');

  if (!stats) {
    return (
      <div className={cn(GLASS_CARD, 'p-6 text-sm text-au-muted')}>{t('noData')}</div>
    );
  }

  const { overall, byMonth, byReporterRole } = stats;

  const tiles = [
    { key: 'total', value: String(overall.total) },
    { key: 'resolved', value: String(overall.resolved) },
    { key: 'resolutionRate', value: `${overall.resolutionRate}%` },
    {
      key: 'avgResolution',
      value: overall.avgResolutionDays == null ? '—' : t('days', { count: overall.avgResolutionDays }),
    },
  ];

  // Months with nothing raised or resolved are noise.
  const months = byMonth.filter((m) => m.created > 0 || m.resolved > 0);

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

      {/* The breakdowns stay one click away instead of pushing the page down. */}
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-au-muted select-none hover:text-au-ink [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-open:rotate-90">›</span> {t('byMonth')} · {t('byRole')}
        </summary>
        <div className="mt-3 flex flex-col gap-5">
      {/* 6-month section */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-au-ink">{t('byMonth')}</h3>
        {months.length === 0 ? (
          <p className="text-sm text-au-muted">{t('noData')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {months.map((month) => (
              <li key={month.monthKey} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 capitalize text-au-ink">{month.label}</span>
                <span className="w-28 shrink-0 text-au-muted">
                  {t('monthCounts', { created: month.created, resolved: month.resolved })}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-au-card-2">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-400/80"
                    style={{ width: `${month.resolutionRate}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-au-muted">
                  {month.resolutionRate}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* By reporter role */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-au-ink">{t('byRole')}</h3>
        {byReporterRole.length === 0 ? (
          <p className="text-sm text-au-muted">{t('noData')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {byReporterRole.map((row) => (
              <li
                key={row.role}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-au-card-2 px-3 py-2 text-xs"
              >
                <span className="font-medium text-au-ink">{roleLabel(tStaff, row.role)}</span>
                <span className="flex items-center gap-2 text-au-muted">
                  <span>{t('roleCounts', { raised: row.raised, resolved: row.resolved })}</span>
                  <Badge
                    variant="tint"
                    tint={
                      row.resolutionRate >= 67 ? 'green' : row.resolutionRate >= 34 ? 'amber' : 'blue'
                    }
                    className="shrink-0 tabular-nums"
                  >
                    {row.resolutionRate}%
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
        </div>
      </details>
    </div>
  );
}
