import { sql } from '@/lib/db/client';
import { tashkentDayKey, tashkentWeekKey, tashkentMonthKey } from '@/lib/time';

// Rol bo'yicha checklist shablonlari + joriy davr belgisi (done). Kunlik belgi
// bugungi kun, haftalik joriy ISO hafta, oylik joriy oy bo'yicha (Asia/Tashkent).

export type Cadence = 'daily' | 'weekly' | 'monthly';
export type ChecklistRow = {
  id: string;
  cadence: Cadence;
  title: string;
  detail: string;
  sort: number;
  done: boolean;
};
export type ChecklistData = { daily: ChecklistRow[]; weekly: ChecklistRow[]; monthly: ChecklistRow[] };

export async function loadChecklist(userId: string, role: string): Promise<ChecklistData> {
  const dayKey = tashkentDayKey();
  const weekKey = tashkentWeekKey();
  const monthKey = tashkentMonthKey();
  const rows = await sql<ChecklistRow[]>`
    select t.id, t.cadence, t.title, t.detail, t.sort,
      (k.template_id is not null) as done
    from checklist_templates t
    left join checklist_template_ticks k
      on k.template_id = t.id
      and k.user_id = ${userId}
      and k.period_key = case t.cadence
        when 'daily' then ${dayKey}
        when 'weekly' then ${weekKey}
        else ${monthKey}
      end
    where t.role = ${role} and t.active
    order by t.cadence, t.sort, t.created_at
  `.catch(() => []);

  const out: ChecklistData = { daily: [], weekly: [], monthly: [] };
  for (const r of rows) {
    if (r.cadence === 'daily' || r.cadence === 'weekly' || r.cadence === 'monthly') {
      out[r.cadence].push(r);
    }
  }
  return out;
}
