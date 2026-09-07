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
      <div className={cn(GLASS_CARD, 'p-6 text-sm text-white/60')}>{t('noData')}</div>
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

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6')}>
      <div>
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-white/70">{t('subtitle')}</p>
      </div>

      {/* Top strip: stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-3"
          >
            <span className="text-2xl font-bold tracking-tight text-white">{tile.value}</span>
            <span className="text-xs text-white/60">{t(`tiles.${tile.key}`)}</span>
          </div>
        ))}
      </div>

      {/* 6-month section */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-white">{t('byMonth')}</h3>
        {byMonth.length === 0 ? (
          <p className="text-sm text-white/60">{t('noData')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {byMonth.map((month) => (
              <li key={month.monthKey} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 capitalize text-white/80">{month.label}</span>
                <span className="w-28 shrink-0 text-white/60">
                  {t('monthCounts', { created: month.created, resolved: month.resolved })}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-400/80"
                    style={{ width: `${month.resolutionRate}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-white/70">
                  {month.resolutionRate}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* By reporter role */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-white">{t('byRole')}</h3>
        {byReporterRole.length === 0 ? (
          <p className="text-sm text-white/60">{t('noData')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {byReporterRole.map((row) => (
              <li
                key={row.role}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs"
              >
                <span className="font-medium text-white/90">{roleLabel(tStaff, row.role)}</span>
                <span className="flex items-center gap-2 text-white/60">
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
  );
}
