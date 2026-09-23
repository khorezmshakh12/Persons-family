'use client';

import { useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type CalendarTask = {
  id: string;
  title: string;
  status: string;
};

function intensityClass(count: number, max: number) {
  if (count === 0) return 'border-au-line bg-au-card-2';
  const ratio = count / max;
  if (ratio > 0.75) return 'border-orange-400/50 bg-orange-500/60';
  if (ratio > 0.5) return 'border-orange-400/40 bg-orange-500/35';
  if (ratio > 0.25) return 'border-orange-400/30 bg-orange-500/20';
  return 'border-orange-400/20 bg-orange-500/10';
}

export function TasksCalendarClient({
  year,
  month,
  cells,
  tasksByDay,
  today,
}: {
  year: number;
  month: number;
  cells: (number | null)[];
  tasksByDay: Record<number, CalendarTask[]>;
  today: number | null;
}) {
  const t = useTranslations('dashboard.tasksCalendar');
  const tTasks = useTranslations('tasks');
  const format = useFormatter();
  const [selectedDay, setSelectedDay] = useState<number | null>(today);

  // Jan 1 2024 was a Monday — a stable Monday to read each weekday's
  // locale-correct label off, in Mon..Sun order. Built as a UTC instant and
  // formatted in UTC: `new Date(2024, 0, 1)` is the *viewer's* local midnight,
  // which the Tashkent-pinned formatter can push onto the previous day (and
  // the whole label row one weekday out) for anyone east of Tashkent.
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(Date.UTC(2024, 0, 1 + i)), { weekday: 'short', timeZone: 'UTC' }),
  );

  const maxCount = Math.max(...Object.values(tasksByDay).map((tasks) => tasks.length), 1);
  const hasAnyTasks = Object.keys(tasksByDay).length > 0;
  const selectedTasks = selectedDay ? (tasksByDay[selectedDay] ?? []) : [];

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-au-ink">{t('title')}</h2>
        <span className="text-xs font-medium text-au-muted capitalize">
          {format.dateTime(new Date(Date.UTC(year, month, 1)), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekdayLabels.map((label, i) => (
          <span key={i} className="text-center text-[11px] font-medium text-au-muted capitalize">
            {label}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />;
          const tasks = tasksByDay[day] ?? [];
          const isSelected = day === selectedDay;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                'tap-scale flex min-h-16 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ease-bounce',
                intensityClass(tasks.length, maxCount),
                isSelected && 'border-au-faint ring-2 ring-au-faint',
                day === today && !isSelected && 'ring-2 ring-au-faint',
              )}
            >
              <span className="text-xs font-medium text-au-ink">{day}</span>
              {tasks.length > 0 && (
                <span className="rounded-full bg-au-card-2 px-1.5 py-0.5 text-[10px] font-semibold text-au-ink">
                  {tasks.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!hasAnyTasks && <p className="text-xs text-au-muted">{t('noTasksThisMonth')}</p>}

      {selectedDay && (
        <div className="flex flex-col gap-2 border-t border-au-line pt-4">
          <h3 className="text-sm font-semibold text-au-ink">
            {t('tasksOnDay', {
              // Same reason as the weekday labels above: the year/month/day
              // are already Tashkent calendar parts, so they must be rendered
              // as a UTC instant, not re-interpreted through a second zone.
              date: format.dateTime(new Date(Date.UTC(year, month, selectedDay)), {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }),
            })}
          </h3>
          {selectedTasks.length === 0 ? (
            <p className="text-xs text-au-muted">{t('noTasksThisDay')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedTasks.map((task) => (
                <Link
                  key={task.id}
                  href="/tasks"
                  className="flex items-center justify-between gap-2 rounded-lg border border-au-line bg-au-card-2 px-3 py-2 transition-colors hover:bg-au-card-2"
                >
                  <span className="text-sm font-medium text-au-ink">{task.title}</span>
                  <span className="shrink-0 text-xs text-au-muted">{tTasks(`status.${task.status}`)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
