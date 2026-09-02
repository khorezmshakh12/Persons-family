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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const MILESTONE_COLORS: Record<string, string> = {
  planned: '#94a3b8',
  in_progress: '#38bdf8',
  achieved: '#34d399',
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
    <div className="flex min-w-[180px] flex-col gap-1 rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <span className="border-b border-white/10 pb-1 font-semibold text-white/90">
        {data.monthLabel}
      </span>
      <div className="flex items-center justify-between gap-3 text-white/70">
        <span>{t('planned')}:</span>
        <span className="font-medium text-white tabular-nums">{formatUZS(data.planned)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-white/70">
        <span>{t('actual')}:</span>
        <span className="font-medium text-emerald-300 tabular-nums">
          {data.actual !== null ? formatUZS(data.actual) : '—'}
        </span>
      </div>
      {data.variance !== null && (
        <div className="flex items-center justify-between gap-3 text-white/70">
          <span>{t('variance')}:</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              data.variance >= 0 ? 'text-emerald-300' : 'text-red-300',
            )}
          >
            {data.variance >= 0 ? '+' : ''}
            {formatUZS(data.variance)}
          </span>
        </div>
      )}
      {data.growthPct !== null && (
        <div className="flex items-center justify-between gap-3 text-white/70">
          <span>{t('growth')}:</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              data.growthPct >= 0 ? 'text-emerald-300' : 'text-red-300',
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
    <div className="flex min-w-[180px] flex-col gap-1 rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <span className="border-b border-white/10 pb-1 font-semibold text-white/90">
        {data.monthLabel}
      </span>
      <div className="flex items-center justify-between gap-3 text-white/70">
        <span>{t('cumulativePlanned')}:</span>
        <span className="font-medium text-white tabular-nums">
          {formatUZS(data.cumulativePlanned)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-white/70">
        <span>{t('cumulativeActual')}:</span>
        <span className="font-medium text-emerald-300 tabular-nums">
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
    <div className="flex flex-col gap-4 rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'monthly' | 'cumulative')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <TabsList className="border border-white/15 bg-white/5">
            <TabsTrigger
              value="monthly"
              className="text-xs data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/70"
            >
              {t('tabMonthly')}
            </TabsTrigger>
            <TabsTrigger
              value="cumulative"
              className="text-xs data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/70"
            >
              {t('tabCumulative')}
            </TabsTrigger>
          </TabsList>

          {/* Custom Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 border-t border-dashed border-white/60" />
              <span className="text-white/60">
                {tab === 'monthly' ? t('planned') : t('cumulativePlanned')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-300 font-medium">
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
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  stroke="rgba(255,255,255,0.75)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.75)"
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
                    stroke="rgba(52, 211, 153, 0.4)"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Current month vertical indicator */}
                {currentMonthEntry && (
                  <ReferenceLine
                    x={currentMonthEntry.monthLabel}
                    stroke="rgba(255, 255, 255, 0.3)"
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
                      stroke="rgba(15, 23, 42, 0.8)"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Planned Line */}
                <Line
                  type="monotone"
                  dataKey="planned"
                  stroke="rgba(255,255,255,0.55)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'white' }}
                />

                {/* Actual Line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ fill: '#34d399', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#34d399', stroke: '#ffffff', strokeWidth: 2 }}
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
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  stroke="rgba(255,255,255,0.75)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.75)"
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
                  stroke="rgba(255,255,255,0.55)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'white' }}
                />

                {/* Cumulative Actual Area */}
                <Area
                  type="monotone"
                  dataKey="cumulativeActual"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#actualIncomeGrad)"
                  connectNulls={false}
                  activeDot={{ r: 5, fill: '#34d399', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
