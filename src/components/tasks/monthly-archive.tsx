'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { ArchivedTaskRow, MonthlyTaskArchiveEntry } from '@/lib/actions/tasks';

/**
 * Past months' completed tasks, stacked under the board (spec #5). The board
 * only carries active tasks plus this month's completions — everything older
 * is here, one collapsed row per month, opened one at a time.
 *
 * `months` is prepared server-side by getMonthlyTaskArchiveAction (including
 * the already-localized month label), so this component does no date math
 * beyond deciding whether a single task landed on time.
 */
export function MonthlyArchive({
  months,
  isAdmin,
}: {
  months: MonthlyTaskArchiveEntry[];
  isAdmin: boolean;
}) {
  const t = useTranslations('tasks.archive');
  const format = useFormatter();
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  if (months.length === 0) return null;

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
                  <span>{t('efficiency', { pct: month.stats.efficiencyPct })}</span>
                  <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-white/15 px-4 py-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
                    <span>{t('totalDue', { count: month.stats.totalDue })}</span>
                    <span>{t('onTime', { count: month.stats.doneOnTime })}</span>
                    <span>{t('late', { count: month.stats.doneLate })}</span>
                    <span>{t('notDone', { count: month.stats.notDone })}</span>
                  </div>

                  {month.tasks.length === 0 ? (
                    <p className="text-sm text-white/60">{t('noTasks')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {month.tasks.map((task) => (
                        <ArchivedTask
                          key={task.id}
                          task={task}
                          isAdmin={isAdmin}
                          completedLabel={
                            task.completed_at
                              ? format.dateTime(new Date(task.completed_at), { dateStyle: 'medium' })
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

function ArchivedTask({
  task,
  isAdmin,
  completedLabel,
}: {
  task: ArchivedTaskRow;
  isAdmin: boolean;
  completedLabel: string | null;
}) {
  const t = useTranslations('tasks.archive');
  // Same rule the weekly bot scores on: on time = finished at or before the
  // deadline instant, not merely on the deadline's calendar day.
  const isLate = task.completed_at
    ? new Date(task.completed_at).getTime() > new Date(task.deadline).getTime()
    : false;
  const assignee = [task.assignee_first_name, task.assignee_last_name].filter(Boolean).join(' ');

  return (
    <li className="flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{task.title}</span>
        <Badge
          variant="tint"
          tint={isLate ? 'amber' : 'green'}
          className="shrink-0 text-[10px] tracking-wide uppercase"
        >
          {isLate ? t('lateBadge') : t('onTimeBadge')}
        </Badge>
      </div>
      <span className="text-xs text-white/60">
        {isAdmin && assignee && <span>{assignee} · </span>}
        {completedLabel ? t('completedOn', { date: completedLabel }) : null}
      </span>
    </li>
  );
}
