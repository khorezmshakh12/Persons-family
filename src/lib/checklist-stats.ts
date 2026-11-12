import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentDayKey, tashkentWeekKey, addDaysToKey } from '@/lib/time';
import { isTeacherRole, weekdayParity } from '@/lib/teacher-schedule';

export type CadenceStat = { done: number; total: number };

export type TeamItem = { id: string; cadence: 'daily' | 'weekly' | 'monthly'; title: string; done: boolean };

export type TeamStatRow = {
  /** userId:role — one row per position a person holds. */
  key: string;
  userId: string;
  name: string;
  role: string;
  /** The chosen day's daily list. */
  daily: CadenceStat;
  /** Daily list over the chosen day's ISO week, up to that day (lesson days only for teachers). */
  dailyWeek: CadenceStat;
  /** Daily list over the chosen day's month, up to that day. */
  dailyMonth: CadenceStat;
  /** The week's weekly list. */
  weekly: CadenceStat;
  /** The month's monthly list. */
  monthly: CadenceStat;
  /** Teachers/assistants with no lesson that day: daily is not required. */
  lesson: boolean;
  /** Every item of the role with its tick state for that day/week/month. */
  items: TeamItem[];
};

/** Noon of a Tashkent day, so key helpers that take an instant land on that day. */
const atNoon = (dayKey: string) => new Date(`${dayKey}T12:00:00+05:00`);

/**
 * Checklist completion for every active employee on a chosen day — the
 * CEO/COO team view. One row per (person, position): ticks are saved under
 * the ACTIVE role, so a person holding extra positions (profile_roles) gets a
 * row for each role that has checklist items. Daily = that day, weekly = its
 * ISO week, monthly = its month; dailyWeek/dailyMonth add up the daily list
 * over the week/month so far (only days the person had a lesson, for teachers).
 */
export async function loadTeamChecklistStats(dayKey: string = tashkentDayKey()): Promise<TeamStatRow[]> {
  const weekKey = tashkentWeekKey(atNoon(dayKey));
  const monthKey = dayKey.slice(0, 7);
  // Days of the week (Mon..dayKey) and of the month (1st..dayKey).
  const dow = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDaysToKey(dayKey, -dow);
  const monthStart = `${monthKey}-01`;
  const from = weekStart < monthStart ? weekStart : monthStart;

  const [people, templates, ticks, groups] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
      select p.id, p.first_name, p.last_name, p.role::text as role from profiles p where p.is_active = true
      union
      select p.id, p.first_name, p.last_name, r.role::text from profile_roles r
      join profiles p on p.id = r.user_id and p.is_active = true
    `.catch(() => []),
    sql<{ id: string; role: string; cadence: TeamItem['cadence']; title: string }[]>`
      select id, role, cadence, title from checklist_templates where active order by cadence, sort, created_at
    `.catch(() => []),
    sql<{ template_id: string; user_id: string; period_key: string }[]>`
      select k.template_id, k.user_id, k.period_key from checklist_template_ticks k
      join checklist_templates t on t.id = k.template_id and t.active
      where (t.cadence = 'daily' and k.period_key between ${from} and ${dayKey})
         or (t.cadence = 'weekly' and k.period_key = ${weekKey})
         or (t.cadence = 'monthly' and k.period_key = ${monthKey})
    `.catch(() => []),
    sql<{ teacher_id: string | null; assigned_ta_id: string | null; schedule_type: string }[]>`
      select teacher_id, assigned_ta_id, schedule_type from groups
    `.catch(() => []),
  ]);

  // Which parities each teacher/assistant has lessons on.
  const parities = new Map<string, Set<string>>();
  for (const g of groups) {
    for (const id of [g.teacher_id, g.assigned_ta_id]) {
      if (!id) continue;
      if (!parities.has(id)) parities.set(id, new Set());
      parities.get(id)!.add(g.schedule_type);
    }
  }
  const hasLesson = (userId: string, day: string) => {
    const p = weekdayParity(day);
    return !!p && !!parities.get(userId)?.has(p);
  };

  type Tpl = { id: string; role: string; cadence: TeamItem['cadence']; title: string };
  const byRole = new Map<string, Tpl[]>();
  for (const t of templates) {
    if (!byRole.has(t.role)) byRole.set(t.role, []);
    byRole.get(t.role)!.push(t);
  }
  const tickSet = new Set(ticks.map((k) => `${k.user_id}|${k.template_id}|${k.period_key}`));
  const ticked = (u: string, t: string, key: string) => tickSet.has(`${u}|${t}|${key}`);

  // Days counted into the week / month aggregates.
  const daysFrom = (start: string) => {
    const out: string[] = [];
    for (let d = start; d <= dayKey; d = addDaysToKey(d, 1)) out.push(d);
    return out;
  };
  const weekDays = daysFrom(weekStart);
  const monthDays = daysFrom(monthStart);

  const rows: TeamStatRow[] = [];
  for (const p of people) {
    const list = byRole.get(p.role);
    if (!list?.length) continue;
    const teacher = isTeacherRole(p.role);
    const required = (day: string) => !teacher || hasLesson(p.id, day);
    const daily = list.filter((t) => t.cadence === 'daily');
    const weekly = list.filter((t) => t.cadence === 'weekly');
    const monthly = list.filter((t) => t.cadence === 'monthly');

    const dailyOver = (days: string[]): CadenceStat => {
      let done = 0;
      let total = 0;
      for (const d of days) {
        if (!required(d)) continue;
        total += daily.length;
        done += daily.filter((t) => ticked(p.id, t.id, d)).length;
      }
      return { done, total };
    };
    const count = (ts: Tpl[], key: string): CadenceStat => ({
      done: ts.filter((t) => ticked(p.id, t.id, key)).length,
      total: ts.length,
    });
    const keyOf = (c: TeamItem['cadence']) => (c === 'daily' ? dayKey : c === 'weekly' ? weekKey : monthKey);

    rows.push({
      key: `${p.id}:${p.role}`,
      userId: p.id,
      name: `${p.first_name} ${p.last_name}`,
      role: p.role,
      daily: count(daily, dayKey),
      dailyWeek: dailyOver(weekDays),
      dailyMonth: dailyOver(monthDays),
      weekly: count(weekly, weekKey),
      monthly: count(monthly, monthKey),
      lesson: required(dayKey),
      items: list.map((t) => ({ id: t.id, cadence: t.cadence, title: t.title, done: ticked(p.id, t.id, keyOf(t.cadence)) })),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
