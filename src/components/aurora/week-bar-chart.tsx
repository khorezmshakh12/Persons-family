import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { CARD_LINK, CARD_TITLE, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { WeekBar } from '@/lib/aurora-dashboard';

/**
 * Six-day (Mon–Sat) bar chart. Past days: warm neutral; today: apricot
 * gradient with an ink tooltip; future days: hatched. Bar height is the
 * day's completion ratio (complete / total).
 */
export async function WeekBarChart({
  title,
  href,
  bars,
  className,
}: {
  title: string;
  href: string;
  bars: WeekBar[] | null;
  className?: string;
}) {
  const t = await getTranslations('aurora');
  const weekdays = t.raw('weekdays') as string[];

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)}>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h2 className={cn(CARD_TITLE, 'flex min-w-0 items-baseline gap-1.5')}>
          <span className="truncate">{title}</span>
          <small className="shrink-0 text-xs font-medium text-au-muted">· {t('thisWeek')}</small>
        </h2>
        <Link href={href} className={cn(CARD_LINK, 'shrink-0')}>
          {t('details')}
        </Link>
      </div>

      {!bars ? (
        <p className="py-10 text-center text-sm text-au-muted">{t('noData')}</p>
      ) : (
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
              <div key={bar.dayKey} className="relative z-10 flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    title={label}
                    className={cn(
                      'relative w-full rounded-[8px_8px_4px_4px]',
                      bar.isToday
                        ? 'bg-linear-to-b from-au-accent to-au-accent/55'
                        : bar.isFuture
                          ? 'au-hatch border border-dashed border-au-line'
                          : 'bg-au-chart-4',
                    )}
                    style={{ height: `${height}%` }}
                  >
                    {bar.isToday && (
                      <span className="absolute -top-[34px] left-1/2 -translate-x-1/2 rounded-md bg-au-primary px-2 py-1 text-xs font-bold whitespace-nowrap text-white tabular-nums after:absolute after:-bottom-1 after:left-1/2 after:size-2 after:-translate-x-1/2 after:rotate-45 after:bg-au-primary">
                        {label}
                      </span>
                    )}
                  </div>
                </div>
                <span className={cn('text-xs font-medium', bar.isToday ? 'text-au-ink' : 'text-au-muted')}>
                  {weekdays[bar.index]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
