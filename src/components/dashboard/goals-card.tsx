'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Target, X } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { addGoalAction, deleteGoalAction, editGoalAction, moveGoalAction, toggleGoalAction } from '@/lib/actions/goals';
import { NEXT_LABEL, carryLabel, dueChip, lastDayOfMonth, sortGoals, type GoalItem, type GoalScope } from '@/lib/goals';
import { addDaysToKey } from '@/lib/time';
import { GoalEditor } from './goal-editor';

type Scope = GoalScope;
type Quick = 'time' | 'none' | 'wed' | 'fri' | 'm15' | 'mend' | 'date';

const TABS: { k: Scope; n: string }[] = [
  { k: 'day', n: 'Kunlik' },
  { k: 'week', n: 'Haftalik' },
  { k: 'month', n: 'Oylik' },
];
const QUICKS: Record<Scope, [Quick, string][]> = {
  day: [['time', 'Soat'], ['none', 'Muddatsiz']],
  week: [['wed', 'Chorshanba'], ['fri', 'Juma'], ['date', 'Sana'], ['none', 'Muddatsiz']],
  month: [['m15', '15-sana'], ['mend', 'Oy oxiri'], ['date', 'Sana'], ['none', 'Muddatsiz']],
};
const CHIP = 'rounded-full px-[7px] py-px text-[11px] font-semibold tabular-nums';
const TONE = {
  neutral: 'bg-au-card-2 text-au-muted',
  soon: 'bg-au-accent-soft text-au-accent-text',
  late: 'bg-au-bad-soft text-au-bad',
  ok: 'bg-au-ok-soft text-au-ok',
};
const INPUT = 'rounded-au-ctl border border-au-line bg-au-card px-2.5 py-1.5 text-sm text-au-ink outline-none focus:border-au-accent';

/** 'HH:MM' and day key in Tashkent, read on the client only. */
function tashkentNow() {
  const iso = new Date(Date.now() + 5 * 3_600_000).toISOString();
  return { day: iso.slice(0, 10), clock: iso.slice(11, 16) };
}

