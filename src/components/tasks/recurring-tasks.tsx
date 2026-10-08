'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Repeat, X } from 'lucide-react';
import { stopTaskRecurrenceAction } from '@/lib/actions/tasks';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { nextDue, type Every } from '@/lib/task-recurrence';

export type Recurrence = { id: string; title: string; every: Every; due_time: string; last_due: string; assignee: string };

/** The assigner's active recurring tasks, each with its next deadline and a stop button. */
export function RecurringTasks({ items }: { items: Recurrence[] }) {
  const t = useTranslations('tasks.repeat');
  const [list, setList] = useState(items);
  const [busy, start] = useTransition();
  if (list.length === 0) return null;
  return (
    <section className={cn(SURFACE_CARD, 'p-4')} aria-label={t('listTitle')}>
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-au-ink">
        <Repeat className="size-4 text-au-accent-text" aria-hidden />
        {t('listTitle')}
        <span className="rounded-full bg-au-card-2 px-2 text-[11px] font-bold text-au-muted tabular-nums">{list.length}</span>
      </h2>
      <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r, i) => (
          <li key={r.id} className="ms-rise flex items-center gap-2 rounded-au-ctl bg-au-card-2 px-3 py-2" style={{ ['--i' as string]: Math.min(i, 8) }}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-au-ink">{r.title}</span>
              <span className="block truncate text-[11px] text-au-muted">
                {r.assignee} · {t(r.every)} · {t('next', { date: nextDue(r.last_due, r.every), time: r.due_time })}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              aria-label={t('stop')}
              title={t('stop')}
              onClick={() =>
                start(async () => {
                  const res = await stopTaskRecurrenceAction(r.id);
                  if (res?.error) return void toast.error(t('stopFailed'));
                  setList((l) => l.filter((x) => x.id !== r.id));
                  toast.success(t('stopped'));
                })
              }
              className="grid size-7 shrink-0 place-items-center rounded-full text-au-faint hover:bg-au-bad-soft hover:text-au-bad"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
