import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type LessonRow = { lesson_date: string; group: { id: string; name: string } | null };

export async function LessonsCalendar() {
  const t = await getTranslations('calendar');
  const format = await getFormatter();
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1));

  // RLS on course_lessons already scopes this to what the viewer can see —
  // their own groups for a teacher, assigned group for a TA, everything for
  // an admin — so the calendar is naturally "my schedule" without any extra
  // filtering here.
  const { data } = await supabase
    .from('course_lessons')
    .select('lesson_date, group:groups!course_lessons_group_id_fkey(id, name)')
    .not('lesson_date', 'is', null)
    .gte('lesson_date', startOfMonth.toISOString().slice(0, 10))
    .lt('lesson_date', endOfMonth.toISOString().slice(0, 10));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventsByDay = new Map<number, { groupId: string; groupName: string }[]>();
  for (const row of (data as unknown as LessonRow[]) ?? []) {
    if (!row.group) continue;
    const day = new Date(`${row.lesson_date}T00:00:00Z`).getUTCDate();
    const bucket = eventsByDay.get(day) ?? [];
    if (!bucket.some((e) => e.groupId === row.group!.id)) {
      bucket.push({ groupId: row.group.id, groupName: row.group.name });
    }
    eventsByDay.set(day, bucket);
  }

  // Monday-first grid, matching the uz/ru convention this app otherwise uses.
  const firstWeekday = (startOfMonth.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(2024, 0, 1 + i), { weekday: 'short' }),
  );

  const today = now.getDate();
  const hasAnyLessons = eventsByDay.size > 0;

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('monthTitle')}</h2>
        <span className="text-xs font-medium text-white/60 capitalize">
          {format.dateTime(now, { month: 'long', year: 'numeric' })}
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
          const events = eventsByDay.get(day) ?? [];
          return (
            <div
              key={i}
              className={cn(
                'flex min-h-20 flex-col gap-1 rounded-lg border border-white/10 bg-white/5 p-1.5',
                day === today && 'ring-2 ring-teal-300/70',
              )}
            >
              <span className="text-xs font-medium text-white/70">{day}</span>
              <div className="flex flex-col gap-1">
                {events.slice(0, 2).map((event) => (
                  <Link
                    key={event.groupId}
                    href={`/lesson-plans/${event.groupId}`}
                    title={event.groupName}
                    className="truncate rounded-md bg-teal-400/20 px-1.5 py-0.5 text-[10px] font-medium text-teal-100 transition-colors hover:bg-teal-400/30"
                  >
                    {event.groupName}
                  </Link>
                ))}
                {events.length > 2 && (
                  <span className="text-[10px] text-white/50">
                    {t('more', { count: events.length - 2 })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!hasAnyLessons && <p className="text-xs text-white/50">{t('noLessonsThisMonth')}</p>}
    </div>
  );
}
