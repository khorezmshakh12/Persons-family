import type { ComponentType } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_INTERACTIVE, CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

/**
 * Aurora KPI tile: label + icon square, big tabular number, delta chip +
 * caption, and 7 mini bars (the newest one apricot).
 */
export function KpiCard({
  label,
  icon: Icon,
  value,
  delta,
  deltaUnit = 'percent',
  higherIsBetter = true,
  caption,
  bars,
  href,
  index = 0,
}: {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  value: string;
  delta: number | null;
  deltaUnit?: 'percent' | 'absolute';
  higherIsBetter?: boolean;
  caption?: string;
  bars: number[];
  href?: string;
  index?: number;
}) {
  const max = Math.max(1, ...bars);
  const good = delta === null || delta === 0 ? null : delta > 0 === higherIsBetter;
  const chipClass = good === null ? CHIP_NEUTRAL : good ? CHIP_OK : CHIP_BAD;
  const Arrow = delta !== null && delta < 0 ? ArrowDown : ArrowUp;
  const deltaText =
    delta === null ? null : deltaUnit === 'percent' ? `${Math.abs(delta)}%` : `${delta > 0 ? '+' : ''}${delta}`;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-au-muted">
        <span className="truncate">{label}</span>
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-au-card-2 text-au-muted">
          <Icon className="size-[15px]" strokeWidth={1.75} />
        </span>
      </div>
      <div className="mt-3 text-[30px] leading-[34px] font-bold tracking-[-0.02em] text-au-ink tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-au-muted">
        {deltaText !== null && (
          <span className={cn(chipClass, 'h-5 shrink-0 px-1.5 text-[11px]')}>
            {deltaUnit === 'percent' && delta !== 0 && <Arrow className="size-3" strokeWidth={2.25} aria-hidden />}
            {deltaText}
          </span>
        )}
        {caption && <span className="truncate">{caption}</span>}
      </div>
      <div className="mt-4 flex min-h-10 flex-1 items-end gap-1" aria-hidden>
        {bars.map((v, i) => (
          <i
            key={i}
            className={cn('flex-1 rounded-[2px]', i === bars.length - 1 ? 'bg-au-accent' : 'bg-au-chart-4')}
            style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
          />
        ))}
      </div>
    </>
  );

  const className = cn(SURFACE_CARD, 'enter-rise flex min-h-[200px] flex-col p-[18px]', href && CARD_INTERACTIVE);
  const style = { animationDelay: `${Math.min(index, 10) * 45}ms` };

  return href ? (
    <Link href={href} className={className} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
