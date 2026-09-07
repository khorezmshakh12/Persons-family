'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { ArchivedIssueRow, MonthlyIssueArchiveEntry } from '@/lib/actions/issues';

/**
 * Past months' resolved issues, stacked under the board — the Issues twin of
 * tasks/monthly-archive.tsx. The board itself only carries open issues plus
 * recently-resolved ones; everything older is here, one collapsed row per
 * month, opened one at a time.
 *
 * `months` is prepared server-side by getMonthlyIssueArchiveAction (including
 * the already-localized month label and the per-month counts) with the same
 * caller scoping the board uses, so this component does no date math beyond
 * formatting a single resolved-at instant.
 */
export function MonthlyIssueArchive({ months }: { months: MonthlyIssueArchiveEntry[] | null }) {
  const t = useTranslations('issues.archive');
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
                  <span>{t('resolved', { count: month.counts.resolved })}</span>
                  <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-white/15 px-4 py-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
                    <span>{t('resolved', { count: month.counts.resolved })}</span>
                    <span>{t('raised', { count: month.counts.raisedInMonth })}</span>
                  </div>

                  {month.issues.length === 0 ? (
                    <p className="text-sm text-white/60">{t('noIssues')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {month.issues.map((issue) => (
                        <ArchivedIssue
                          key={issue.id}
                          issue={issue}
                          resolvedLabel={
                            issue.resolved_at
                              ? format.dateTime(new Date(issue.resolved_at), { dateStyle: 'medium' })
                              : null
                          }
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const fullName = (person: { first_name: string; last_name: string } | null) =>
  person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : '';

function ArchivedIssue({
  issue,
  resolvedLabel,
}: {
  issue: ArchivedIssueRow;
  resolvedLabel: string | null;
}) {
  const t = useTranslations('issues.archive');
  const reporter = fullName(issue.reporter);
  const assignee = fullName(issue.assignee);

  const meta = [
    reporter ? t('reportedBy', { name: reporter }) : null,
    assignee ? t('assignedTo', { name: assignee }) : null,
    resolvedLabel ? t('resolvedOn', { date: resolvedLabel }) : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-2">
      <span className="text-sm font-medium break-words">{issue.title}</span>
      {meta.length > 0 && <span className="text-xs text-white/60">{meta.join(' · ')}</span>}
    </li>
  );
}
