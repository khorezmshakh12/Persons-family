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
      ? 'text-au-muted'
      : attainment >= 100
        ? 'text-emerald-700'
        : attainment >= 90
          ? 'text-amber-700'
          : 'text-red-700';

  const progressIndicatorColor =
    attainment === null
      ? 'bg-au-card-2'
      : attainment >= 100
        ? 'bg-emerald-400'
        : attainment >= 90
          ? 'bg-amber-400'
          : 'bg-red-400';

  const avgGrowth = totals?.avgMonthlyGrowthPct ?? null;
  const avgGrowthColor =
    avgGrowth === null
      ? 'text-au-muted'
      : avgGrowth > 0
        ? 'text-emerald-700'
        : avgGrowth < 0
          ? 'text-red-700'
          : 'text-au-muted';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {/* 1. Baseline */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0 }}
        className="flex flex-col justify-between rounded-xl border border-au-line bg-au-card-2 p-4 shadow-sm transition-all duration-200 hover:border-au-faint"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-au-muted">{t('baselineMonthlyIncome')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-au-card text-au-muted">
            <Zap className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xl font-bold tracking-tight text-au-ink tabular-nums">
            {formatUZS(roadmap.baselineMonthlyIncome)}
          </span>
          <span className="text-[11px] text-au-muted">{t('planned')}</span>
        </div>
      </motion.div>

      {/* 2. Year-end Target */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.04 }}
        className="flex flex-col justify-between rounded-xl border border-au-line bg-au-card-2 p-4 shadow-sm transition-all duration-200 hover:border-au-faint"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-au-muted">{t('targetYearEndIncome')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-au-card text-emerald-700">
            <Target className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xl font-bold tracking-tight text-emerald-700 tabular-nums">
            {formatUZS(roadmap.targetYearEndIncome)}
          </span>
          <span className="text-[11px] text-au-muted tabular-nums">
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
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
        className="flex flex-col justify-between rounded-xl border border-au-line bg-au-card-2 p-4 shadow-sm transition-all duration-200 hover:border-au-faint"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-au-muted">{t('attainment')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-au-card text-amber-700">
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
              className="h-1.5 w-full bg-au-card"
            >
              {/* Overwrite inner indicator color */}
              <div
                className={cn('h-full transition-all rounded-full', progressIndicatorColor)}
                style={{ width: `${attainment !== null ? Math.min(Math.max(attainment, 0), 100) : 0}%` }}
              />
            </Progress>
            <span className="text-[11px] text-au-muted tabular-nums">
              {totals ? t('ofPlanned', { amount: formatUZS(totals.plannedToDate) }) : '—'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* 4. Avg. Monthly Growth */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.12 }}
        className="flex flex-col justify-between rounded-xl border border-au-line bg-au-card-2 p-4 shadow-sm transition-all duration-200 hover:border-au-faint"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-au-muted">{t('avgMonthlyGrowth')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-au-card text-au-muted">
            {avgGrowth === null ? (
              <Minus className="size-3.5" />
            ) : avgGrowth >= 0 ? (
              <TrendingUp className="size-3.5 text-emerald-700" />
            ) : (
              <TrendingDown className="size-3.5 text-red-700" />
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className={cn('text-xl font-bold tracking-tight tabular-nums', avgGrowthColor)}>
            {avgGrowth !== null ? `${avgGrowth >= 0 ? '+' : ''}${avgGrowth.toFixed(1)}%` : '—'}
          </span>
          <span className="text-[11px] text-au-muted">
            {totals?.reportedMonths ? `${totals.reportedMonths} ${t('month').toLowerCase()}` : '—'}
          </span>
        </div>
      </motion.div>

      {/* 5. Projected Year Total */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.16 }}
        className="flex flex-col justify-between rounded-xl border border-au-line bg-au-card-2 p-4 shadow-sm transition-all duration-200 hover:border-au-faint sm:col-span-2 md:col-span-1"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-au-muted">{t('projectedYearTotal')}</span>
          <div className="flex size-6 items-center justify-center rounded-lg bg-au-card text-sky-700">
            <Sparkles className="size-3.5" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xl font-bold tracking-tight text-au-ink tabular-nums">
            {totals ? formatUZS(totals.projectedYearTotal) : '—'}
          </span>
          <span className="text-[11px] text-au-muted tabular-nums">
            {totals ? t('ofPlanned', { amount: formatUZS(totals.plannedYear) }) : '—'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
