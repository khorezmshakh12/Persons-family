'use client';

import { useState, useTransition, type JSX } from 'react';
import { Check, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import { toggleTemplateTickAction } from '@/lib/actions/checklist-templates';

type Item = { id: string; title: string; done: boolean };

/** Compact dashboard widget summarising today's daily role-checklist.
 * Optimistic ticking, server-backed via toggleTemplateTickAction. */
export function DashboardChecklist({
  items,
  total,
  noLessonToday,
  href,
}: {
  items: Item[];
  total: number;
  doneCount: number;
  noLessonToday?: boolean;
  href: string;
}): JSX.Element {
  const [ticks, setTicks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.done])),
  );
  const [, start] = useTransition();

  const done = items.filter((i) => ticks[i.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = (id: string) => {
    const next = !ticks[id];
    setTicks((prev) => ({ ...prev, [id]: next }));
    start(async () => {
      const res = await toggleTemplateTickAction(id, 'daily', next);
      if ('error' in res) {
        setTicks((prev) => ({ ...prev, [id]: !next }));
        toast.error('Saqlanmadi. Qayta urinib ko‘ring.');
      }
    });
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex min-w-0 flex-col gap-3 p-5')} aria-label="Bugungi checklist">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <ListChecks className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-au-ink">Bugungi checklist</h2>
          <p className="text-xs text-au-muted">Kunlik rol vazifalaringiz</p>
        </div>
        {!noLessonToday && total > 0 && (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-au-muted">
            {done}/{total}
          </span>
        )}
      </div>

      {noLessonToday ? (
        <p className="text-sm text-au-muted">Bugun dars yo‘q — checklist shart emas.</p>
      ) : total === 0 ? (
        <p className="text-sm text-au-muted">Checklist topilmadi</p>
      ) : (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-au-line">
            <div className="h-full rounded-full bg-au-accent transition-all" style={{ width: `${pct}%` }} />
          </div>

          <ul className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
            {items.map((i) => {
              const checked = ticks[i.id];
              return (
                <li key={i.id} className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggle(i.id)}
                    aria-pressed={checked}
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                      checked
                        ? 'border-au-accent bg-au-accent text-white'
                        : 'border-au-line bg-au-card hover:border-au-accent',
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </button>
                  <span className={cn('flex-1 text-sm', checked ? 'text-au-faint line-through' : 'text-au-ink')}>
                    {i.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Link href={href} className="mt-1 text-xs font-semibold text-au-muted transition-colors hover:text-au-ink">
        Batafsil →
      </Link>
    </section>
  );
}
