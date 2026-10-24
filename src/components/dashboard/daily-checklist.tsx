'use client';

import { useState, useTransition } from 'react';
import { Check, Plus, X, ListChecks } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { addChecklistItemAction, deleteChecklistItemAction, toggleChecklistAction } from '@/lib/actions/checklist';

export type ChecklistItem = { id: string; title: string; done: boolean };

/** Per-employee daily checklist on the dashboard. Items repeat every day;
 * ticking one records today's completion. Optimistic UI, server-backed. */
export function DailyChecklist({ items: initial }: { items: ChecklistItem[] }) {
  const [items, setItems] = useState<ChecklistItem[]>(initial);
  const [title, setTitle] = useState('');
  const [, start] = useTransition();

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = (id: string) => {
    const next = !items.find((i) => i.id === id)?.done;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: next } : i)));
    start(() => {
      void toggleChecklistAction(id, next);
    });
  };

  const add = () => {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    start(async () => {
      const res = await addChecklistItemAction(t);
      if ('ok' in res && res.id) setItems((prev) => [...prev, { id: res.id!, title: t, done: false }]);
    });
  };

  const del = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    start(() => {
      void deleteChecklistItemAction(id);
    });
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex min-w-0 flex-col gap-3 p-5')} aria-label="Kunlik checklist">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <ListChecks className="size-4" />
        </span>
        <h2 className="flex-1 text-base font-bold text-au-ink">Bugungi checklist</h2>
        {total > 0 && (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-au-muted">
            {done}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-au-line">
          <div className="h-full rounded-full bg-au-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i.id} className="group flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => toggle(i.id)}
              aria-pressed={i.done}
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                i.done ? 'border-au-accent bg-au-accent text-white' : 'border-au-line bg-au-card hover:border-au-accent',
              )}
            >
              {i.done && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            <span className={cn('flex-1 text-sm', i.done ? 'text-au-faint line-through' : 'text-au-ink')}>{i.title}</span>
            <button
              type="button"
              onClick={() => del(i.id)}
              aria-label="O'chirish"
              className="shrink-0 rounded-md p-1 text-au-faint opacity-0 transition hover:text-au-bad group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {total === 0 && <li className="text-xs text-au-muted">Hali band yo‘q. Kunlik vazifalaringizni qo‘shing.</li>}
      </ul>

      <div className="mt-1 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={120}
          placeholder="Yangi band…"
          className="min-w-0 flex-1 rounded-au-ctl border border-au-line bg-au-card px-3 py-1.5 text-sm text-au-ink outline-none placeholder:text-au-faint focus:border-au-accent"
        />
        <button
          type="button"
          onClick={add}
          disabled={!title.trim()}
          aria-label="Qo‘shish"
          className="grid size-8 shrink-0 place-items-center rounded-au-ctl bg-au-accent text-white transition hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </section>
  );
}
