import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { STRATEGY_ROLES } from '@/lib/nav';
import { tashkentDayKey } from '@/lib/time';
import { loadBooks } from '@/lib/accounting-data';
import { addMonths } from '@/lib/accounting';
import { parsePlan } from '@/lib/ops-plan';
import { OperationsWorkspace, type OpsData } from '@/components/strategy/operations-workspace';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const { profile } = await getAuthState();
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) notFound();

  const [groups, leads, staff, metrics, entries, books, planRows, rooms, holds] = await Promise.all([
    sql<OpsData['groups']>`
      select g.id, g.name, coalesce(g.course_name, '') as course, g.schedule_type,
             coalesce(g.configuration->>'time', '') as time, coalesce(trim(g.configuration->>'room'), '') as room,
             coalesce(p.first_name || ' ' || p.last_name, '') as teacher, e.enrolled
      from groups g left join profiles p on p.id = g.teacher_id
      left join ops_group_enrollment e on e.group_id = g.id
      order by g.name`,
    sql<OpsData['leads']>`
      select id, name, phone, source, course, stage, note, created_at, enrolled_at, ai_intent, ai_hot
      from ops_leads order by created_at desc`,
    sql<OpsData['staff']>`
      select id, first_name || ' ' || last_name as name, role::text as role
      from profiles where is_active = true`,
    sql<OpsData['metrics']>`select id, staff_id, name, weight_percentage from kpi_metrics`,
    sql<OpsData['entries']>`
      select metric_id, left(month::text, 7) as month, target_value, actual_value
      from kpi_entries where left(month::text, 7) >= ${addMonths(tashkentDayKey().slice(0, 7), -13)}`,
    loadBooks(),
    sql<{ value: unknown }[]>`select value from ops_settings where key = 'plan'`,
    sql<OpsData['rooms']>`select code, title, capacity, note from ops_rooms order by sort, code`,
    sql<OpsData['holds']>`select id, room, slot_time as time, cohort, kind, title from ops_slot_holds`,
  ]);

  const data: OpsData = {
    groups: [...groups],
    leads: [...leads],
    staff: [...staff],
    metrics: [...metrics],
    entries: [...entries],
    rooms: [...rooms],
    holds: [...holds],
    plan: parsePlan(planRows[0]?.value),
  };
  return <OperationsWorkspace data={data} books={books} today={tashkentDayKey()} />;
}
