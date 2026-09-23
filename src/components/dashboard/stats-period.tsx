'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_STATS_PERIOD, STATS_PERIODS, type StatsPeriod } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

/**
 * The one kunlik / haftalik / oylik (daily / weekly / monthly) selector every
 * rate, growth and sparkline figure on the dashboard reads.
 *
 * Deliberately pure client view state, not a URL param or a server round
 * trip: the server hands each card all three grains (they are bucketed from
 * one row fetch — see lib/dashboard-stats.ts), so switching costs no query
 * and, because this provider sits *above* the streamed server cards, the
 * chosen period survives a realtime `router.refresh()` that re-renders them.
 */
const StatsPeriodContext = createContext<{
  period: StatsPeriod;
  setPeriod: (period: StatsPeriod) => void;
}>({ period: DEFAULT_STATS_PERIOD, setPeriod: () => {} });

export function useStatsPeriod() {
  return useContext(StatsPeriodContext);
}

export function StatsPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const value = useMemo(() => ({ period, setPeriod }), [period]);
  return <StatsPeriodContext.Provider value={value}>{children}</StatsPeriodContext.Provider>;
}

export function StatsPeriodToggle({ className }: { className?: string }) {
  const t = useTranslations('dashboard.stats.period');
  const { period, setPeriod } = useStatsPeriod();

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-white/10 p-0.5 backdrop-blur-md',
        className,
      )}
    >
      {STATS_PERIODS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={period === option}
          onClick={() => setPeriod(option)}
          className={cn(
            'tap-scale rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            period === option
              ? 'bg-white/25 text-white shadow-sm'
              : 'text-white/60 hover:text-white/90',
          )}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
