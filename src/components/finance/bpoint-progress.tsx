'use client';

import { useState, type JSX } from 'react';
import { Target } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { formatUZS } from '@/lib/format-currency';
import type { BpointProgress as Progress } from '@/lib/bpoint';
import { cn } from '@/lib/utils';

/** B-nuqta sari: each month's OWN pay (bars, not a running total) against the
 * monthly B-nuqta line and the A-nuqta (first paid month) line. All 12 months
 * are drawn; a month that has not come yet has `amount: null`. */
export function BpointProgress({
  year,
  progress,
  months,
}: {
  year: number;
  progress: Progress;
  months: { label: string; amount: number | null }[];
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const { target, start, current, currentMonth } = progress;

  const Header = (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
        <Target className="size-4" />
      </span>
      <div className="flex-1">
        <h2 className="text-base font-bold text-au-ink">B-nuqta sari</h2>
        <p className="text-xs text-au-muted">Har oy olingan oylik va maqsad oylik · {year}</p>
      </div>
    </div>
  );

  if (target <= 0) {
    return (
      <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
        {Header}
        <p className="text-sm text-au-muted">B-nuqta belgilanmagan — grafik uchun avval oylik maqsadni kiriting.</p>
      </section>
    );
  }

  // Scale to the highest of target and any month, so an over-achiever's bar
  // is not cut off and the B-nuqta line sits at its true height.
  const top = Math.max(target, ...months.map((m) => m.amount ?? 0)) * 1.08;
  const h = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const focus = hover ?? Math.max(0, currentMonth);
  const f = months[focus];
  const fPct = f.amount !== null && f.amount > 0 ? Math.round((f.amount / target) * 100) : null;
  const paid = months.filter((m) => (m.amount ?? 0) > 0);
  const avg = paid.length ? Math.round(paid.reduce((s, m) => s + (m.amount ?? 0), 0) / paid.length) : 0;
  const best = paid.reduce((b, m) => Math.max(b, m.amount ?? 0), 0);

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
      {Header}

      <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-semibold text-au-ink">{f.label}</span>
        <span className="text-au-muted tabular-nums">
          {f.amount !== null ? (
            <>
              oylik {formatUZS(f.amount)}
              {fPct !== null && (
                <>
                  {' '}
                  · <b className="text-au-ink">B-nuqtaning {fPct}%</b>
                </>
              )}
            </>
          ) : (
            'hali kelmagan oy'
          )}
        </span>
      </div>

      <div className="relative h-36">
        {/* B-nuqta line at its real height */}
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: h(target) }}>
          <div className="border-t-2 border-dashed border-au-ok" />
          <span className="absolute right-0 bottom-0.5 rounded-au-ctl bg-au-ok-soft px-1.5 py-0.5 text-[9px] font-semibold text-au-ok">
            B-nuqta · {formatUZS(target)}/oy
          </span>
        </div>
        {/* A-nuqta line */}
        {start > 0 && start < target && (
          <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: h(start) }}>
            <div className="border-t border-dotted border-au-muted" />
            <span className="absolute left-0 bottom-0.5 rounded-au-ctl bg-au-card px-1.5 py-0.5 text-[9px] font-semibold text-au-muted">
              A-nuqta · {formatUZS(start)}
            </span>
          </div>
        )}

        <div className="flex h-full items-end gap-1" onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => (
            <button
              key={m.label}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${m.label}: ${m.amount !== null ? `oylik ${m.amount}` : 'hali kelmagan'}`}
              className={cn('relative flex h-full flex-1 items-end rounded-[3px]', focus === i && 'bg-au-accent/5')}
            >
              {m.amount === null ? (
                <span className="absolute inset-x-[15%] bottom-0 rounded-t-[3px] border border-dashed border-au-line" style={{ height: h(target) }} />
              ) : (
                <span
                  style={{ height: h(m.amount), ['--i' as string]: i }}
                  className={cn(
                    'ms-grow-y relative mx-[15%] w-[70%] rounded-t-[3px] transition-colors',
                    m.amount >= target ? 'bg-au-ok' : i === currentMonth ? 'bg-au-accent' : 'bg-au-accent/55',
                  )}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 text-center text-[9px] text-au-muted">
        {months.map((m, i) => (
          <span key={m.label} className={cn('flex-1', i === currentMonth && 'font-bold text-au-accent-text')}>
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-au-muted">
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs bg-au-accent" /> Oy oyligi
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs bg-au-ok" /> B-nuqtaga yetgan oy
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs border border-dashed border-au-line" /> Hali kelmagan
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-au-muted">
        <span>
          Hozir: <b className="text-au-ink tabular-nums">{current > 0 ? formatUZS(current) : '—'}</b>
        </span>
        <span className="text-right">
          Eng yuqori oy: <b className="text-au-ink tabular-nums">{best > 0 ? formatUZS(best) : '—'}</b>
        </span>
        <span>
          O‘rtacha oyiga: <b className="text-au-ink tabular-nums">{avg > 0 ? formatUZS(avg) : '—'}</b>
        </span>
        <span className="text-right">
          {current >= target ? (
            <b className="text-au-ok">B-nuqtaga yetildi</b>
          ) : (
            <>
              Yana kerak: <b className="tabular-nums text-au-bad">{formatUZS(target - current)}</b>
            </>
          )}
        </span>
      </div>
    </section>
  );
}
