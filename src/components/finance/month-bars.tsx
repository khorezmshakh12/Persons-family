'use client';

import { useState } from 'react';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';
import type { MonthPoint } from '@/lib/pay-run-data';

const SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** Twelve months, planned fund (outline) vs paid (filled), bars grow in. */
export function MonthBars({ points, current }: { points: MonthPoint[]; current: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((p) => [p.planned, p.paid]));
  const h = (v: number) => `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%`;
  const focus = hover ?? points.findIndex((p) => p.period === current);
  const f = points[focus];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-5 items-baseline justify-between text-xs">
        {f ? (
          <>
            <span className="font-semibold text-au-ink">{SHORT[Number(f.period.slice(5, 7)) - 1]} {f.period.slice(0, 4)}</span>
            <span className="text-au-muted tabular-nums">
              fond {formatUZS(f.planned)} · to‘langan <b className="text-au-ink">{formatUZS(f.paid)}</b>
            </span>
          </>
        ) : null}
      </div>
      <div className="flex h-28 items-end gap-1" onMouseLeave={() => setHover(null)}>
        {points.map((p, i) => (
          <button
            key={p.period}
            type="button"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            aria-label={`${p.period}: fond ${p.planned}, to‘langan ${p.paid}`}
            className="relative flex h-full flex-1 items-end"
          >
            <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] border border-dashed border-au-line" style={{ height: h(p.planned) }} />
            <span
              style={{ height: h(p.paid), ['--i' as string]: i }}
              className={cn(
                'ms-grow-y relative w-full rounded-t-[3px] transition-colors',
                p.period === current ? 'bg-au-accent' : focus === i ? 'bg-au-ink/70' : 'bg-au-ink/25',
              )}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-1 text-center text-[9px] text-au-muted">
        {points.map((p) => (
          <span key={p.period} className="flex-1">
            {SHORT[Number(p.period.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}
