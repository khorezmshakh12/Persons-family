import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { GLASS_INTERACTIVE, GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { MaskableStatValue } from './maskable-stat-value';

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
  const max = Math.max(...sparkline, 1);
  const isPositive = changePercent >= 0;

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
            isPositive
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.2)]'
              : 'bg-rose-500/20 text-rose-300 border-rose-400/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
          )}
        >
          {isPositive ? '↗' : '↘'} {Math.abs(changePercent)}%
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-0.5">
        <span className="font-heading text-3xl font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {maskable ? <MaskableStatValue value={String(value)} /> : value}
        </span>
        <span className="text-sm font-medium text-white/80">{label}</span>
      </div>

      <div className="mt-4 flex h-8 items-end gap-1.5">
        {sparkline.map((v, i) => (
          <span
            key={i}
            className={cn('flex-1 rounded-t-sm transition-all duration-300', t.bar)}
            style={{ height: `${Math.max((v / max) * 100, 15)}%` }}
          />
        ))}
      </div>
    </Link>
  );
}
