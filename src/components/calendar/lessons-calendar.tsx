import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { LessonsCalendarClient, type CalendarLesson } from './lessons-calendar-client';

type LessonRow = {
  id: string;
  lesson_date: string;
  topic: string | null;
  group_id: string;
  group_name: string;
  teacher_first_name: string | null;
  teacher_last_name: string | null;
};

export async function LessonsCalendar() {
  const { user, profile } = await getAuthState();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1));

  // Ported from the old course_lessons_select RLS policy (pulled from the
  // live source DB, not guessed): ceo/head_teacher see everything, anyone
  // else only lessons for a group they own (teacher_id) or are the
  // assigned TA for — same scoping is_group_owner()/is_assigned_ta() gave
  // for free before, now baked into this query's WHERE clause instead.
  const canSeeAll = profile!.role === 'ceo' || profile!.role === 'head_teacher';

  const rows = await sql<LessonRow[]>`
    select
      cl.id, cl.lesson_date, cl.topic,
      g.id as group_id, g.name as group_name,
      t.first_name as teacher_first_name, t.last_name as teacher_last_name
    from course_lessons cl
    join groups g on g.id = cl.group_id
    left join profiles t on t.id = g.teacher_id
    where cl.lesson_date is not null
      and cl.lesson_date >= ${startOfMonth.toISOString().slice(0, 10)}
      and cl.lesson_date < ${endOfMonth.toISOString().slice(0, 10)}
      and (${canSeeAll} or g.teacher_id = ${user!.id} or g.assigned_ta_id = ${user!.id})
  `;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventsByDay: Record<number, CalendarLesson[]> = {};
  for (const row of rows) {
    const day = new Date(`${row.lesson_date}T00:00:00Z`).getUTCDate();
    const bucket = eventsByDay[day] ?? [];
    bucket.push({
      id: row.id,
      groupId: row.group_id,
      groupName: row.group_name,
      teacherName: row.teacher_first_name ? `${row.teacher_first_name} ${row.teacher_last_name}` : null,
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
