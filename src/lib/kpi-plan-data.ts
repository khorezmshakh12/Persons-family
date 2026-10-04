import 'server-only';
import { sql } from '@/lib/db/client';
import type { KpiItem, KpiPlan } from '@/lib/kpi-plan';

const PLAN_COLS = sql`
  id, user_id, month::text as month, status, scenarios, submitted_at, review_note, reviewed_at,
  pct_bad::float8 as pct_bad, pct_good::float8 as pct_good, pct_great::float8 as pct_great,
  self_result, self_note, grade, grade_pct::float8 as grade_pct, grade_amount::float8 as grade_amount,
  grade_note, graded_at`;

async function withItems(plans: Omit<KpiPlan, 'items'>[]): Promise<KpiPlan[]> {
  if (!plans.length) return [];
  const items = await sql<(KpiItem & { plan_id: string })[]>`
    select id, plan_id, title, kind, unit, target_bad, target_good, target_great, actual
    from kpi_items where plan_id in ${sql(plans.map((p) => p.id))} order by sort_order`;
  return plans.map((p) => ({
    ...p,
    items: items
      .filter((i) => i.plan_id === p.id)
      .map((i) => ({ id: i.id, title: i.title, kind: i.kind, unit: i.unit, target_bad: i.target_bad, target_good: i.target_good, target_great: i.target_great, actual: i.actual })),
  }));
}

/** The viewer's own plans, newest month first (last 12). */
export async function loadMyPlans(userId: string): Promise<KpiPlan[]> {
  const plans = await sql<Omit<KpiPlan, 'items'>[]>`
    select ${PLAN_COLS} from kpi_plans where user_id = ${userId} order by month desc limit 12`;
  return withItems(plans);
}

export type TeamMember = { id: string; first_name: string; last_name: string; role: string; avatar_url: string | null; salary: number | null };

/** Everyone who files a KPI (all active staff but the CEO), with their latest salary. */
export async function loadTeam(): Promise<TeamMember[]> {
  return sql<TeamMember[]>`
    select p.id, p.first_name, p.last_name, p.role::text as role, p.avatar_url,
      (select gross_amount::float8 from salary_months s where s.staff_id = p.id order by period desc limit 1) as salary
    from profiles p
    where p.is_active and p.role <> 'ceo'
    order by p.first_name, p.last_name`;
}

/** Every plan for the given months (reviewer view). */
export async function loadPlansFor(months: string[]): Promise<KpiPlan[]> {
  const plans = await sql<Omit<KpiPlan, 'items'>[]>`
    select ${PLAN_COLS} from kpi_plans where month in ${sql(months)} order by month desc`;
  return withItems(plans);
}
