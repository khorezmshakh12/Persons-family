import { sql } from '@/lib/db/client';
import { TasksCalendarClient, type CalendarTask } from './tasks-calendar-client';

/** Personal-dashboard tier's replacement for the chat-activity
 * ActivityHeatmap — fully task-based (color and data both come from the
 * viewer's own tasks this month, no chat data involved), modeled on
 * LessonsCalendar's "click a day, see that day's items below" pattern. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no DST

export async function TasksCalendar({ userId }: { userId: string }) {
  // Calendar month + "today" in Asia/Tashkent, not the server's UTC clock —
  // during the first ~5 hours of a Tashkent day a UTC-derived date is a day
  // behind (and on the 1st, a whole month behind).
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
  const [year, mm, todayDate] = fmt.format(new Date()).split('-').map(Number);
  const month = mm - 1;
  const startOfMonth = new Date(Date.UTC(year, month, 1) - TASHKENT_OFFSET_MS);
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1) - TASHKENT_OFFSET_MS);

  const data = await sql<{ id: string; title: string; status: string; deadline: string }[]>`
    select id, title, status, deadline from tasks
    where assigned_to = ${userId}
      and deadline >= ${startOfMonth.toISOString()} and deadline < ${endOfMonth.toISOString()}
  `;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const tasksByDay: Record<number, CalendarTask[]> = {};
  for (const row of data) {
    const day = Number(fmt.format(new Date(row.deadline)).split('-')[2]);
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
    <TasksCalendarClient year={year} month={month} cells={cells} tasksByDay={tasksByDay} today={todayDate} />
  );
}
