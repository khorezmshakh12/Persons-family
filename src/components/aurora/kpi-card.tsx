import type { ComponentType } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_INTERACTIVE, CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/motion/count-up';

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
  meter,
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
  bars?: number[];
  /** 0–100; replaces the mini bars with a progress meter. */
  meter?: number;
  href?: string;
  index?: number;
}) {
  const max = Math.max(1, ...(bars ?? []));
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
        <CountUp value={value} />
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
      {meter !== undefined ? (
        <div className="mt-auto pt-4">
          <div className="mb-1.5 flex justify-between text-[11px] font-semibold text-au-faint tabular-nums">
            <span>{Math.round(meter)}%</span>
            <span>100%</span>
          </div>
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(meter)}
            aria-label={label}
            className="h-2 overflow-hidden rounded-full bg-au-card-2"
          >
            <i
              className={cn(
                'au-meter block h-full rounded-full transition-[width] duration-700 ease-out',
                meter >= 80 ? 'bg-au-ok' : meter >= 50 ? 'bg-au-accent' : 'bg-au-bad',
              )}
              style={{ width: `${Math.max(2, Math.min(100, meter))}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="au-spark mt-4 flex min-h-10 flex-1 items-end gap-1" aria-hidden>
          {(bars ?? []).map((v, i) => (
            <i
              key={i}
              className={cn('flex-1 rounded-[2px]', i === (bars ?? []).length - 1 ? 'bg-au-accent' : 'bg-au-chart-4')}
              style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
            />
          ))}
        </div>
      )}
    </>
  );

  const className = cn(SURFACE_CARD, 'au-kpi enter-rise flex min-h-[200px] flex-col p-[18px]', href && CARD_INTERACTIVE);
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
