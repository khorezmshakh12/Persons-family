'use client';

import { useState, useTransition } from 'react';
import { Check, Plus, Target, X } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { addGoalAction, deleteGoalAction, toggleGoalAction } from '@/lib/actions/goals';

type Scope = 'day' | 'week' | 'month';
/** `carried`: the earlier period key of an unfinished goal brought forward. */
export type Goal = { id: string; scope: Scope; title: string; done: boolean; carried?: string | null };

const TABS: { k: Scope; n: string }[] = [
  { k: 'day', n: 'Kunlik' },
  { k: 'week', n: 'Haftalik' },
  { k: 'month', n: 'Oylik' },
];

/** Shaxsiy maqsadlar — kun/hafta/oy. Dashboardda, optimistik UI. */
export function GoalsCard({ periodKeys, goals: initial }: { periodKeys: Record<Scope, string>; goals: Goal[] }) {
  const [scope, setScope] = useState<Scope>('day');
  const [goals, setGoals] = useState<Goal[]>(initial);
  const [title, setTitle] = useState('');
  const [, start] = useTransition();
  const list = goals.filter((g) => g.scope === scope);

  const toggle = (id: string) => {
    const next = !goals.find((g) => g.id === id)?.done;
    setGoals((p) => p.map((g) => (g.id === id ? { ...g, done: next } : g)));
    start(() => void toggleGoalAction(id, next));
  };
  const add = () => {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    start(async () => {
      const res = await addGoalAction(scope, periodKeys[scope], t);
      if ('ok' in res && res.id) setGoals((p) => [...p, { id: res.id!, scope, title: t, done: false }]);
    });
  };
  const del = (id: string) => {
    setGoals((p) => p.filter((g) => g.id !== id));
    start(() => void deleteGoalAction(id));
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex min-w-0 flex-col gap-3 p-5')} aria-label="Maqsadlar">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <Target className="size-4" />
        </span>
        <h2 className="flex-1 text-base font-bold text-au-ink">Maqsadlar</h2>
      </div>
      <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setScope(t.k)}
            className={cn('h-7 flex-1 rounded-[7px] px-3 text-xs font-semibold transition-colors', scope === t.k ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
          >
            {t.n}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {list.map((g) => (
          <li key={g.id} className="group flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => toggle(g.id)}
              aria-pressed={g.done}
              className={cn('grid size-5 shrink-0 place-items-center rounded-md border transition-colors', g.done ? 'border-au-accent bg-au-accent text-white' : 'border-au-line bg-au-card hover:border-au-accent')}
            >
              {g.done && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('text-sm', g.done ? 'text-au-faint line-through' : 'text-au-ink')}>{g.title}</span>
              {g.carried && <span className="text-[11px] text-au-accent-text">↻ {g.carried} dan ko‘chdi</span>}
            </span>
            <button type="button" onClick={() => del(g.id)} aria-label="O'chirish" className="shrink-0 rounded-md p-1 text-au-faint opacity-0 transition hover:text-au-bad group-hover:opacity-100 focus-visible:opacity-100">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-au-muted">Bu davr uchun maqsad yo‘q.</li>}
      </ul>
      <div className="mt-1 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={160}
          placeholder="Yangi maqsad…"
          className="min-w-0 flex-1 rounded-au-ctl border border-au-line bg-au-card px-3 py-1.5 text-sm text-au-ink outline-none placeholder:text-au-faint focus:border-au-accent"
        />
        <button type="button" onClick={add} disabled={!title.trim()} aria-label="Qo‘shish" className="grid size-8 shrink-0 place-items-center rounded-au-ctl bg-au-accent text-white transition hover:opacity-90 disabled:opacity-40">
          <Plus className="size-4" />
        </button>
      </div>
    </section>
  );
}
