import { notFound } from 'next/navigation';
import { canFor, canSeeFor } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';

import { parsePlan } from '@/lib/ops-plan';
import { addDaysToKey, tashkentDayKey, tashkentMonthKey } from '@/lib/time';
import { isTeacherRole, weekdayParity } from '@/lib/teacher-schedule';
import { OperationsWorkspace, type OpsData } from '@/components/strategy/operations-workspace';
import { OpsCrmSummary } from '@/components/operations/ops-crm-summary';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) notFound();

  const day = tashkentDayKey();
  const month = tashkentMonthKey();
  const seePay = canFor(profile, 'finance.viewAll');
  const [groups, leads, staff, planRows, rooms, holds, availability, log, attendance, subs, crm, salaries, calendar, students, billing] = await Promise.all([
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
    // CRM per group name: active students, their monthly tariffs, and what
    // was paid this month — matched to the schedule's groups by name.
    sql<{ key: string; students: number; expected: number; paid: number }[]>`
      with st as (
        select lower(trim(g.name)) as k,
          count(e.id) filter (where e.status = 'active')::int as students,
          coalesce(sum(e.tariff_amount) filter (where e.status = 'active'), 0)::numeric as expected
        from crm_groups g left join crm_enrollments e on e.group_id = g.id
        group by 1
      ), pd as (
        select lower(trim(g.name)) as k, sum(case when p.is_refund then -p.amount else p.amount end)::numeric as paid
        from crm_payments p join crm_enrollments e on e.id = p.enrollment_id join crm_groups g on g.id = e.group_id
        where to_char(p.paid_at, 'YYYY-MM') = ${month}
        group by 1
      )
      select st.k as key, st.students, st.expected, coalesce(pd.paid, 0)::numeric as paid
      from st left join pd on pd.k = st.k`.catch(() => []),
    // Teacher pay is only read for those who may see salaries.
    seePay
      ? sql<{ id: string; salary: number }[]>`select id, monthly_salary as salary from profiles where is_active and monthly_salary > 0`.catch(() => [])
      : Promise.resolve([] as { id: string; salary: number }[]),
    sql<OpsData['calendar']>`
      select id, day::text as day, kind, title, group_id, time, room from ops_calendar
      where day between ${addDaysToKey(day, -7)} and ${addDaysToKey(day, 60)}
      order by day, time nulls first`.catch(() => []),
    // O'quvchilar: every CRM student with a phone, balance and open enrollments.
    sql<OpsData['students']>`
      select s.id, s.full_name as name, s.status, s.balance,
        coalesce((select c.phone from crm_contacts c where c.student_id = s.id and coalesce(c.phone, '') <> ''
          order by c.is_primary desc, c.created_at limit 1), '') as phone,
        exists (select 1 from crm_contacts c where c.student_id = s.id and c.telegram_chat_id is not null) as tg,
        coalesce((select json_agg(json_build_object('id', e.id, 'group', g.name, 'fee', e.tariff_amount,
            'activation', e.activation_date::text, 'status', e.status) order by e.activation_date)
          from crm_enrollments e join crm_groups g on g.id = e.group_id
          where e.student_id = s.id and e.status in ('active', 'frozen')), '[]'::json) as enrollments
      from crm_students s where s.archived_at is null
      order by s.full_name`.catch(() => []),
    sql<OpsData['billing'][]>`
      select enabled, start_date::text as "startDate", remind_days as "remindDays" from crm_billing_settings where id`.catch(() => []),
  ]);

  // One source for head counts: a group the CRM knows by name takes its
  // active-student count from there (the manual number stays as fallback).
  const byKey = new Map(crm.map((c) => [c.key, c]));
  const crmOf = (name: string) => byKey.get(name.trim().toLowerCase());

  const data: OpsData = {
    groups: groups.map((g) => {
      const c = crmOf(g.name);
      return c ? { ...g, enrolled: c.students } : g;
    }),
    leads: [...leads],
    staff: [...staff],
    rooms: [...rooms],
    holds: [...holds],
    plan: parsePlan(planRows[0]?.value),
    availability: [...availability],
    log: [...log],
    meId: profile.id,
    canEdit: canFor(profile, 'operations.edit'),
    money: groups.flatMap((g) => {
      const c = crmOf(g.name);
      return c ? [{ groupId: g.id, students: c.students, expected: c.expected, paid: c.paid }] : [];
    }),
    salaries: seePay ? Object.fromEntries(salaries.map((r) => [r.id, r.salary])) : null,
    calendar: [...calendar],
    students: students.map((s) => ({ ...s, enrollments: s.enrollments.map((e) => ({ ...e, fee: Number(e.fee) })) })),
    billing: billing[0] ?? { enabled: false, startDate: day, remindDays: 3 },
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
