import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { computeKpiScore } from '@/lib/kpi';
import { ManageMetricDialog } from './manage-metric-dialog';
import { MetricRow } from './metric-row';
import { KpiScoreChart } from './kpi-score-chart';

export async function KpiSection({ staffId, canManage }: { staffId: string; canManage: boolean }) {
  const t = await getTranslations('kpi');
  const month = firstOfCurrentMonth();

  const metrics = await sql<{ id: string; name: string; weight_percentage: number }[]>`
    select id, name, weight_percentage from kpi_metrics
    where staff_id = ${staffId} order by created_at asc
  `;

  const metricIds = metrics.map((m) => m.id);
  const entries =
    metricIds.length > 0
      ? await sql<{ metric_id: string; month: string; target_value: number; actual_value: number | null }[]>`
          select metric_id, month, target_value, actual_value from kpi_entries
          where metric_id in ${sql(metricIds)} order by month asc
        `
      : [];

  const currentMonthEntries = entries.filter((e) => e.month === month);
  const entryByMetricThisMonth = new Map(currentMonthEntries.map((e) => [e.metric_id, e]));
  const overallScore = computeKpiScore(metrics, currentMonthEntries);

  const monthsPresent = Array.from(new Set(entries.map((e) => e.month))).sort();
  const scoreHistory = monthsPresent
    .map((m) => ({
      month: m,
      score: computeKpiScore(
        metrics,
        entries.filter((e) => e.month === m),
      ),
    }))
    .filter((p): p is { month: string; score: number } => p.score !== null);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-au-ink">
            {t('title')}
          </h2>
          <p className="text-sm text-au-muted">{t('subtitle')}</p>
        </div>
        {canManage && <ManageMetricDialog staffId={staffId} />}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-au-muted">
          {t('overallScore')} · {t('currentMonth')}
        </span>
        <span className="text-3xl font-bold tabular-nums text-au-ink">
          {overallScore != null ? Math.round(overallScore) : '—'}
        </span>
      </div>

      {metrics.length === 0 ? (
        <p className="text-sm text-au-muted">{canManage ? t('noMetrics') : t('noMetricsSelf')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {metrics.map((metric) => (
            <MetricRow
              key={metric.id}
              staffId={staffId}
              month={month}
              metric={metric}
              entry={entryByMetricThisMonth.get(metric.id) ?? null}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-au-line pt-4">
        <h3 className="text-sm font-medium text-au-ink">{t('scoreHistory')}</h3>
        <KpiScoreChart points={scoreHistory} />
      </div>
    </div>
  );
}
