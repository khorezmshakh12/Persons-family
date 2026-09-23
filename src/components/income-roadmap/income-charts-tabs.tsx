'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import type { IncomeRoadmapMonth, IncomeRoadmapMilestone } from './data';
import { formatUZS } from '@/lib/format-currency';
import { useChartAnimation } from '@/lib/use-enter-progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const MILESTONE_COLORS: Record<string, string> = {
  planned: '#94a3b8',
  in_progress: '#38bdf8',
  achieved: 'var(--au-ok)',
  missed: '#f87171',
};

type TooltipPayloadItem = {
  payload?: {
    monthLabel: string;
    planned: number;
    actual: number | null;
    variance: number | null;
    variancePct: number | null;
    growthPct: number | null;
    cumulativePlanned: number;
    cumulativeActual: number | null;
  };
};

function CustomMonthlyTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  t: (key: string) => string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="flex min-w-[180px] flex-col gap-1 rounded-lg border border-au-line bg-au-card px-3 py-2 text-xs text-au-ink shadow-au-card">
      <span className="border-b border-au-line pb-1 font-semibold text-au-ink">
        {data.monthLabel}
      </span>
      <div className="flex items-center justify-between gap-3 text-au-muted">
        <span>{t('planned')}:</span>
        <span className="font-medium text-au-ink tabular-nums">{formatUZS(data.planned)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-au-muted">
        <span>{t('actual')}:</span>
        <span className="font-medium text-emerald-700 tabular-nums">
          {data.actual !== null ? formatUZS(data.actual) : '—'}
        </span>
      </div>
      {data.variance !== null && (
        <div className="flex items-center justify-between gap-3 text-au-muted">
          <span>{t('variance')}:</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              data.variance >= 0 ? 'text-emerald-700' : 'text-red-700',
            )}
          >
            {data.variance >= 0 ? '+' : ''}
            {formatUZS(data.variance)}
          </span>
        </div>
      )}
      {data.growthPct !== null && (
        <div className="flex items-center justify-between gap-3 text-au-muted">
          <span>{t('growth')}:</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              data.growthPct >= 0 ? 'text-emerald-700' : 'text-red-700',
            )}
          >
            {data.growthPct >= 0 ? '+' : ''}
            {data.growthPct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function CustomCumulativeTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  t: (key: string) => string;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="flex min-w-[180px] flex-col gap-1 rounded-lg border border-au-line bg-au-card px-3 py-2 text-xs text-au-ink shadow-au-card">
      <span className="border-b border-au-line pb-1 font-semibold text-au-ink">
        {data.monthLabel}
      </span>
      <div className="flex items-center justify-between gap-3 text-au-muted">
        <span>{t('cumulativePlanned')}:</span>
        <span className="font-medium text-au-ink tabular-nums">
          {formatUZS(data.cumulativePlanned)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-au-muted">
        <span>{t('cumulativeActual')}:</span>
        <span className="font-medium text-emerald-700 tabular-nums">
          {data.cumulativeActual !== null ? formatUZS(data.cumulativeActual) : '—'}
        </span>
      </div>
    </div>
  );
}

