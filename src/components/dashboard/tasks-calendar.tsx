import { sql } from '@/lib/db/client';
import { TasksCalendarClient, type CalendarTask } from './tasks-calendar-client';

/** Personal-dashboard tier's replacement for the chat-activity
 * ActivityHeatmap — fully task-based (color and data both come from the
 * viewer's own tasks this month, no chat data involved), modeled on
 * LessonsCalendar's "click a day, see that day's items below" pattern. */
export async function TasksCalendar({ userId }: { userId: string }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1));

  const data = await sql<{ id: string; title: string; status: string; deadline: string }[]>`
    select id, title, status, deadline from tasks
    where assigned_to = ${userId}
      and deadline >= ${startOfMonth.toISOString()} and deadline < ${endOfMonth.toISOString()}
  `;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tasksByDay: Record<number, CalendarTask[]> = {};
  for (const row of data) {
    const day = new Date(row.deadline).getDate();
    const bucket = tasksByDay[day] ?? [];
    bucket.push({ id: row.id, title: row.title, status: row.status });
    tasksByDay[day] = bucket;
  }

  // Monday-first grid, matching the uz/ru convention this app otherwise uses.
  const firstWeekday = (startOfMonth.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <TasksCalendarClient year={year} month={month} cells={cells} tasksByDay={tasksByDay} today={now.getDate()} />
  );
}
