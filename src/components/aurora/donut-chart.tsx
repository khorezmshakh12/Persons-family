import { cn } from '@/lib/utils';

export type DonutSlice = { label: string; value: number; color: string };

/** Stroke-12 donut, total in the middle, 2-column legend underneath. */
export function DonutChart({
  slices,
  centerLabel,
  size = 150,
  className,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  size?: number;
  className?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 38;
  const c = 2 * Math.PI * r;
  const arcs = slices.reduce<{ slice: DonutSlice; len: number; offset: number }[]>((acc, slice) => {
    const prev = acc[acc.length - 1];
    const offset = prev ? prev.offset + prev.len : 0;
    acc.push({ slice, len: total > 0 ? (slice.value / total) * c : 0, offset });
    return acc;
  }, []);

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative mx-auto mt-1 mb-3.5" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--au-chart-4)" strokeWidth="12" />
          {arcs.map(({ slice, len, offset }) =>
            len > 0 ? (
              <circle
                key={slice.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${c}`}
                strokeDashoffset={-offset}
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-[32px] leading-[34px] font-bold text-au-ink tabular-nums">{total}</b>
          <span className="text-xs text-au-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-2.5 gap-y-2 text-xs text-au-muted">
        {slices.map((s) => (
          <li key={s.label} className="flex min-w-0 items-center gap-1.5">
            <i className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            <span className="truncate">{s.label}</span>
            <b className="ml-auto text-au-ink tabular-nums">{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