export function IncomeChartsTabs({
  months,
  targetYearEndIncome,
  milestones,
}: {
  months: IncomeRoadmapMonth[];
  targetYearEndIncome: number;
  milestones: IncomeRoadmapMilestone[];
}) {
  const t = useTranslations('incomeRoadmap');
  const format = useFormatter();
  const [tab, setTab] = useState<'monthly' | 'cumulative'>('monthly');
  const anim = useChartAnimation();

  const chartData = useMemo(() => {
    return months.map((m) => {
      const date = new Date(`${m.monthKey}-01T00:00:00Z`);
      const monthLabel = format.dateTime(date, { month: 'short' });
      return {
        ...m,
        monthLabel,
        // Cumulative actual stops plotting when actual is null
        cumulativeActual: m.actual !== null ? m.cumulativeActual : null,
      };
    });
  }, [months, format]);

  const currentMonthEntry = useMemo(() => {
    return chartData.find((m) => m.isCurrent);
  }, [chartData]);

  // Y-axis domain calculation
  const maxMonthlyVal = useMemo(() => {
    let max = targetYearEndIncome;
    for (const m of months) {
      if (m.planned > max) max = m.planned;
      if (m.actual !== null && m.actual > max) max = m.actual;
    }
    return max * 1.1;
  }, [months, targetYearEndIncome]);

  const maxCumulativeVal = useMemo(() => {
    let max = 0;
    for (const m of months) {
      if (m.cumulativePlanned > max) max = m.cumulativePlanned;
      if (m.actual !== null && m.cumulativeActual > max) max = m.cumulativeActual;
    }
    return (max || 1) * 1.08;
  }, [months]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-au-line bg-au-card-2 p-4 shadow-sm">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'monthly' | 'cumulative')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-au-line pb-3">
          <TabsList className="border border-au-line bg-au-card-2">
            <TabsTrigger
              value="monthly"
              className="text-xs data-[state=active]:bg-au-card-2 data-[state=active]:text-au-ink text-au-muted"
            >
              {t('tabMonthly')}
            </TabsTrigger>
            <TabsTrigger
              value="cumulative"
              className="text-xs data-[state=active]:bg-au-card-2 data-[state=active]:text-au-ink text-au-muted"
            >
              {t('tabCumulative')}
            </TabsTrigger>
          </TabsList>

          {/* Custom Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 border-t border-dashed border-au-faint" />
              <span className="text-au-muted">
                {tab === 'monthly' ? t('planned') : t('cumulativePlanned')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-700 font-medium">
                {tab === 'monthly' ? t('actual') : t('cumulativeActual')}
              </span>
            </div>
          </div>
        </div>

        {/* Monthly Chart */}
        <TabsContent value="monthly" className="mt-3 outline-none">
          <div className="h-72 w-full" aria-label={t('chartAriaMonthly')}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--au-line)" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  stroke="var(--au-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--au-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, maxMonthlyVal]}
                  tickFormatter={(val: number) => formatUZS(val)}
                />
                <Tooltip content={<CustomMonthlyTooltip t={t} />} />

                {/* Target line */}
                {targetYearEndIncome > 0 && (
                  <ReferenceLine
                    y={targetYearEndIncome}
                    stroke="rgba(12, 122, 63, 0.4)"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Current month vertical indicator */}
                {currentMonthEntry && (
                  <ReferenceLine
                    x={currentMonthEntry.monthLabel}
                    stroke="var(--au-faint)"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Milestones as ReferenceDots */}
                {milestones.map((m) => {
                  const targetM = chartData.find((cd) => cd.monthNumber === m.targetMonth);
                  if (!targetM) return null;
                  const color = MILESTONE_COLORS[m.status] || '#94a3b8';
                  return (
                    <ReferenceDot
                      key={m.id}
                      x={targetM.monthLabel}
                      y={targetM.planned}
                      r={5}
                      fill={color}
                      stroke="var(--au-card)"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Planned Line */}
                <Line
                  type="monotone"
                  dataKey="planned"
                  stroke="var(--au-muted)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'white' }}
                  {...anim}
                />

                {/* Actual Line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="var(--au-ok)"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ fill: 'var(--au-ok)', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: 'var(--au-ok)', stroke: 'var(--au-card)', strokeWidth: 2 }}
                  {...anim}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* Cumulative Chart */}
        <TabsContent value="cumulative" className="mt-3 outline-none">
          <div className="h-72 w-full" aria-label={t('chartAriaCumulative')}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--au-ok)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--au-ok)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--au-line)" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  stroke="var(--au-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--au-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, maxCumulativeVal]}
                  tickFormatter={(val: number) => formatUZS(val)}
                />
                <Tooltip content={<CustomCumulativeTooltip t={t} />} />

                {/* Cumulative Planned Line */}
                <Line
                  type="monotone"
                  dataKey="cumulativePlanned"
                  stroke="var(--au-muted)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'white' }}
                  {...anim}
                />

                {/* Cumulative Actual Area */}
                <Area
                  type="monotone"
                  dataKey="cumulativeActual"
                  stroke="var(--au-ok)"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#actualIncomeGrad)"
                  connectNulls={false}
                  activeDot={{ r: 5, fill: 'var(--au-ok)', stroke: 'var(--au-card)', strokeWidth: 2 }}
                  {...anim}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
