'use client';

import { useState, type JSX } from 'react';
import { Target } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { formatUZS } from '@/lib/format-currency';
import { monthName } from '@/lib/bpoint';
import type { BpointGoalView } from '@/lib/bpoint-data';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { localizeMonths } from '@/lib/month-names';

/** B-nuqta sari: each month's OWN pay (bars, not a running total) against the
 * monthly B-nuqta line and the A-nuqta (first paid month) line, over the
 * goal's whole window (6 / 12 / 36 months); a month that has not come yet
 * has `amount: null`. */
export function BpointProgress({ goal }: { goal: BpointGoalView }): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const t = useTranslations('bpp');
  const th = useTranslations('bp.h');
  const locale = useLocale();
  const lm = (s: string) => localizeMonths(s, locale);
  const hLabel = th(goal.horizon);
  const { target, start, current, currentMonth } = goal.progress;
  const months = goal.bars;
  // 36 bars are too narrow for numbers on each and a label under each.
  const dense = months.length > 12;

  const Header = (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
        <Target className="size-4" />
      </span>
      <div className="flex-1">
        <h2 className="text-base font-bold text-au-ink">{t('title')}</h2>
        <p className="text-xs text-au-muted">
          {t('sub', { h: hLabel, from: lm(monthName(goal.start)), to: lm(monthName(goal.end)) })}{dense ? '' : t('subMln')}
        </p>
      </div>
    </div>
  );

  if (target <= 0) {
    return (
      <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
        {Header}
        <p className="text-sm text-au-muted">{t('notSet', { h: hLabel })}</p>
      </section>
    );
  }

  // Scale to the highest of target and any month, so an over-achiever's bar
  // is not cut off and the B-nuqta line sits at its true height.
  const top = Math.max(target, ...months.map((m) => m.amount ?? 0)) * 1.08;
  const h = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  // Bar labels in mln so'm (4 250 000 → "4.3"): with B-nuqta far above the
  // pay, bars of different months look alike, so each one carries its number.
  const mln = (v: number) => String(+(v / 1e6).toFixed(1));
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
        <span className="font-semibold text-au-ink">
          {lm(f.label)} 20{f.year}
        </span>
        <span className="text-au-muted tabular-nums">
          {f.amount !== null ? (
            <>
              {t('pay', { n: formatUZS(f.amount) })}
              {fPct !== null && (
                <>
                  {' '}
                  · <b className="text-au-ink">{t('ofB', { n: fPct })}</b>
                </>
              )}
            </>
          ) : (
            t('future')
          )}
        </span>
      </div>

      <div className="relative h-48">
        {/* B-nuqta line at its real height */}
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: h(target) }}>
          <div className="border-t-2 border-dashed border-au-ok" />
          <span className="absolute right-0 bottom-0.5 rounded-au-ctl bg-au-ok-soft px-1.5 py-0.5 text-[9px] font-semibold text-au-ok">
            {t('bLine', { n: formatUZS(target) })}
          </span>
        </div>
        {/* A-nuqta line */}
        {start > 0 && start < target && (
          <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: h(start) }}>
            <div className="border-t border-dotted border-au-muted" />
            <span className="absolute left-0 bottom-0.5 rounded-au-ctl bg-au-card px-1.5 py-0.5 text-[9px] font-semibold text-au-muted">
              {t('aLine', { n: formatUZS(start) })}
            </span>
          </div>
        )}

        <div className={cn('flex h-full items-end', dense ? 'gap-px' : 'gap-1')} onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${lm(m.label)} 20${m.year}: ${m.amount !== null ? t('pay', { n: m.amount }) : t('futureShort')}`}
              className={cn('relative flex h-full flex-1 items-end rounded-[3px]', focus === i && 'bg-au-accent/5')}
            >
              {m.amount === null ? (
                <span className="absolute inset-x-[15%] bottom-0 rounded-t-[3px] border border-dashed border-au-line" style={{ height: h(target) }} />
              ) : (
                <>
                  <span
                    style={{ height: h(m.amount), ['--i' as string]: i }}
                    className={cn(
                      'ms-grow-y relative mx-[15%] w-[70%] rounded-t-[3px] transition-colors',
                      m.amount >= target ? 'bg-au-ok' : i === currentMonth ? 'bg-au-accent' : 'bg-au-accent/55',
                    )}
                  />
                  {!dense && m.amount > 0 && (
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-x-0 mb-0.5 text-center text-[9px] leading-none whitespace-nowrap tabular-nums',
                        i === currentMonth ? 'font-bold text-au-accent-text' : 'text-au-muted',
                      )}
                      style={{ bottom: h(m.amount) }}
                    >
                      {mln(m.amount)}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('flex text-center text-[9px] text-au-muted', dense ? 'gap-px' : 'gap-1')}>
        {months.map((m, i) => (
          <span key={i} className={cn('flex-1 whitespace-nowrap', i === currentMonth && 'font-bold text-au-accent-text')}>
            {/* dense (36 oy): every 3rd month, with the year on January */}
            {!dense ? lm(m.label) : i % 3 === 0 ? (m.label === 'Yan' || i === 0 ? `${lm(m.label)}’${m.year}` : lm(m.label)) : ''}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-au-muted">
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs bg-au-accent" /> {t('lgPay')}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs bg-au-ok" /> {t('lgHit')}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-xs border border-dashed border-au-line" /> {t('lgFuture')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-au-muted">
        <span>
          {t('now')} <b className="text-au-ink tabular-nums">{current > 0 ? formatUZS(current) : '—'}</b>
        </span>
        <span className="text-right">
          {t('best')} <b className="text-au-ink tabular-nums">{best > 0 ? formatUZS(best) : '—'}</b>
        </span>
        <span>
          {t('avg')} <b className="text-au-ink tabular-nums">{avg > 0 ? formatUZS(avg) : '—'}</b>
        </span>
        <span className="text-right">
          {current >= target ? (
            <b className="text-au-ok">{t('reached')}</b>
          ) : (
            <>
              {t('need')} <b className="tabular-nums text-au-bad">{formatUZS(target - current)}</b>
            </>
          )}
        </span>
      </div>
    </section>
  );
}
