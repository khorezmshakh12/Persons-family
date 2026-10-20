import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentDayKey, addDaysToKey } from '@/lib/time';
import { isTeacherRole, weekdayParity, teacherIdsWithLessonOn } from '@/lib/teacher-schedule';
import { loadChecklist } from '@/lib/checklist-data';

/**
 * Statistics for the role-based daily checklist — the numbers the old Task
 * Tracker ("Quiet Progress OS") used to show: today's completion, a 7-day bar
 * chart, a 30-day trend, and a day streak, all over the DAILY cadence (the
 * only one that recurs often enough to trend). Weekly/monthly cadences are
 * reported as their current-period done/total.
 *
 * Teacher gating mirrors the checklist itself: a teacher/assistant day with no
 * lesson (Sunday, or the wrong odd/even rotation) is NOT a 0% day — it is
 * skipped entirely, so an off day never dents the streak or the average. The
 * group schedule is read once and the parity is computed per day locally, so
 * a 30-day window costs one extra query, not thirty.
 */
export type DayStat = { date: string; done: number; total: number; pct: number; lesson: boolean };
export type ChecklistStats = {
  dailyTotal: number;
  today: { done: number; total: number; pct: number; lesson: boolean };
  week: DayStat[]; // last 7 days, oldest → newest
  trend: DayStat[]; // last 30 days, oldest → newest
  streak: number;
  weekly: { done: number; total: number };
  monthly: { done: number; total: number };
};

const TREND_DAYS = 30;

export async function loadChecklistStats(userId: string, role: string): Promise<ChecklistStats> {
  const todayKey = tashkentDayKey();
  const startKey = addDaysToKey(todayKey, -(TREND_DAYS - 1));
  const teacher = isTeacherRole(role);

  const [cur, hist, schedRows] = await Promise.all([
    loadChecklist(userId, role),
    sql<{ period_key: string; done: number }[]>`
      select k.period_key, count(*)::int as done
      from checklist_template_ticks k
      join checklist_templates t on t.id = k.template_id
      where k.user_id = ${userId} and t.role = ${role} and t.cadence = 'daily' and t.active
        and k.period_key >= ${startKey} and k.period_key <= ${todayKey}
      group by k.period_key
    `.catch(() => []),
    teacher
      ? sql<{ schedule_type: string }[]>`
          select distinct schedule_type from groups
          where (teacher_id = ${userId} or assigned_ta_id = ${userId}) and schedule_type is not null
        `.catch(() => [])
      : Promise.resolve([] as { schedule_type: string }[]),
  ]);

  const dailyTotal = cur.daily.length;
  const doneMap = new Map(hist.map((h) => [h.period_key, h.done]));
  const parities = new Set(schedRows.map((r) => r.schedule_type));
  const isLessonDay = (key: string): boolean => {
    if (!teacher) return true;
    const p = weekdayParity(key);
    return p != null && parities.has(p);
  };
  const pctOf = (done: number) => (dailyTotal > 0 ? Math.round((done / dailyTotal) * 100) : 0);

  const trend: DayStat[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = addDaysToKey(todayKey, -i);
    const done = doneMap.get(date) ?? 0;
    trend.push({ date, done, total: dailyTotal, pct: pctOf(done), lesson: isLessonDay(date) });
  }
  const week = trend.slice(-7);

  const todayDone = cur.daily.filter((r) => r.done).length;

  // Streak: consecutive lesson-days (ending today) that were fully completed.
  // Today itself is still in progress, so an incomplete today doesn't break
  // the streak — it just doesn't extend it. Non-lesson days are skipped.
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const key = addDaysToKey(todayKey, -i);
    if (!isLessonDay(key)) continue;
    const done = doneMap.get(key) ?? 0;
    const full = dailyTotal > 0 && done >= dailyTotal;
    if (full) {
      streak++;
      continue;
    }
    if (i === 0) continue; // today not finished yet
    break;
  }

  return {
    dailyTotal,
    today: { done: todayDone, total: dailyTotal, pct: pctOf(todayDone), lesson: isLessonDay(todayKey) },
    week,
    trend,
    streak,
    weekly: { done: cur.weekly.filter((r) => r.done).length, total: cur.weekly.length },
    monthly: { done: cur.monthly.filter((r) => r.done).length, total: cur.monthly.length },
  };
}

export type TeamStatRow = {
  userId: string;
  name: string;
  role: string;
  done: number;
  total: number;
  pct: number;
  lesson: boolean;
};

/**
 * Today's daily-checklist completion for every active employee — the CEO/COO
 * team view (the old tracker's summary table). Only roles that actually have a
 * daily checklist appear. Teacher/assistant rows with no lesson today are kept
 * but flagged `lesson: false` so the table can show "dars yo'q" instead of 0%.
 */
export async function loadTeamChecklistStats(): Promise<TeamStatRow[]> {
  const todayKey = tashkentDayKey();
  const [profiles, roleTotals, ticks, teacherSet] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
      select id, first_name, last_name, role from profiles where is_active = true order by first_name asc
    `.catch(() => []),
    sql<{ role: string; n: number }[]>`
      select role, count(*)::int as n from checklist_templates
      where cadence = 'daily' and active group by role
    `.catch(() => []),
    sql<{ user_id: string; done: number }[]>`
      select k.user_id, count(*)::int as done
      from checklist_template_ticks k
      join checklist_templates t on t.id = k.template_id and t.cadence = 'daily' and t.active
      join profiles pr on pr.id = k.user_id and pr.role = t.role
      where k.period_key = ${todayKey}
      group by k.user_id
    `.catch(() => []),
    teacherIdsWithLessonOn(todayKey),
  ]);

  const totalByRole = new Map(roleTotals.map((r) => [r.role, r.n]));
  const doneByUser = new Map(ticks.map((r) => [r.user_id, r.done]));

  return profiles
    .map((p) => {
      const total = totalByRole.get(p.role) ?? 0;
      const done = doneByUser.get(p.id) ?? 0;
      const lesson = !isTeacherRole(p.role) || teacherSet.has(p.id);
      return {
        userId: p.id,
        name: `${p.first_name} ${p.last_name}`,
        role: p.role,
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
        lesson,
      };
    })
    .filter((r) => r.total > 0);
}
