import { notFound } from 'next/navigation';
import { canFor, canSeeFor } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';

import { parsePlan } from '@/lib/ops-plan';
import { tashkentDayKey } from '@/lib/time';
import { isTeacherRole, weekdayParity } from '@/lib/teacher-schedule';
import { OperationsWorkspace, type OpsData } from '@/components/strategy/operations-workspace';
import { OpsCrmSummary } from '@/components/operations/ops-crm-summary';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) notFound();

  const day = tashkentDayKey();
  const [groups, leads, staff, planRows, rooms, holds, availability, log, attendance, subs] = await Promise.all([
    sql<OpsData['groups']>`
      select g.id, g.name, coalesce(g.course_name, '') as course, g.schedule_type,
             coalesce(g.configuration->>'time', '') as time, coalesce(trim(g.configuration->>'room'), '') as room,
             coalesce(p.first_name || ' ' || p.last_name, '') as teacher, e.enrolled,
             g.teacher_id, coalesce((g.configuration->>'duration')::int, 90) as duration
      from groups g left join profiles p on p.id = g.teacher_id
      left join ops_group_enrollment e on e.group_id = g.id
      order by g.name`,
    // Demand comes from the CRM leads (one source with CRM › Lidlar and the
    // Telegram bot); the overview needs this month, last month and 90 days.
    sql<OpsData['leads']>`
      select l.id, coalesce(c.name, '') as course, l.created_at::text as created_at
      from crm_leads l left join crm_courses c on c.id = l.course_id
      where l.created_at >= now() - interval '100 days'`.catch(() => []),
    sql<OpsData['staff']>`
      select id, first_name || ' ' || last_name as name, role::text as role
      from profiles where is_active = true`,
    sql<{ value: unknown }[]>`select value from ops_settings where key = 'plan'`,
    sql<OpsData['rooms']>`select code, title, capacity, note, coalesce(features, '{}') as features from ops_rooms order by sort, code`,
    sql<OpsData['holds']>`select id, room, slot_time as time, cohort, kind, title from ops_slot_holds`,
    sql<OpsData['availability']>`select teacher_id, cohort, start_time as start, end_time as end from ops_teacher_availability`.catch(() => []),
    sql<OpsData['log']>`
      select l.id, l.group_id, g.name as group_name, l.before, l.after, l.created_at::text as at,
        coalesce(p.first_name || ' ' || p.last_name, '') as actor
      from ops_schedule_log l join groups g on g.id = l.group_id left join profiles p on p.id = l.actor
      order by l.created_at desc limit 40`.catch(() => []),
    sql<OpsData['today']['attendance']>`
      select profile_id, status, coalesce(check_in, '') as check_in from staff_attendance where day = ${day}`.catch(() => []),
    sql<OpsData['today']['subs']>`select group_id, teacher_id from ops_substitutions where day = ${day}`.catch(() => []),
  ]);

  const data: OpsData = {
    groups: [...groups],
    leads: [...leads],
    staff: [...staff],
    rooms: [...rooms],
    holds: [...holds],
    plan: parsePlan(planRows[0]?.value),
    availability: [...availability],
    log: [...log],
    meId: profile.id,
    canEdit: canFor(profile, 'operations.edit'),
    today: {
      day,
      cohort: weekdayParity(day),
      attendance: [...attendance],
      subs: [...subs],
      teacherIds: staff.filter((s) => isTeacherRole(s.role)).map((s) => s.id),
    },
  };
  return <OperationsWorkspace data={data} crm={<OpsCrmSummary />} />;
}
