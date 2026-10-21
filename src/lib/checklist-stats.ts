import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentDayKey } from '@/lib/time';
import { isTeacherRole, teacherIdsWithLessonOn } from '@/lib/teacher-schedule';

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
