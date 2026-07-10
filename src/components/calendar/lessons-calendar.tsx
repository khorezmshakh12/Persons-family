import { createClient } from '@/lib/supabase/server';
import { LessonsCalendarClient, type CalendarLesson } from './lessons-calendar-client';

type LessonRow = {
  id: string;
  lesson_date: string;
  topic: string | null;
  group: {
    id: string;
    name: string;
    teacher: { first_name: string; last_name: string } | null;
  } | null;
};

export async function LessonsCalendar() {
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
    .select(
      'id, lesson_date, topic, group:groups!course_lessons_group_id_fkey(id, name, teacher:profiles!groups_teacher_id_fkey(first_name, last_name))',
    )
    .not('lesson_date', 'is', null)
    .gte('lesson_date', startOfMonth.toISOString().slice(0, 10))
    .lt('lesson_date', endOfMonth.toISOString().slice(0, 10));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventsByDay: Record<number, CalendarLesson[]> = {};
  for (const row of (data as unknown as LessonRow[]) ?? []) {
    if (!row.group) continue;
    const day = new Date(`${row.lesson_date}T00:00:00Z`).getUTCDate();
    const bucket = eventsByDay[day] ?? [];
    bucket.push({
      id: row.id,
      groupId: row.group.id,
      groupName: row.group.name,
      teacherName: row.group.teacher ? `${row.group.teacher.first_name} ${row.group.teacher.last_name}` : null,
      topic: row.topic,
    });
    eventsByDay[day] = bucket;
  }

  // Monday-first grid, matching the uz/ru convention this app otherwise uses.
  const firstWeekday = (startOfMonth.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <LessonsCalendarClient
      year={year}
      month={month}
      cells={cells}
      eventsByDay={eventsByDay}
      today={now.getDate()}
    />
  );
}
