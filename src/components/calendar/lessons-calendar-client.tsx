'use client';

import { useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type CalendarLesson = {
  id: string;
  groupId: string;
  groupName: string;
  teacherName: string | null;
  topic: string | null;
};

export function LessonsCalendarClient({
  year,
  month,
  cells,
  eventsByDay,
  today,
}: {
  year: number;
  month: number;
  cells: (number | null)[];
  eventsByDay: Record<number, CalendarLesson[]>;
  today: number | null;
}) {
  const t = useTranslations('calendar');
  const format = useFormatter();
  const [selectedDay, setSelectedDay] = useState<number | null>(today);

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(2024, 0, 1 + i), { weekday: 'short' }),
  );

  const hasAnyLessons = Object.keys(eventsByDay).length > 0;
  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('monthTitle')}</h2>
        <span className="text-xs font-medium text-white/60 capitalize">
          {format.dateTime(new Date(year, month, 1), { month: 'long', year: 'numeric' })}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekdayLabels.map((label, i) => (
          <span key={i} className="text-center text-[11px] font-medium text-white/50 capitalize">
            {label}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />;
          const events = eventsByDay[day] ?? [];
          const isSelected = day === selectedDay;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                'tap-scale flex min-h-16 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ease-bounce hover:scale-[1.04]',
                isSelected ? 'border-teal-300/70 bg-teal-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
                day === today && !isSelected && 'ring-2 ring-teal-300/40',
              )}
            >
              <span className="text-xs font-medium text-white/70">{day}</span>
              {events.length > 0 && (
                <span className="rounded-full bg-teal-400/25 px-1.5 py-0.5 text-[10px] font-semibold text-teal-100">
                  {events.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!hasAnyLessons && <p className="text-xs text-white/50">{t('noLessonsThisMonth')}</p>}

      {selectedDay && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <h3 className="text-sm font-semibold text-white">
            {t('lessonsOnDay', {
              date: format.dateTime(new Date(year, month, selectedDay), { day: 'numeric', month: 'long' }),
            })}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-xs text-white/50">{t('noLessonsThisDay')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/lesson-plans/${event.groupId}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
                >
                  <span className="text-sm font-medium text-white">{event.groupName}</span>
                  {event.teacherName && <span className="text-xs text-white/60">{event.teacherName}</span>}
                  {event.topic && <span className="text-xs text-white/50">{event.topic}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
