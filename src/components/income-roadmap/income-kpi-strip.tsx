'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Target, Zap, Award, Sparkles, Minus } from 'lucide-react';
import type { IncomeRoadmapHeader, IncomeRoadmapTotals } from './data';
import { formatUZS } from '@/lib/format-currency';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export function IncomeKpiStrip({
  roadmap,
  totals,
}: {
  roadmap: IncomeRoadmapHeader;
  totals: IncomeRoadmapTotals | null;
}) {
  const t = useTranslations('incomeRoadmap');

  const attainment = totals?.attainmentPct ?? null;
  const attainmentColor =
    attainment === null
      ? 'text-white/40'
      : attainment >= 100
        ? 'text-emerald-300'
        : attainment >= 90
          ? 'text-amber-300'
          : 'text-red-300';

  const progressIndicatorColor =
    attainment === null
      ? 'bg-white/20'
      : attainment >= 100
        ? 'bg-emerald-400'
        : attainment >= 90
          ? 'bg-amber-400'
          : 'bg-red-400';

  const avgGrowth = totals?.avgMonthlyGrowthPct ?? null;
  const avgGrowthColor =
    avgGrowth === null
      ? 'text-white/40'
      : avgGrowth > 0
        ? 'text-emerald-300'
        : avgGrowth < 0
          ? 'text-red-300'
          : 'text-white/70';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {/* 1. Baseline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0 }}
        className="flex flex-col justify-between rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">{t('baselineMonthlyIncome')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-white/10 text-white/60">
            <Zap className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xl font-bold tracking-tight text-white tabular-nums">
            {formatUZS(roadmap.baselineMonthlyIncome)}
          </span>
          <span className="text-[11px] text-white/40">{t('planned')}</span>
        </div>
      </motion.div>

      {/* 2. Year-end Target */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.04 }}
        className="flex flex-col justify-between rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">{t('targetYearEndIncome')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
            <Target className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xl font-bold tracking-tight text-emerald-300 tabular-nums">
            {formatUZS(roadmap.targetYearEndIncome)}
          </span>
          <span className="text-[11px] text-white/55 tabular-nums">
            {totals?.plannedYearGrowthPct != null
              ? t('growthOnBaseline', {
                  percent:
                    totals.plannedYearGrowthPct >= 0
                      ? `${totals.plannedYearGrowthPct.toFixed(1)}`
                      : totals.plannedYearGrowthPct.toFixed(1),
                })
              : '—'}
          </span>
        </div>
      </motion.div>

      {/* 3. Attainment to Date */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
        className="flex flex-col justify-between rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">{t('attainment')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-white/10 text-amber-300">
            <Award className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <span className={cn('text-xl font-bold tracking-tight tabular-nums', attainmentColor)}>
            {attainment !== null ? `${attainment.toFixed(1)}%` : '—'}
          </span>
          <div className="flex flex-col gap-1">
            <Progress
              value={attainment !== null ? Math.min(Math.max(attainment, 0), 100) : 0}
              className="h-1.5 w-full bg-white/10"
            >
              {/* Overwrite inner indicator color */}
              <div
                className={cn('h-full transition-all rounded-full', progressIndicatorColor)}
                style={{ width: `${attainment !== null ? Math.min(Math.max(attainment, 0), 100) : 0}%` }}
              />
            </Progress>
            <span className="text-[11px] text-white/55 tabular-nums">
              {totals ? t('ofPlanned', { amount: formatUZS(totals.plannedToDate) }) : '—'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* 4. Avg. Monthly Growth */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.12 }}
        className="flex flex-col justify-between rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">{t('avgMonthlyGrowth')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-white/10 text-white/70">
            {avgGrowth === null ? (
              <Minus className="size-3.5" />
            ) : avgGrowth >= 0 ? (
              <TrendingUp className="size-3.5 text-emerald-300" />
            ) : (
              <TrendingDown className="size-3.5 text-red-300" />
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className={cn('text-xl font-bold tracking-tight tabular-nums', avgGrowthColor)}>
            {avgGrowth !== null ? `${avgGrowth >= 0 ? '+' : ''}${avgGrowth.toFixed(1)}%` : '—'}
          </span>
          <span className="text-[11px] text-white/40">
            {totals?.reportedMonths ? `${totals.reportedMonths} ${t('month').toLowerCase()}` : '—'}
          </span>
        </div>
      </motion.div>

      {/* 5. Projected Year Total */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.16 }}
        className="flex flex-col justify-between rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm sm:col-span-2 md:col-span-1"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">{t('projectedYearTotal')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-white/10 text-sky-300">
            <Sparkles className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xl font-bold tracking-tight text-white tabular-nums">
            {totals ? formatUZS(totals.projectedYearTotal) : '—'}
          </span>
          <span className="text-[11px] text-white/55 tabular-nums">
            {totals ? t('ofPlanned', { amount: formatUZS(totals.plannedYear) }) : '—'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
