import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentDayKey, tashkentWeekKey, tashkentMonthKey } from '@/lib/time';
import { isTeacherRole, teacherIdsWithLessonOn } from '@/lib/teacher-schedule';

export type CadenceStat = { done: number; total: number };

export type TeamStatRow = {
  userId: string;
  name: string;
  role: string;
  /** Today's daily list. */
  daily: CadenceStat;
  /** This ISO week's weekly list. */
  weekly: CadenceStat;
  /** This month's monthly list. */
  monthly: CadenceStat;
  /** Teachers/assistants with no lesson today: daily is not required. */
  lesson: boolean;
};

/**
 * Checklist completion for every active employee — the CEO/COO team view:
 * today's daily, this week's weekly and this month's monthly list, each as
 * done/total (Asia/Tashkent periods, the same keys the ticks are saved with).
 * Only roles that have at least one checklist item appear. A tick counts only
 * while the item still belongs to the person's current role and is active.
 */
export async function loadTeamChecklistStats(): Promise<TeamStatRow[]> {
  const dayKey = tashkentDayKey();
  const weekKey = tashkentWeekKey();
  const monthKey = tashkentMonthKey();
  const [profiles, roleTotals, ticks, teacherSet] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
      select id, first_name, last_name, role from profiles where is_active = true order by first_name asc
    `.catch(() => []),
    sql<{ role: string; cadence: string; n: number }[]>`
      select role, cadence, count(*)::int as n from checklist_templates
      where active group by role, cadence
    `.catch(() => []),
    sql<{ user_id: string; cadence: string; done: number }[]>`
      select k.user_id, t.cadence, count(*)::int as done
      from checklist_template_ticks k
      join checklist_templates t on t.id = k.template_id and t.active
      join profiles pr on pr.id = k.user_id and pr.role = t.role
      where k.period_key = case t.cadence
        when 'daily' then ${dayKey}
        when 'weekly' then ${weekKey}
        else ${monthKey}
      end
      group by k.user_id, t.cadence
    `.catch(() => []),
    teacherIdsWithLessonOn(dayKey),
  ]);

  const totals = new Map(roleTotals.map((r) => [`${r.role}:${r.cadence}`, r.n]));
  const dones = new Map(ticks.map((r) => [`${r.user_id}:${r.cadence}`, r.done]));
  const stat = (p: { id: string; role: string }, c: 'daily' | 'weekly' | 'monthly'): CadenceStat => {
    const total = totals.get(`${p.role}:${c}`) ?? 0;
    return { done: Math.min(dones.get(`${p.id}:${c}`) ?? 0, total), total };
  };

  return profiles
    .map((p) => ({
      userId: p.id,
      name: `${p.first_name} ${p.last_name}`,
      role: p.role,
      daily: stat(p, 'daily'),
      weekly: stat(p, 'weekly'),
      monthly: stat(p, 'monthly'),
      lesson: !isTeacherRole(p.role) || teacherSet.has(p.id),
    }))
    .filter((r) => r.daily.total + r.weekly.total + r.monthly.total > 0);
}
