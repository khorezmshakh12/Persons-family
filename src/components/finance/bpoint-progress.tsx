'use client';

import { useState, type JSX } from 'react';
import { Target } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';

/** B-nuqta sari: xodimning yig‘ilib boruvchi yillik topgani maqsad chizig‘iga qarab ko‘tariladi. */
export function BpointProgress({
  year,
  target,
  months,
}: {
  year: number;
  target: number;
  months: { label: string; cumulative: number; pct: number }[];
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);

  const Header = (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
        <Target className="size-4" />
      </span>
      <div className="flex-1">
        <h2 className="text-base font-bold text-au-ink">B-nuqta sari</h2>
        <p className="text-xs text-au-muted">Yig‘ilib boruvchi yillik topgani · {year}</p>
      </div>
    </div>
  );

  if (target <= 0 || months.length === 0) {
    return (
      <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
        {Header}
        <p className="text-sm text-au-muted">
          B-nuqta belgilanmagan — grafik uchun avval maqsadni kiriting.
        </p>
      </section>
    );
  }

  const last = months.length - 1;
  const focus = hover ?? last;
  const f = months[focus];
  const latest = months[last];
  const remaining = Math.max(0, target - latest.cumulative);
  const barH = (v: number) => `${Math.min(100, Math.max(0, (v / target) * 100))}%`;

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
      {Header}

      <div className="flex h-5 items-baseline justify-between text-xs">
        <span className="font-semibold text-au-ink">{f.label}</span>
        <span className="text-au-muted tabular-nums">
          {formatUZS(f.cumulative)} · <b className="text-au-ink">{f.pct}%</b> B-nuqtadan
        </span>
      </div>

      <div className="relative h-32 pt-5">
        {/* B-nuqta maqsad chizig‘i — plot ustidagi alohida marker */}
        <div className="pointer-events-none absolute inset-x-0 top-5 z-10">
          <div className="border-t-2 border-dashed border-au-accent" />
          <span className="mt-1 inline-block rounded-au-ctl bg-au-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-au-accent-text">
            B-nuqta · {formatUZS(target)}
          </span>
        </div>

        <div className="flex h-full items-end gap-1" onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => (
            <button
              key={m.label}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${m.label}: ${m.cumulative}, ${m.pct}% B-nuqtadan`}
              className="relative flex h-full flex-1 items-end"
            >
              {i === last && (
                <span
                  className="absolute inset-x-0 z-10 -translate-y-1 text-center text-[9px] font-semibold tabular-nums text-au-accent-text"
                  style={{ bottom: barH(m.cumulative) }}
                >
                  {m.pct}%
                </span>
              )}
              <span
                style={{ height: barH(m.cumulative), ['--i' as string]: i }}
                className={cn(
                  'ms-grow-y relative w-full rounded-t-[3px] transition-colors',
                  i === last ? 'bg-au-accent' : focus === i ? 'bg-au-accent/40' : 'bg-au-ink/30',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 text-center text-[9px] text-au-muted">
        {months.map((m) => (
          <span key={m.label} className="flex-1">
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex justify-between text-xs text-au-muted">
        <span>Shu yil topildi: <b className="text-au-ink">{formatUZS(latest.cumulative)}</b></span>
        <span>Qoldi: <b className="text-au-ink">{formatUZS(remaining)}</b></span>
      </div>
    </section>
  );
}
