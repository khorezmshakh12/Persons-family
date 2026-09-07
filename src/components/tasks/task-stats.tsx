'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { TaskStats as TaskStatsData } from '@/lib/actions/task-stats';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { durations, springs, easings } from '@/lib/motion';

/**
 * Pure renderer for the per-employee task statistics panel — the page fetches
 * the numbers (getTaskStatsAction) and hands them over already localised
 * (month labels) and pre-computed (rates), so nothing here re-derives a date
 * or a percentage. Mirrors IssuesStats (components/issues/issues-stats.tsx).
 */
export function TaskStats({ stats }: { stats: TaskStatsData | null }) {
  const t = useTranslations('tasks.stats');
  const shouldReduce = useReducedMotion();

  if (!stats) {
    return <div className={cn(GLASS_CARD, 'p-6 text-sm text-white/60')}>{t('noData')}</div>;
  }

  const { overall, byMonth } = stats;

  const tiles = [
    { key: 'total', value: overall.total, isNumeric: true },
    { key: 'done', value: overall.done, isNumeric: true },
    { key: 'completionRate', value: `${overall.completionRate}%`, isNumeric: true },
    {
      key: 'avgCompletion',
      value: overall.avgCompletionDays == null ? '—' : t('days', { count: overall.avgCompletionDays }),
      isNumeric: false,
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
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.key}
            initial={shouldReduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: durations.base,
              delay: shouldReduce ? 0 : i * 0.04,
              ease: easings.standard,
            }}
            className="flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-3"
          >
            <span className="text-2xl font-bold tracking-tight text-white">
              {tile.isNumeric ? (
                <AnimatedCounter value={tile.value} duration={durations.slow} />
              ) : (
                tile.value
              )}
            </span>
            <span className="text-xs text-white/60">{t(`tiles.${tile.key}`)}</span>
          </motion.div>
        ))}
      </div>

      {/* On-time / late / still-open split across every task ever assigned */}
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

      {/* 6-month section */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-white">{t('byMonth')}</h3>
        {byMonth.length === 0 ? (
          <p className="text-sm text-white/60">{t('noData')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {byMonth.map((month, idx) => (
              <li
                key={month.monthKey}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:flex-nowrap"
              >
                <span className="w-20 shrink-0 capitalize text-white/80">{month.label}</span>
                <span className="w-40 shrink-0 text-white/60">
                  {t('monthCounts', {
                    due: month.due,
                    onTime: month.doneOnTime,
                    late: month.doneLate,
                  })}
                </span>
                <div className="relative h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={shouldReduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      delay: shouldReduce ? 0 : 0.15 + idx * 0.05,
                      type: 'spring',
                      stiffness: springs.snappy.stiffness,
                      damping: springs.snappy.damping,
                    }}
                    style={{ originX: 0, width: `${month.onTimeRate}%` }}
                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-400/80"
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-white/70">
                  <AnimatedCounter value={`${month.onTimeRate}%`} duration={durations.slow} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
