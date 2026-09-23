'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { MonthlyWarningsArchiveEntry } from '@/lib/actions/warnings';

/**
 * Past months' warnings, stacked under WarningsCard — one collapsed row per
 * month, opened one at a time, mirroring the task board's <MonthlyArchive>.
 *
 * `months` is prepared server-side by getMonthlyWarningsArchiveAction
 * (including the already-localized month label and the count), so this does
 * no date math beyond formatting each warning's own timestamp.
 */
export function MonthlyWarningsArchive({ months }: { months: MonthlyWarningsArchiveEntry[] | null }) {
  const t = useTranslations('profile.warningsArchive');
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
                  <span>{t('count', { count: month.count })}</span>
                  <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-2 border-t border-white/15 px-4 py-3">
                  {month.warnings.map((warning) => (
                    <div key={warning.id} className="flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-2">
                      <span className="text-xs text-white/60">
                        {format.dateTime(new Date(warning.created_at), { dateStyle: 'medium' })}
                        {warning.issuer_first_name && (
                          <>
                            {' · '}
                            {t('issuedBy', {
                              name: `${warning.issuer_first_name} ${warning.issuer_last_name ?? ''}`.trim(),
                            })}
                          </>
                        )}
                      </span>
                      <p className="text-sm whitespace-pre-wrap text-white/90">{warning.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
