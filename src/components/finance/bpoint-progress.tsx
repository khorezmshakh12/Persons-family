'use client';

import { useState, type JSX } from 'react';
import { Target } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';

/** B-nuqta sari: the year's cumulative earnings (bars) against the planned
 * path to the B-nuqta (dashed step, target × month/12) and the B-nuqta line
 * itself. All 12 months are drawn so the plan is visible ahead of today;
 * a month that has not come yet has `cumulative: null`. Pay differs month
 * to month (it follows what the person brought in), so each month's own
 * amount is shown too, with what every remaining month needs. */
export function BpointProgress({
  year,
  target,
  months,
}: {
  year: number;
  target: number;
  months: { label: string; cumulative: number | null; amount: number | null }[];
}): JSX.Element {
  const elapsed = months.filter((m) => m.cumulative !== null);
  const last = elapsed.length - 1;
  const [hover, setHover] = useState<number | null>(null);

  const Header = (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
        <Target className="size-4" />
      </span>
      <div className="flex-1">
        <h2 className="text-base font-bold text-au-ink">B-nuqta sari</h2>
        <p className="text-xs text-au-muted">Yig‘ilib boruvchi topgan vs reja · {year}</p>
      </div>
    </div>
  );

  if (target <= 0) {
    return (
      <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
        {Header}
        <p className="text-sm text-au-muted">B-nuqta belgilanmagan — grafik uchun avval maqsadni kiriting.</p>
      </section>
    );
  }

  const plannedAt = (i: number) => Math.round((target * (i + 1)) / 12);
  // Scale to whatever is highest — an over-achiever's bars must not be cut
  // off, and the B-nuqta line must sit at its true height.
  const top = Math.max(target, ...elapsed.map((m) => m.cumulative ?? 0)) * 1.08;
  const h = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const focus = hover ?? Math.max(0, last);
  const f = months[focus];
  const fPct = f.cumulative !== null ? Math.round((f.cumulative / target) * 100) : null;
  const latest = last >= 0 ? (months[last].cumulative ?? 0) : 0;
  const remaining = Math.max(0, target - latest);
  const monthsLeft = 11 - Math.max(0, last);
  const avg = last >= 0 ? Math.round(latest / (last + 1)) : 0;
  const need = monthsLeft > 0 ? Math.round(remaining / monthsLeft) : remaining;
  const best = elapsed.reduce((b, m, i) => ((m.amount ?? 0) > (elapsed[b]?.amount ?? 0) ? i : b), 0);

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
      {Header}

      <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-semibold text-au-ink">{f.label}</span>
        <span className="text-au-muted tabular-nums">
          {f.cumulative !== null ? (
            <>
              shu oy {formatUZS(f.amount ?? 0)} · jami {formatUZS(f.cumulative)} · <b className="text-au-ink">{fPct}%</b> ·{' '}
            </>
          ) : null}
          reja {formatUZS(plannedAt(focus))}
        </span>
      </div>

      <div className="relative h-36">
        {/* B-nuqta line at its real height */}
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: h(target) }}>
          <div className="border-t-2 border-dashed border-au-accent" />
          <span className="absolute right-0 bottom-0.5 rounded-au-ctl bg-au-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-au-accent-text">
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
              aria-label={`${m.label}: reja ${plannedAt(i)}${m.cumulative !== null ? `, topildi ${m.cumulative}` : ''}`}
              className={cn('relative flex h-full flex-1 items-end rounded-[3px]', focus === i && 'bg-au-accent/5')}
            >
              {/* planned path to the B-nuqta */}
              <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] border border-dashed border-au-muted/50 bg-au-ink/[0.04]" style={{ height: h(plannedAt(i)) }} />
              {m.cumulative !== null && (
                <span
                  style={{ height: h(m.cumulative), ['--i' as string]: i }}
                  className={cn(
                    'ms-grow-y relative mx-[15%] w-[70%] rounded-t-[3px] transition-colors',
                    m.cumulative >= plannedAt(i) ? 'bg-au-ok' : i === last ? 'bg-au-accent' : 'bg-au-accent/55',
                  )}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 text-center text-[9px] text-au-muted">
        {months.map((m, i) => (
          <span key={m.label} className={cn('flex-1', i === last && 'font-bold text-au-accent-text')}>
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-au-muted">
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs border border-dashed border-au-muted" /> Reja (B-nuqta ÷ 12)
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs bg-au-accent" /> Topildi
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs bg-au-ok" /> Rejadan oldinda
        </span>
      </div>

      {/* Each month on its own: pay goes up and down with results */}
      <div className="flex gap-1 text-center text-[9px] tabular-nums text-au-muted" aria-label="Har oy topilgan">
        {months.map((m, i) => (
          <span key={m.label} className={cn('flex-1 truncate', i === best && m.amount ? 'font-bold text-au-ok' : '')} title={m.amount !== null ? formatUZS(m.amount) : undefined}>
            {m.amount !== null ? (m.amount >= 1_000_000 ? `${(m.amount / 1_000_000).toFixed(1)}m` : m.amount ? `${Math.round(m.amount / 1000)}k` : '0') : ''}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-au-muted">
        <span>
          Shu yil topildi: <b className="text-au-ink tabular-nums">{formatUZS(latest)}</b>
        </span>
        <span className="text-right">
          Qoldi: <b className="text-au-ink tabular-nums">{formatUZS(remaining)}</b>
        </span>
        <span>
          O‘rtacha oyiga: <b className="text-au-ink tabular-nums">{formatUZS(avg)}</b>
        </span>
        <span className="text-right">
          {remaining === 0 ? (
            <b className="text-au-ok">B-nuqtaga yetildi</b>
          ) : (
            <>
              {monthsLeft > 0 ? `Qolgan ${monthsLeft} oyda oyiga` : 'Kerak'}: <b className={cn('tabular-nums', need > avg ? 'text-au-bad' : 'text-au-ok')}>{formatUZS(need)}</b>
            </>
          )}
        </span>
      </div>
    </section>
  );
}
