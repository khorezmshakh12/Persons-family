import 'server-only';
import { sql } from '@/lib/db/client';
import { addDaysToKey, tashkentDayKey, tashkentMonthKey } from '@/lib/time';
import { isTeacherRole, weekdayParity } from '@/lib/teacher-schedule';
import { loadChecklist } from '@/lib/checklist-data';
import { W_SHORT, type BoardDay, type BoardGoal, type GoalScope, type ProgressBoardData } from '@/lib/progress-board';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

/** Monday of the week a day key falls in (the goals' week key). */
const mondayOf = (key: string) => addDaysToKey(key, -((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7));

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * One person's month for the checklist + goals boards: their role's daily
 * checklist with every tick this month (and this week), and every goal open
 * or finished in that time. Off days are Sundays, and for teachers every day
 * without a lesson — the same rule the checklist and its report use.
 */
export async function loadProgressBoard(userId: string, role: string): Promise<ProgressBoardData> {
  const today = tashkentDayKey();
  const month = tashkentMonthKey();
  const monthStart = `${month}-01`;
  const monthEnd = lastDayOfMonth(month);
  const weekStart = mondayOf(today);
  const from = weekStart < monthStart ? weekStart : monthStart;
  const teacher = isTeacherRole(role);

  const [current, ticks, sched, goals] = await Promise.all([
    loadChecklist(userId, role),
    sql<{ template_id: string; period_key: string }[]>`
      select k.template_id, k.period_key from checklist_template_ticks k
      join checklist_templates t on t.id = k.template_id
      where k.user_id = ${userId} and t.role = ${role} and t.cadence = 'daily' and t.active
        and k.period_key >= ${from} and k.period_key <= ${monthEnd}`.catch(() => []),
    teacher
      ? sql<{ schedule_type: string }[]>`
          select distinct schedule_type from groups
          where (teacher_id = ${userId} or assigned_ta_id = ${userId}) and schedule_type is not null`.catch(() => [])
      : Promise.resolve([] as { schedule_type: string }[]),
    // Everything still open (it carries over) plus whatever was finished
    // from the first day on the board.
    sql<{ id: string; scope: GoalScope; title: string; period_key: string; created_day: string; done_day: string | null }[]>`
      select id, scope, title, period_key,
        to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as created_day,
        case when done then to_char(coalesce(done_at, created_at) at time zone 'Asia/Tashkent', 'YYYY-MM-DD') end as done_day
      from goals
      where user_id = ${userId}
        and (not done or coalesce(done_at, created_at) >= ${from}::date - interval '1 day')
      order by created_at desc
      limit 300`.catch(() => []),
  ]);

  const parities = new Set(sched.map((r) => r.schedule_type));
  const day = (key: string): BoardDay => {
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
    const p = weekdayParity(key);
    return { key, n: Number(key.slice(8, 10)), w: W_SHORT[dow], off: dow === 0 || (teacher && !(p && parities.has(p))) };
  };
  const days: BoardDay[] = [];
  for (let k = monthStart; k <= monthEnd; k = addDaysToKey(k, 1)) days.push(day(k));
  const week = Array.from({ length: 7 }, (_, i) => day(addDaysToKey(weekStart, i)));

  const periodStart = (g: { scope: GoalScope; period_key: string }) => (g.scope === 'month' ? `${g.period_key}-01` : g.period_key);
  const due = (g: { scope: GoalScope; period_key: string }) =>
    g.scope === 'day' ? g.period_key : g.scope === 'week' ? addDaysToKey(g.period_key, 6) : lastDayOfMonth(g.period_key);

  const board: BoardGoal[] = goals
    .reverse()
    .map((g) => {
      const start = periodStart(g);
      return {
        id: g.id,
        scope: g.scope,
        title: g.title,
        periodKey: g.period_key,
        startDay: g.created_day > start ? g.created_day : start,
        dueDay: due(g),
        doneDay: g.done_day,
      };
    })
    // Only goals that touch this month (or this week) belong on the board.
    .filter((g) => g.startDay <= monthEnd && (g.doneDay === null || g.doneDay >= from));

  return {
    today,
    editableFrom: addDaysToKey(today, -1),
    monthTitle: `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`,
    days,
    week,
    items: current.daily.map((r) => ({ id: r.id, title: r.title })),
    ticks: ticks.map((t) => `${t.template_id}|${t.period_key}`),
    weekly: { done: current.weekly.filter((r) => r.done).length, total: current.weekly.length },
    monthly: { done: current.monthly.filter((r) => r.done).length, total: current.monthly.length },
    goals: board,
    periodKeys: { day: today, week: weekStart, month },
  };
}
