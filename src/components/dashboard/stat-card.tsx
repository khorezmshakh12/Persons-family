import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TINTS = {
  green: {
    card: 'bg-green-500/20 border-green-500/30',
    icon: 'bg-green-500/30 text-green-50',
    bar: 'bg-green-400/80',
  },
  blue: {
    card: 'bg-blue-500/20 border-blue-500/30',
    icon: 'bg-blue-500/30 text-blue-50',
    bar: 'bg-blue-400/80',
  },
  orange: {
    card: 'bg-orange-500/20 border-orange-500/30',
    icon: 'bg-orange-500/30 text-orange-50',
    bar: 'bg-orange-400/80',
  },
  red: {
    card: 'bg-red-500/20 border-red-500/30',
    icon: 'bg-red-500/30 text-red-50',
    bar: 'bg-red-400/80',
  },
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tint,
  changePercent,
  sparkline,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tint: keyof typeof TINTS;
  changePercent: number;
  sparkline: number[];
}) {
  const t = TINTS[tint];
  const max = Math.max(...sparkline, 1);
  const isPositive = changePercent >= 0;

  return (
    <div
      className={cn(
        'relative flex transform-gpu flex-col overflow-hidden rounded-2xl border p-5 text-white shadow-xl backdrop-blur-md will-change-transform',
        t.card,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex size-10 items-center justify-center rounded-xl', t.icon)}>
          <Icon className="size-5" />
        </span>
        <span
          className={cn(
            'flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm',
            isPositive ? 'bg-emerald-500/90' : 'bg-red-500/85',
          )}
        >
          {isPositive ? '↗' : '↘'} {Math.abs(changePercent)}%
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-0.5">
        <span className="text-3xl font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {value}
        </span>
        <span className="text-sm font-medium text-white/90">{label}</span>
      </div>

      <div className="mt-4 flex h-8 items-end gap-1">
        {sparkline.map((v, i) => (
          <span
            key={i}
            className={cn('flex-1 rounded-sm', t.bar)}
            style={{ height: `${Math.max((v / max) * 100, 10)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
