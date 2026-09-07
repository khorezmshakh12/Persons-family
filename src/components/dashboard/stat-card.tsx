'use client';

import type { LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { MaskableStatValue } from './maskable-stat-value';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { durations, springs, easings } from '@/lib/motion';

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

export function StatCard({
  label,
  value,
  icon: Icon,
  tint,
  changePercent,
  sparkline,
  href,
  index = 0,
  maskable = false,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tint: keyof typeof TINTS;
  changePercent: number;
  sparkline: number[];
  href: string;
  index?: number;
  maskable?: boolean;
}) {
  const t = TINTS[tint];
  const shouldReduce = useReducedMotion();
  const isPositive = changePercent >= 0;

  const max = Math.max(...sparkline, 0);
  const min = Math.min(...sparkline, 0);
  const range = max - min;
  const barHeight = (v: number) =>
    range === 0 ? (max > 0 ? 100 : MIN_BAR) : MIN_BAR + ((v - min) / range) * (100 - MIN_BAR);

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: durations.base,
        delay: index * 0.045,
        ease: easings.standard,
      }}
      className="w-full min-w-0"
    >
      <Link
        href={href}
        className={cn(
          'flex transform-gpu flex-col overflow-hidden rounded-2xl p-5 text-white shadow-xl backdrop-blur-xl will-change-transform border border-white/15 bg-white/10 transition-all duration-300',
          t.glow,
          GLASS_INTERACTIVE,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={cn('flex size-11 items-center justify-center rounded-xl backdrop-blur-md', t.iconBg)}>
            <Icon className="size-5" />
          </span>
          <motion.span
            initial={shouldReduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: durations.base,
              delay: shouldReduce ? 0 : 0.22,
              ease: easings.emphasized,
            }}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md border shadow-sm',
              isPositive
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.2)]'
                : 'bg-rose-500/20 text-rose-300 border-rose-400/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
            )}
          >
            {isPositive ? '↗' : '↘'} {Math.abs(changePercent)}%
          </motion.span>
        </div>

        <div className="mt-4 flex flex-col gap-0.5">
          <span className="font-heading text-3xl font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {maskable ? (
              <MaskableStatValue value={String(value)} />
            ) : (
              <AnimatedCounter value={value} duration={durations.slow} />
            )}
          </span>
          <span className="text-sm font-medium text-white/80">{label}</span>
        </div>

        <div className="mt-4 flex h-8 items-end gap-1.5">
          {sparkline.map((v, i) => (
            <motion.span
              key={i}
              initial={shouldReduce ? false : { height: '0%' }}
              animate={{ height: `${barHeight(v)}%` }}
              transition={{
                delay: shouldReduce ? 0 : 0.1 + i * 0.03,
                type: 'spring',
                stiffness: springs.snappy.stiffness,
                damping: springs.snappy.damping,
              }}
              className={cn('flex-1 rounded-t-sm transition-colors duration-300', t.bar)}
            />
          ))}
        </div>
      </Link>
    </motion.div>
  );
}
