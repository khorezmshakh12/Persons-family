'use client';

import { useMemo } from 'react';
import { CalendarDays, Layers, ListTodo, Target, Users, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { GLASS_INTERACTIVE } from '@/lib/glass';
import { changePercent, lastPoint, type PeriodSeries } from '@/lib/dashboard-stats';
import { formatUZS } from '@/lib/format-currency';
import { useEnterProgress } from '@/lib/use-enter-progress';
import { cn } from '@/lib/utils';
import { MaskableStatValue } from './maskable-stat-value';
import { useStatsPeriod } from './stats-period';

// The icon is chosen by NAME, never by passing the component itself. StatsRow
// is a server component and StatCard is a client one; a lucide icon is a
// forwardRef object, which React cannot serialize across that boundary — doing
// so threw "Functions cannot be passed directly to Client Components" on every
// dashboard render. Add new icons here, not to the props.
const STAT_ICONS = {
  users: Users,
  wallet: Wallet,
  layers: Layers,
  calendar: CalendarDays,
  target: Target,
  tasks: ListTodo,
} as const;

export type StatIconName = keyof typeof STAT_ICONS;

const TINTS = {
  green: {
    iconBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)]',
    bar: 'bg-gradient-to-t from-emerald-500/40 to-emerald-400',
    glow: 'hover:border-emerald-400/50 hover:shadow-[0_0_30px_rgba(52,211,153,0.25)]',
  },
  blue: {
    iconBg: 'bg-teal-500/20 text-teal-300 border border-teal-400/30 shadow-[0_0_15px_rgba(45,212,191,0.2)]',
    bar: 'bg-gradient-to-t from-teal-500/40 to-teal-300',
    glow: 'hover:border-teal-400/50 hover:shadow-[0_0_30px_rgba(45,212,191,0.25)]',
  },
  orange: {
    iconBg: 'bg-amber-500/20 text-amber-300 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.2)]',
    bar: 'bg-gradient-to-t from-amber-500/40 to-amber-300',
    glow: 'hover:border-amber-400/50 hover:shadow-[0_0_30px_rgba(251,191,36,0.25)]',
  },
  red: {
    iconBg: 'bg-rose-500/20 text-rose-300 border border-rose-400/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]',
    bar: 'bg-gradient-to-t from-rose-500/40 to-rose-400',
    glow: 'hover:border-rose-400/50 hover:shadow-[0_0_30px_rgba(244,63,94,0.25)]',
  },
} as const;

/** Floor (in %) for the shortest sparkline bar, so it stays visible. */
const MIN_BAR = 15;

/** ~0.6s, the house count-up/draw duration. */
const ENTER_MS = 600;

export type StatValueFormat = 'count' | 'uzs';

/**
 * One dashboard stat card.
 *
 * It takes the metric as a *series per period* and derives everything it
 * shows from the selected one: headline = the series' last point, sparkline
 * = the series, trend badge = last-vs-previous. There is no second,
 * independently-measured headline to drift out of sync with the chart, and
 * switching kunlik/haftalik/oylik switches all three together.
 *
 * `higherIsBetter: false` for backlog metrics (open missions, open tasks):
 * the arrow still points the way the number moved, but a growing pile of
 * unfinished work is coloured as the bad news it is.
 */
export function StatCard({
  label,
  series,
  format = 'count',
  icon,
  tint,
  href,
  index = 0,
  maskable = false,
  higherIsBetter = true,
}: {
  label: string;
  series: PeriodSeries;
  format?: StatValueFormat;
  icon: StatIconName;
  tint: keyof typeof TINTS;
  href: string;
  index?: number;
  maskable?: boolean;
  higherIsBetter?: boolean;
}) {
  const t = TINTS[tint];
  const Icon = STAT_ICONS[icon];
  const { period } = useStatsPeriod();
  const sparkline = series[period];

  const value = lastPoint(sparkline);
  const change = changePercent(sparkline);
  const isUp = change >= 0;
  const readsWell = higherIsBetter ? isUp : !isUp;

  // Count up from 0 and grow the bars from the baseline. Re-runs when the
  // period changes, so the new series draws itself in rather than snapping.
  const progress = useEnterProgress(ENTER_MS, `${period}:${value}`);

  const shown = useMemo(() => {
    const n = value * progress;
    // Round toward the final value so the last frame is exact, never
    // "1 999 999" for a 2 000 000 total.
    const rounded = progress >= 1 ? value : Math.round(n);
    return format === 'uzs' ? formatUZS(rounded) : new Intl.NumberFormat('uz-UZ').format(rounded);
  }, [value, progress, format]);

  // Scale the bars across the series' own min..max rather than 0..max.
  // These series are running totals, so on 0..max a run like 40,41,…,45
  // renders as six near-identical full bars that read as flat while the
  // badge says "up" — and any negative point (a net balance can go below
  // zero) collapsed onto the same MIN_BAR floor as a small positive one.
  const max = Math.max(...sparkline);
  const min = Math.min(...sparkline);
  const range = max - min;
  const barHeight = (v: number) => {
    const full = range === 0 ? (max > 0 ? 100 : MIN_BAR) : MIN_BAR + ((v - min) / range) * (100 - MIN_BAR);
    // Grow from the baseline. `progress` rests at 1, so a card whose JS never
    // runs renders every bar at its true height — this only ever scales an
    // already-correct value down for the ~0.6s the entrance lasts.
    return full * progress;
  };

  return (
    <Link
      href={href}
      style={{ animationDelay: `${index * 70}ms` }}
      className={cn(
        'animate-fade-in-up flex transform-gpu flex-col overflow-hidden rounded-2xl p-5 text-white shadow-xl backdrop-blur-xl will-change-transform border border-white/15 bg-white/10 transition-all duration-300',
        t.glow,
        GLASS_INTERACTIVE,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex size-11 items-center justify-center rounded-xl backdrop-blur-md', t.iconBg)}>
          <Icon className="size-5" />
        </span>
        <span
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md border shadow-sm',
            readsWell
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.2)]'
              : 'bg-rose-500/20 text-rose-300 border-rose-400/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
          )}
        >
          {isUp ? '↗' : '↘'} {Math.abs(change)}%
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-0.5">
        <span className="font-heading text-3xl font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {maskable ? <MaskableStatValue value={shown} /> : shown}
        </span>
        <span className="text-sm font-medium text-white/80">{label}</span>
      </div>

      <div className="mt-4 flex h-8 items-end gap-1.5">
        {sparkline.map((v, i) => (
          <span
            key={i}
            className={cn('flex-1 rounded-t-sm', t.bar)}
            style={{ height: `${barHeight(v)}%` }}
          />
        ))}
      </div>
    </Link>
  );
}
