'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { AlarmClock, ArrowDownUp, CalendarDays, ChevronLeft, ChevronRight, Hourglass, LayoutGrid, ListTodo, PieChart, Rows3, Sun } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { boardLaneFor, type BoardLane } from '@/lib/task-status';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import type { Task } from './task-card';

export type TaskView = 'board' | 'list' | 'calendar' | 'report';

const VIEW_ICONS: Record<TaskView, typeof LayoutGrid> = {
  board: LayoutGrid,
  list: Rows3,
  calendar: CalendarDays,
  report: PieChart,
};

/** Segmented view switch; the active pill glides between options. */
export function TaskViewSwitch({ view, onChange, showReport }: { view: TaskView; onChange: (v: TaskView) => void; showReport: boolean }) {
  const t = useTranslations('tasks.views');
  const views: TaskView[] = showReport ? ['board', 'list', 'calendar', 'report'] : ['board', 'list', 'calendar'];
  return (
    <div role="tablist" aria-label={t('label')} className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1">
      {views.map((v) => {
        const Icon = VIEW_ICONS[v];
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn('relative inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold transition-colors', active ? 'text-au-ink' : 'text-au-muted hover:text-au-ink')}
          >
            {active && (
              <motion.span
                layoutId="task-view-pill"
                className="absolute inset-0 rounded-[8px] bg-au-card shadow-au-card"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className="relative size-4" aria-hidden />
            <span className="relative hidden sm:inline">{t(v)}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ stat strip */

export function TaskStatStrip({ tasks, now }: { tasks: Task[]; now: number | null }) {
  const t = useTranslations('tasks.strip');
  const today = tashkentDayKey();
  let active = 0;
  let dueToday = 0;
  let overdue = 0;
  let review = 0;
  for (const task of tasks) {
    const lane = boardLaneFor(task.status);
    if (lane === 'review') review += 1;
    if (lane !== 'pending' && lane !== 'in_progress') continue;
    active += 1;
    if (task.is_overdue || (now !== null && new Date(task.deadline).getTime() < now)) overdue += 1;
    else if (tashkentDayKey(new Date(task.deadline)) === today) dueToday += 1;
  }
  const items = [
    { key: 'active', value: active, icon: ListTodo, tone: 'text-au-ink' },
    { key: 'today', value: dueToday, icon: Sun, tone: dueToday ? 'text-au-accent-text' : 'text-au-ink' },
    { key: 'overdue', value: overdue, icon: AlarmClock, tone: overdue ? 'text-au-bad' : 'text-au-ink' },
    { key: 'review', value: review, icon: Hourglass, tone: review ? 'text-au-info' : 'text-au-ink' },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item, i) => (
        <div key={item.key} className={cn(SURFACE_CARD, 'ms-rise flex items-center gap-3 px-4 py-3')} style={{ ['--i' as string]: i }}>
          <item.icon className={cn('size-[18px] shrink-0', item.tone)} strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <div key={item.value} className={cn('lane-count text-xl leading-6 font-bold tabular-nums', item.tone)}>
              {item.value}
            </div>
            <div className="truncate text-xs text-au-muted">{t(item.key)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- workload */

/** CEO: open work per person, so overload is visible before assigning more. */
export function TaskWorkload({ tasks, onPick, picked }: { tasks: Task[]; onPick: (id: string) => void; picked: string }) {
  const t = useTranslations('tasks.workload');
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; open: number; overdue: number }>();
    for (const task of tasks) {
      const lane = boardLaneFor(task.status);
      if (lane !== 'pending' && lane !== 'in_progress') continue;
      const row = map.get(task.assigned_to) ?? {
        id: task.assigned_to,
        name: task.assignee ? `${task.assignee.first_name} ${task.assignee.last_name[0] ?? ''}.` : '—',
        open: 0,
        overdue: 0,
      };
      row.open += 1;
      if (task.is_overdue) row.overdue += 1;
      map.set(task.assigned_to, row);
    }
    return [...map.values()].sort((a, b) => b.open - a.open);
  }, [tasks]);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.open));
  return (
    <section className={cn(SURFACE_CARD, 'p-4')} aria-label={t('title')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-au-ink">{t('title')}</h2>
        <span className="text-xs text-au-muted">{t('hint')}</span>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r, i) => {
          const heavy = r.open >= 8 || r.overdue >= 3;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r.id)}
              aria-pressed={picked === r.id}
              className={cn('ms-rise flex items-center gap-3 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-au-card-2', picked === r.id && 'bg-au-accent-soft')}
              style={{ ['--i' as string]: Math.min(i, 8) }}
            >
              <span className="w-28 shrink-0 truncate text-[13px] font-medium text-au-ink">{r.name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-au-card-2">
                <span
                  className={cn('ms-fill block h-full rounded-full', heavy ? 'bg-au-bad' : r.open >= 5 ? 'bg-au-accent' : 'bg-au-ok')}
                  style={{ width: `${Math.max(8, (r.open / max) * 100)}%` }}
                />
              </span>
              <span className={cn('w-12 shrink-0 text-right text-xs font-bold tabular-nums', heavy ? 'text-au-bad' : 'text-au-muted')}>
                {r.open}
                {r.overdue > 0 && <span className="text-au-bad"> · {r.overdue}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- list view */

type SortKey = 'deadline' | 'title' | 'assignee' | 'status';
const LANE_ORDER: Record<BoardLane, number> = { pending: 0, in_progress: 1, review: 2, done: 3 };
const LANE_CHIP: Record<BoardLane, string> = {
  pending: 'bg-au-card-2 text-au-muted',
  in_progress: 'bg-au-info-soft text-au-info',
  review: 'bg-au-accent-soft text-au-accent-text',
  done: 'bg-au-ok-soft text-au-ok',
};

export function TaskListView({ tasks, isAdmin, onOpen }: { tasks: Task[]; isAdmin: boolean; onOpen: (id: string) => void }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'deadline', dir: 1 });
  const rows = useMemo(() => {
    const val = (task: Task): string | number => {
      switch (sort.key) {
        case 'title':
          return task.title.toLowerCase();
        case 'assignee':
          return task.assignee ? `${task.assignee.first_name} ${task.assignee.last_name}`.toLowerCase() : '';
        case 'status':
          return LANE_ORDER[boardLaneFor(task.status)];
        default:
          return task.deadline;
      }
    };
    return [...tasks].sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0));
  }, [tasks, sort]);

  const head = (key: SortKey, label: string, className?: string) => (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className={cn('inline-flex items-center gap-1 hover:text-au-ink', sort.key === key && 'text-au-ink')}
      >
        {label}
        <ArrowDownUp className={cn('size-3', sort.key !== key && 'opacity-40')} aria-hidden />
      </button>
    </th>
  );

  if (rows.length === 0) return <p className={cn(SURFACE_CARD, 'p-8 text-center text-sm text-au-muted')}>{t('noTasks')}</p>;

  return (
    <div className={cn(SURFACE_CARD, 'overflow-x-auto')}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-au-line text-xs text-au-muted">
          <tr>
            {head('title', t('list.title'))}
            {isAdmin && head('assignee', t('assignee'))}
            {head('deadline', t('deadline'))}
            {head('status', t('list.status'))}
            <th className="px-3 py-2.5 text-right font-semibold">★</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task, i) => {
            const lane = boardLaneFor(task.status);
            return (
              <tr
                key={task.id}
                tabIndex={0}
                onClick={() => onOpen(task.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
                className="ms-rise cursor-pointer border-b border-au-line last:border-0 hover:bg-au-card-2 focus-visible:bg-au-card-2 focus-visible:outline-none"
                style={{ ['--i' as string]: Math.min(i, 8) }}
              >
                <td className="max-w-[340px] px-3 py-2.5">
                  <span className="line-clamp-1 font-semibold text-au-ink">{task.title}</span>
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5 whitespace-nowrap text-au-muted">
                    {task.assignee ? `${task.assignee.first_name} ${task.assignee.last_name}` : '—'}
                  </td>
                )}
                <td className={cn('px-3 py-2.5 whitespace-nowrap tabular-nums', task.is_overdue && lane !== 'done' ? 'font-semibold text-au-bad' : 'text-au-muted')}>
                  {format.dateTime(new Date(task.deadline), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold', LANE_CHIP[lane])}>{t(`columns.${lane}`)}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-au-accent-text tabular-nums">{task.star_reward ? `+${task.star_reward}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- calendar view */

/** Month grid; each task sits on its deadline day (Tashkent). */
export function TaskCalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const t = useTranslations('tasks.calendar');
  const format = useFormatter();
  const today = tashkentDayKey();
  const [month, setMonth] = useState(today.slice(0, 7));

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = tashkentDayKey(new Date(task.deadline));
      if (!key.startsWith(month)) continue;
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks, month]);

  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  // Monday-first grid: back up to the Monday on/before the 1st.
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const start = addDaysToKey(first, -firstDow);
  const days = Array.from({ length: 42 }, (_, i) => addDaysToKey(start, i));
  const shift = (d: number) => {
    const date = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const weekdays = t.raw('weekdays') as string[];

  return (
    <section className={cn(SURFACE_CARD, 'p-3 sm:p-4')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-au-ink first-letter:uppercase">
          {format.dateTime(new Date(Date.UTC(y, m - 1, 15)), { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label={t('prev')} className="grid size-8 place-items-center rounded-[8px] text-au-muted hover:bg-au-card-2 hover:text-au-ink">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="h-8 rounded-[8px] px-2.5 text-xs font-semibold text-au-muted hover:bg-au-card-2 hover:text-au-ink">
            {t('today')}
          </button>
          <button type="button" onClick={() => shift(1)} aria-label={t('next')} className="grid size-8 place-items-center rounded-[8px] text-au-muted hover:bg-au-card-2 hover:text-au-ink">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-wide text-au-faint uppercase">
        {weekdays.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div key={month} className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const inMonth = day.startsWith(month);
          const list = byDay.get(day) ?? [];
          return (
            <div
              key={day}
              className={cn(
                'ms-wave flex min-h-[64px] flex-col gap-1 rounded-[10px] border p-1 sm:min-h-[96px] sm:p-1.5',
                inMonth ? 'border-au-line bg-au-card' : 'border-transparent bg-transparent opacity-45',
                day === today && 'border-au-accent ring-1 ring-au-accent',
              )}
              style={{ ['--i' as string]: (i % 7) + Math.floor(i / 7) }}
            >
              <span className={cn('text-right text-[11px] font-semibold tabular-nums', day === today ? 'text-au-accent-text' : 'text-au-muted')}>
                {Number(day.slice(8))}
              </span>
              {list.slice(0, 3).map((task) => {
                const lane = boardLaneFor(task.status);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpen(task.id)}
                    title={task.title}
                    className={cn(
                      'truncate rounded-[6px] px-1.5 py-0.5 text-left text-[11px] font-semibold',
                      task.is_overdue && lane !== 'done' ? 'bg-au-bad-soft text-au-bad' : LANE_CHIP[lane],
                    )}
                  >
                    {task.title}
                  </button>
                );
              })}
              {list.length > 3 && <span className="px-1 text-[10px] font-semibold text-au-muted">+{list.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