/** Shaxsiy maqsadlar — kun/hafta/oy, muddat, ★, «→ Ertaga». Optimistik UI. */
export function GoalsCard({
  periodKeys,
  goals: initial,
  moved: initialMoved,
}: {
  periodKeys: Record<Scope, string>;
  goals: GoalItem[];
  moved: GoalItem[];
}) {
  const [scope, setScope] = useState<Scope>('day');
  const [goals, setGoals] = useState<GoalItem[]>(initial);
  const [moved, setMoved] = useState<GoalItem[]>(initialMoved);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(false);
  const [quick, setQuick] = useState<Quick>('time');
  const [time, setTime] = useState('18:00');
  const [date, setDate] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<GoalItem | null>(null);
  // The clock is only read after mount, so the server and the first client
  // render agree (deadline chips show "qoldi" from then on).
  const [now, setNow] = useState<{ day: string; clock: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, start] = useTransition();

  useEffect(() => {
    const tick = () => setNow(tashkentNow());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const list = sortGoals(goals.filter((g) => g.scope === scope));
  const movedHere = moved.filter((g) => g.scope === scope);
  const doneCount = list.filter((g) => g.done).length;
  const pct = list.length ? Math.round((doneCount / list.length) * 100) : 0;

  const pickScope = (s: Scope) => {
    setScope(s);
    setQuick(QUICKS[s][0][0]);
  };

  const dueFor = (): { dueDate: string | null; dueTime: string | null } => {
    const w = periodKeys.week;
    switch (quick) {
      case 'time':
        return { dueDate: periodKeys.day, dueTime: time || null };
      case 'wed':
        return { dueDate: addDaysToKey(w, 2), dueTime: null };
      case 'fri':
        return { dueDate: addDaysToKey(w, 4), dueTime: null };
      case 'm15':
        return { dueDate: `${periodKeys.month}-15`, dueTime: null };
      case 'mend':
        return { dueDate: lastDayOfMonth(periodKeys.month), dueTime: null };
      case 'date':
        return { dueDate: date || null, dueTime: null };
      default:
        return { dueDate: null, dueTime: null };
    }
  };

  const toggle = (id: string) => {
    const old = goals.find((g) => g.id === id);
    if (!old) return;
    const next = !old.done;
    setGoals((p) => p.map((g) => (g.id === id ? { ...g, done: next, doneAt: next ? tashkentNow().clock : null } : g)));
    start(async () => {
      const res = await toggleGoalAction(id, next).catch(() => ({ error: 'failed' }));
      if ('error' in res) {
        setGoals((p) => p.map((g) => (g.id === id ? old : g)));
        toast.error('Saqlab bo‘lmadi');
      }
    });
  };

  const add = () => {
    const t = title.trim();
    if (!t) return;
    const due = dueFor();
    const s = scope;
    const p = priority;
    setTitle('');
    setPriority(false);
    start(async () => {
      const res = await addGoalAction(s, periodKeys[s], t, { ...due, priority: p }).catch(() => ({ error: 'failed' }));
      if ('ok' in res && res.id) {
        const item: GoalItem = { id: res.id, scope: s, title: t, done: false, doneAt: null, dueDate: s === 'day' && !due.dueTime ? null : due.dueDate, dueTime: s === 'day' ? due.dueTime : null, priority: p, carry: 0, movedFrom: null };
        setGoals((prev) => [...prev, item]);
      } else {
        setTitle(t);
        toast.error('Qo‘shib bo‘lmadi');
      }
    });
  };

  const moveNext = (id: string) => {
    const old = goals.find((g) => g.id === id);
    if (!old) return;
    setGoals((p) => p.filter((g) => g.id !== id));
    start(async () => {
      const res = await moveGoalAction(id, 'next').catch(() => ({ error: 'failed' }));
      if ('error' in res) {
        setGoals((p) => [...p, old]);
        return void toast.error('Ko‘chirib bo‘lmadi');
      }
      const m = { ...old, carry: old.carry + 1, movedFrom: periodKeys[old.scope] };
      setMoved((p) => [...p, m]);
      setUndo(m);
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    });
  };

  /** `g` is the moved entry; it comes back with one carry fewer. */
  const moveBack = (g: GoalItem) => {
    setUndo(null);
    setMoved((p) => p.filter((x) => x.id !== g.id));
    setGoals((p) => [...p, { ...g, carry: Math.max(0, g.carry - 1), movedFrom: null }]);
    start(async () => {
      const res = await moveGoalAction(g.id, 'back').catch(() => ({ error: 'failed' }));
      if ('error' in res) {
        setGoals((p) => p.filter((x) => x.id !== g.id));
        setMoved((p) => [...p, g]);
        toast.error('Qaytarib bo‘lmadi');
      }
    });
  };

  const edit = (id: string, t: string, to: Scope) => {
    const old = goals.find((g) => g.id === id);
    setEditing(null);
    if (!old || (old.title === t && old.scope === to)) return;
    setGoals((p) => p.map((g) => (g.id === id ? { ...g, title: t, scope: to, ...(to === g.scope ? {} : { dueDate: null, dueTime: null, carry: 0 }) } : g)));
    start(async () => {
      const res = await (to === old.scope ? editGoalAction(id, t) : editGoalAction(id, t, to, periodKeys[to])).catch(() => ({ error: 'failed' }));
      if ('error' in res) {
        setGoals((p) => p.map((g) => (g.id === id ? old : g)));
        toast.error('Saqlab bo‘lmadi');
      }
    });
  };

  // Deleted at once; «Qaytarish» puts the same goal back as a new row.
  const del = (id: string) => {
    const old = goals.find((g) => g.id === id);
    if (!old) return;
    setGoals((p) => p.filter((g) => g.id !== id));
    start(async () => {
      const res = await deleteGoalAction(id).catch(() => ({ error: 'failed' }));
      if ('error' in res) {
        setGoals((p) => [...p, old]);
        return void toast.error('O‘chirib bo‘lmadi');
      }
      toast.success('Maqsad o‘chirildi', {
        duration: 5000,
        action: {
          label: 'Qaytarish',
          onClick: () =>
            start(async () => {
              const r = await addGoalAction(old.scope, periodKeys[old.scope], old.title, { dueDate: old.dueDate, dueTime: old.dueTime, priority: old.priority }).catch(() => ({ error: 'failed' }));
              if (!('ok' in r) || !r.id) return void toast.error('Qaytarib bo‘lmadi');
              if (old.done) await toggleGoalAction(r.id, true).catch(() => null);
              setGoals((p) => [...p, { ...old, id: r.id!, carry: 0, movedFrom: null }]);
            }),
        },
      });
    });
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex min-w-0 flex-col gap-3.5 p-5')} aria-label="Maqsadlar">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <Target className="size-4" />
        </span>
        <h2 className="flex-1 text-base font-bold text-au-ink">Maqsadlar</h2>
        <span className="text-[13px] text-au-muted tabular-nums">
          {doneCount} / {list.length} · {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
        <i className="block h-full rounded-full bg-au-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
      <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={scope === t.k}
            onClick={() => pickScope(t.k)}
            className={cn('h-7 flex-1 rounded-[7px] px-3 text-xs font-semibold transition-colors', scope === t.k ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
          >
            {t.n}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-1">
        {list.map((g) => {
          const chip = dueChip(g, now);
          return (
            <li key={g.id} className="group flex items-start gap-2.5 rounded-[10px] p-2 hover:bg-au-card-2">
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-pressed={g.done}
                aria-label="Bajarildi"
                className={cn('mt-px grid size-5 shrink-0 place-items-center rounded-md border-[1.5px] transition-colors', g.done ? 'border-au-accent bg-au-accent text-white' : 'border-au-line bg-au-card hover:border-au-accent')}
              >
                {g.done && <Check className="size-3.5" strokeWidth={3} />}
              </button>
              {editing === g.id ? (
                <GoalEditor title={g.title} scope={g.scope} onSave={(t, to) => edit(g.id, t, to)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]" onDoubleClick={() => setEditing(g.id)}>
                    <span className={cn('text-sm [overflow-wrap:anywhere]', g.done ? 'text-au-faint line-through' : 'text-au-ink')}>
                      {g.priority && <span className="text-[13px] text-au-accent">★ </span>}
                      {g.title}
                    </span>
                    {(!g.done || chip || (g.done && g.doneAt)) && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {chip && <span className={cn(CHIP, TONE[chip.tone])}>{chip.text}</span>}
                        {g.carry > 0 && !g.done && (
                          <span className={cn('text-[11px] font-semibold', g.carry >= 3 ? 'text-au-bad' : 'text-au-accent-text')}>{carryLabel(g.scope, g.carry)}</span>
                        )}
                        {g.done && g.doneAt && <span className={cn(CHIP, TONE.neutral)}>{g.doneAt} da bajarildi</span>}
                        {!g.done && (
                          <button
                            type="button"
                            onClick={() => moveNext(g.id)}
                            title={`${NEXT_LABEL[g.scope]} ko‘chirish`}
                            className="whitespace-nowrap rounded-full border border-au-line bg-au-card px-2 py-px text-[11px] font-semibold text-au-muted transition hover:border-au-accent hover:text-au-accent-text"
                          >
                            → {NEXT_LABEL[g.scope]}
                          </button>
                        )}
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => setEditing(g.id)} aria-label="Tahrirlash" className="shrink-0 rounded-md p-1 text-au-faint transition hover:text-au-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => del(g.id)} aria-label="O‘chirish" className="shrink-0 rounded-md p-1 text-au-faint transition hover:text-au-bad sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
                    <X className="size-3.5" />
                  </button>
                </>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="p-2 text-xs text-au-muted">Bu davr uchun maqsad yo‘q.</li>}
      </ul>

      {undo && (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-au-card-2 px-3 py-2 text-[13px]">
          <span className="min-w-0 flex-1 text-au-ink">
            «{undo.title}» {NEXT_LABEL[undo.scope].toLowerCase()} ko‘chirildi
          </span>
          <button type="button" onClick={() => moveBack(undo)} className="text-[13px] font-bold text-au-accent-text">
            Qaytarish
          </button>
        </div>
      )}

      {movedHere.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-dashed border-au-line pt-2.5">
          <span className="text-xs font-semibold text-au-muted">
            {NEXT_LABEL[scope]} ko‘chirilgan ({movedHere.length})
          </span>
          {movedHere.map((g) => (
            <span key={g.id} className="flex items-center gap-2 text-xs text-au-faint">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                → {g.title}
                {g.dueDate ? ' · muddat ham suriladi' : ''}
              </span>
              <button type="button" onClick={() => moveBack(g)} className="shrink-0 font-semibold text-au-accent-text hover:underline">
                Qaytarish
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-au-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            maxLength={160}
            placeholder="Yangi maqsad…"
            aria-label="Yangi maqsad"
            className={cn(INPUT, 'min-w-0 flex-1 placeholder:text-au-faint')}
          />
          <button
            type="button"
            aria-pressed={priority}
            onClick={() => setPriority((v) => !v)}
            title="Muhim"
            className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', priority ? 'border-au-accent bg-au-accent-soft text-au-accent-text' : 'border-au-line bg-au-card text-au-muted')}
          >
            ★ Muhim
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-au-muted">Muddat:</span>
          {QUICKS[scope].map(([k, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={quick === k}
              onClick={() => setQuick(k)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', quick === k ? 'border-au-accent bg-au-accent-soft text-au-accent-text' : 'border-au-line bg-au-card text-au-muted')}
            >
              {n}
            </button>
          ))}
          {scope === 'day' && quick === 'time' && (
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Soat" className={INPUT} />
          )}
          {quick === 'date' && (
            <input type="date" value={date} min={periodKeys.day} onChange={(e) => setDate(e.target.value)} aria-label="Sana" className={INPUT} />
          )}
          <button
            type="button"
            onClick={add}
            disabled={!title.trim()}
            className="ml-auto rounded-au-ctl bg-au-accent px-3.5 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Qo‘shish
          </button>
        </div>
        <span className="text-xs text-au-faint">Muddat ixtiyoriy. Kunlik maqsadda — soat, haftalik/oylikda — sana.</span>
      </div>
    </section>
  );
}
