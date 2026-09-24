import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { STRATEGY_ROLES } from '@/lib/nav';
import { tashkentDayKey } from '@/lib/time';
import { PerforceWorkspace, type PfData } from '@/components/strategy/perforce-workspace';

export const dynamic = 'force-dynamic';

export default async function PerforcePage() {
  const { profile } = await getAuthState();
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) notFound();

  const [spaces, stasks, tasks, issues, people, milestones] = await Promise.all([
    sql<PfData['spaces']>`select id, name, color, start_date, end_date from strategy_spaces order by sort_order, created_at`,
    sql<PfData['stasks']>`
      select id, space_id, title, description, workstream, assignee_id, start_date, end_date, status, priority, progress,
             roadmap_id, roadmap_node, created_at, done_at
      from strategy_tasks`,
    sql<PfData['tasks']>`
      select id, title, status, assigned_to, created_at, deadline, submitted_at, completed_at
      from tasks
      where created_at >= now() - interval '180 days' or status <> 'done'`,
    sql<PfData['issues']>`
      select id, title, status, assigned_to, created_at, resolved_at
      from issues
      where created_at >= now() - interval '180 days' or status <> 'done'`,
    sql<PfData['people']>`
      select id, first_name, last_name, avatar_url, role::text as role from profiles where is_active = true`,
    sql<PfData['milestones']>`select id, space_id, title, date from strategy_milestones order by date`,
  ]);

  return (
    <PerforceWorkspace
      data={{
        spaces: [...spaces],
        stasks: [...stasks],
        tasks: [...tasks],
        issues: [...issues],
        people: [...people],
        milestones: [...milestones],
      }}
      today={tashkentDayKey()}
    />
  );
}
