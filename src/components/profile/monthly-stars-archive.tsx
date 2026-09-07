'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { MonthlyStarsArchiveEntry } from '@/lib/actions/stars';

const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

/**
 * Past months' star changes, stacked under StarBalanceCard — one collapsed
 * row per month, opened one at a time, mirroring the task board's
 * <MonthlyArchive>. The header carries the month's net change; opening it
 * breaks that into earned/spent and lists the ledger rows behind it.
 *
 * `months` is prepared server-side by getMonthlyStarsArchiveAction
 * (localized label and totals included), so this does no arithmetic beyond
 * choosing a colour per row.
 */
export function MonthlyStarsArchive({ months }: { months: MonthlyStarsArchiveEntry[] | null }) {
  const t = useTranslations('profile.starsArchive');
  const tStars = useTranslations('profile.stars');
  const format = useFormatter();
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  if (!months || months.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
        {t('title')}
      </h2>
      <div className="flex flex-col gap-2">
        {months.map((month) => {
          const isOpen = openMonth === month.monthKey;
          return (
            <div key={month.monthKey} className={cn(GLASS_CARD, 'overflow-hidden')}>
              <button
                type="button"
                onClick={() => setOpenMonth(isOpen ? null : month.monthKey)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
              >
                <span className="font-medium capitalize">{month.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-sm text-white/70">
                  <span
                    className={cn(
                      'font-semibold',
                      month.net < 0 ? 'text-red-300' : month.net > 0 ? 'text-emerald-300' : 'text-white/70',
                    )}
                  >
                    {t('net', { net: signed(month.net) })}
                  </span>
                  <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-white/15 px-4 py-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
                    <span>{t('earned', { count: month.earned })}</span>
                    <span>{t('spent', { count: month.spent })}</span>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {month.transactions.map((tx) => (
                      <li
                        key={tx.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white/5 px-3 py-2"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-white/90">
                            {tx.reason || tStars(`source.${tx.source_type}`)}
                          </span>
                          <span className="text-xs text-white/60">
                            {format.dateTime(new Date(tx.created_at), { dateStyle: 'medium' })}
                            {' · '}
                            {tStars(`source.${tx.source_type}`)}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 text-sm font-semibold',
                            tx.delta < 0 ? 'text-red-300' : 'text-emerald-300',
                          )}
                        >
                          {signed(tx.delta)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
