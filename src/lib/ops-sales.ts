import 'server-only';
import { sql } from '@/lib/db/client';
import type { MessageTemplate } from '@/lib/ops-students';

// Operation HQ › Sales (2026-10-22): the CRM leads as a kanban. Stages are
// crm_lead_sections; a lead with no section that came from the Telegram bot
// sits in the «Telegram» column. Closed leads (joined / lost) show for 60 days.

export type SalesStage = { id: string; name: string; kind: string; sort: number };
export type SalesGroup = { id: string; name: string; color: string };
export type SalesLead = {
  id: string;
  name: string;
  phone: string;
  age: number | null;
  course: string;
  groupId: string | null;
  sectionId: string | null;
  source: string;
  tg: boolean;
  tgUser: string;
  ownerId: string | null;
  owner: string;
  createdAt: string;
  stageAt: string;
  firstContactAt: string | null;
  nextAction: string;
  nextAt: string | null;
  lostReason: string;
  trialDate: string | null;
  trialTime: string;
  studentId: string | null;
  comments: number;
};
export type SalesData = {
  stages: SalesStage[];
  groups: SalesGroup[];
  leads: SalesLead[];
  archived: { id: string; name: string; phone: string; at: string; by: string }[];
  courses: string[];
  staff: { id: string; name: string }[];
  templates: MessageTemplate[];
  stats: {
    lostReasons: { reason: string; n: number }[];
    sources: { source: string; leads: number; won: number }[];
  };
};

export const emptySalesData = (): SalesData => ({
  stages: [],
  groups: [],
  leads: [],
  archived: [],
  courses: [],
  staff: [],
  templates: [],
  stats: { lostReasons: [], sources: [] },
});

export async function loadSalesData(): Promise<SalesData> {
  const [stages, groups, leads, archived, courses, staff, templates, lostReasons, sources] = await Promise.all([
    sql<SalesStage[]>`select id, name, kind, sort from crm_lead_sections where archived_at is null order by sort, created_at`,
    sql<SalesGroup[]>`select id, name, color from crm_lead_groups order by sort, created_at`,
    sql<SalesLead[]>`
      select l.id, coalesce(l.name, '') as name, coalesce(l.phone, '') as phone, l.age, coalesce(c.name, '') as course,
        l.group_id as "groupId", l.section_id as "sectionId", coalesce(l.source, '') as source,
        l.telegram_chat_id is not null as tg, coalesce(l.telegram_username, '') as "tgUser",
        l.owner_id as "ownerId", coalesce(p.first_name || ' ' || p.last_name, '') as owner,
        l.created_at::text as "createdAt", l.stage_at::text as "stageAt", l.first_contact_at::text as "firstContactAt",
        coalesce(l.next_action, '') as "nextAction", l.next_at::text as "nextAt", coalesce(l.lost_reason, '') as "lostReason",
        l.trial_date::text as "trialDate", coalesce(l.trial_time, '') as "trialTime", l.converted_student_id as "studentId",
        (select count(*)::int from crm_lead_activities a where a.lead_id = l.id and a.kind = 'note') as comments
      from crm_leads l
      left join crm_courses c on c.id = l.course_id
      left join profiles p on p.id = l.owner_id
      left join crm_lead_sections s on s.id = l.section_id
      where l.archived_at is null
        and (coalesce(s.kind, '') not in ('joined', 'lost') or l.stage_at >= now() - interval '60 days')
      order by l.created_at desc`,
    sql<SalesData['archived']>`
      select * from (
        select l.id, coalesce(l.name, '') as name, coalesce(l.phone, '') as phone, l.archived_at::text as at,
          coalesce(p.first_name || ' ' || p.last_name, '') as by
        from crm_leads l left join profiles p on p.id = l.archived_by
        where l.archived_at is not null order by l.archived_at desc limit 100
      ) x order by at desc`,
    sql<{ name: string }[]>`select name from crm_courses where archived_at is null order by name`,
    sql<SalesData['staff']>`select id, first_name || ' ' || last_name as name from profiles where is_active order by first_name, last_name`,
    sql<MessageTemplate[]>`select id, name, body, trigger from crm_message_templates where audience = 'lead' order by sort, name`,
    sql<{ reason: string; n: number }[]>`
      select lost_reason as reason, count(*)::int as n from crm_leads
      where lost_reason is not null and stage_at >= now() - interval '90 days' group by 1 order by 2 desc`,
    sql<{ source: string; leads: number; won: number }[]>`
      select coalesce(nullif(source, ''), 'other') as source, count(*)::int as leads,
        count(*) filter (where status = 'won' or converted_student_id is not null)::int as won
      from crm_leads where created_at >= now() - interval '30 days' group by 1 order by 2 desc`,
  ]);
  return {
    stages: [...stages],
    groups: [...groups],
    leads: [...leads],
    archived: [...archived],
    courses: courses.map((c) => c.name),
    staff: [...staff],
    templates: [...templates],
    stats: { lostReasons: [...lostReasons], sources: [...sources] },
  };
}
