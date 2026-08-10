import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { computeKpiScore } from '@/lib/kpi';
import { ManageMetricDialog } from './manage-metric-dialog';
import { MetricRow } from './metric-row';
import { KpiScoreChart } from './kpi-score-chart';

export async function KpiSection({ staffId, canManage }: { staffId: string; canManage: boolean }) {
  const t = await getTranslations('kpi');
  const supabase = await createClient();
  const month = firstOfCurrentMonth();

  const { data: metrics } = await supabase
    .from('kpi_metrics')
    .select('id, name, weight_percentage')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: true });

  const metricIds = (metrics ?? []).map((m) => m.id);
  const { data: entries } =
    metricIds.length > 0
      ? await supabase
          .from('kpi_entries')
          .select('metric_id, month, target_value, actual_value')
          .in('metric_id', metricIds)
          .order('month', { ascending: true })
      : { data: [] };

  const currentMonthEntries = (entries ?? []).filter((e) => e.month === month);
  const entryByMetricThisMonth = new Map(currentMonthEntries.map((e) => [e.metric_id, e]));
  const overallScore = computeKpiScore(metrics ?? [], currentMonthEntries);

  const monthsPresent = Array.from(new Set((entries ?? []).map((e) => e.month))).sort();
  const scoreHistory = monthsPresent
    .map((m) => ({
      month: m,
      score: computeKpiScore(
        metrics ?? [],
        (entries ?? []).filter((e) => e.month === m),
      ),
    }))
    .filter((p): p is { month: string; score: number } => p.score !== null);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {t('title')}
          </h2>
          <p className="text-sm text-white/60">{t('subtitle')}</p>
        </div>
        {canManage && <ManageMetricDialog staffId={staffId} />}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-white/60">
          {t('overallScore')} · {t('currentMonth')}
        </span>
        <span className="text-3xl font-bold tabular-nums text-white">
          {overallScore != null ? Math.round(overallScore) : '—'}
        </span>
      </div>

      {(metrics ?? []).length === 0 ? (
        <p className="text-sm text-white/60">{canManage ? t('noMetrics') : t('noMetricsSelf')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(metrics ?? []).map((metric) => (
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

      <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-medium text-white/80">{t('scoreHistory')}</h3>
        <KpiScoreChart points={scoreHistory} />
      </div>
    </div>
  );
}
