'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CARD_LINK, CARD_TITLE, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { MonthBar, WeekBar } from '@/lib/aurora-dashboard';

type Bar = { key: string; label: string; complete: number; total: number; highlight: boolean; future: boolean };

/**
 * Completion bar chart with a Week / Months toggle.
 * Week: Mon–Sat, past days neutral, today apricot with an ink tooltip,
 * future days hatched. Months: the last 6 months, current month apricot.
 * Bar height is the completion ratio (complete / total).
 */
export function WeekBarChart({
  title,
  href,
  week,
  months,
  className,
}: {
  title: string;
  href: string;
  week: WeekBar[] | null;
  months: MonthBar[] | null;
  className?: string;
}) {
  const t = useTranslations('aurora');
  const locale = useLocale();
  const [mode, setMode] = useState<'week' | 'months'>('week');
  const weekdays = t.raw('weekdays') as string[];
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });

  const bars: Bar[] | null =
    mode === 'week'
      ? (week?.map((b) => ({
          key: b.dayKey,
          label: weekdays[b.index],
          complete: b.complete,
          total: b.total,
          highlight: b.isToday,
          future: b.isFuture,
        })) ?? null)
      : (months?.map((m) => {
          const [y, mo] = m.monthKey.split('-').map(Number);
          return {
            key: m.monthKey,
            label: monthFmt.format(new Date(Date.UTC(y, mo - 1, 15))),
            complete: m.complete,
            total: m.total,
            highlight: m.isCurrent,
            future: false,
          };
        }) ?? null);

  const sum = bars?.reduce((acc, b) => ({ complete: acc.complete + b.complete, total: acc.total + b.total }), {
    complete: 0,
    total: 0,
  });
  const b = (chunks: ReactNode) => <b className="font-semibold text-au-ink">{chunks}</b>;

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className={cn(CARD_TITLE, 'flex min-w-0 items-baseline gap-1.5')}>
          <span className="truncate">{title}</span>
          <small className="shrink-0 text-xs font-medium text-au-muted">
            · {mode === 'week' ? t('thisWeek') : t('lastMonths')}
          </small>
        </h2>
        <div className="flex items-center gap-3">
          <div role="tablist" className="inline-flex gap-0.5 rounded-[9px] border border-au-line bg-au-card-2 p-[3px]">
            {(['week', 'months'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md px-2.5 py-[3px] text-xs font-semibold transition-colors duration-150',
                  mode === m ? 'bg-au-card text-au-ink shadow-sm' : 'text-au-muted hover:text-au-ink',
                )}
              >
                {m === 'week' ? t('week') : t('months')}
              </button>
            ))}
          </div>
          <Link href={href} className={cn(CARD_LINK, 'shrink-0')}>
            {t('details')}
          </Link>
        </div>
      </div>

      {!bars ? (
        <p className="py-10 text-center text-sm text-au-muted">{t('noData')}</p>
      ) : (
        <>
          <div className="relative flex h-[170px] items-end gap-2.5 pt-[30px] sm:gap-3.5">
            {[0, 1, 2].map((g) => (
              <span
                key={g}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-au-line"
                style={{ top: 30 + g * 46 }}
              />
            ))}
            {bars.map((bar) => {
              const ratio = bar.total > 0 ? bar.complete / bar.total : 0;
              const height = bar.total > 0 ? Math.max(8, ratio * 100) : 8;
              const label = t('lessonTooltip', { complete: bar.complete, total: bar.total });
              return (
                <div key={bar.key} className="relative z-10 flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={label}
                      className={cn(
                        'relative w-full rounded-[8px_8px_4px_4px]',
                        bar.highlight
                          ? 'bg-linear-to-b from-au-accent to-au-accent/55'
                          : bar.future
                            ? 'au-hatch border border-dashed border-au-line'
                            : 'bg-au-chart-4',
                      )}
                      style={{ height: `${height}%` }}
                    >
                      {bar.highlight && (
                        <span className="absolute -top-[34px] left-1/2 -translate-x-1/2 rounded-md bg-au-primary px-2 py-1 text-xs font-bold whitespace-nowrap text-white tabular-nums after:absolute after:-bottom-1 after:left-1/2 after:size-2 after:-translate-x-1/2 after:rotate-45 after:bg-au-primary">
                          {label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={cn('text-xs font-medium', bar.highlight ? 'text-au-ink' : 'text-au-muted')}>
                    {bar.label}
                  </span>
                </div>
              );
            })}
          </div>
          {sum && (
            <p className="mt-3 text-xs text-au-muted tabular-nums">
              {t.rich('chartTotal', { complete: sum.complete, total: sum.total, b })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
